import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function uazapiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${path}`;
}

function normalizeBaseUrl(value?: string | null): string {
  return (value || '').trim().replace(/\/$/, '');
}

async function loadConnectionSettings(supabase: any, supabaseUrl: string) {
  const { data: row } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'whatsapp_connection_settings')
    .maybeSingle();
  const value = row?.value || {};
  return {
    webhookUrl: String(value.webhook_url || `${supabaseUrl}/functions/v1/zapi-webhook`).trim(),
    uazapiBaseUrl: normalizeBaseUrl(value.uazapi_base_url || Deno.env.get('UAZAPI_BASE_URL')),
    evolutionBaseUrl: normalizeBaseUrl(value.evolution_base_url || Deno.env.get('EVOLUTION_BASE_URL')),
    evolutionApiKey: value.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY') || '',
  };
}

async function readResponse(response: Response) {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { raw };
  }
}

async function configureUazapiWebhook(instance: any, webhookUrl: string, uazapiBaseUrl: string) {
  if (!uazapiBaseUrl || !instance.zapi_token) {
    return { success: false, provider: 'uazapi', error: 'UAZAPI not configured for instance' };
  }

  const webhookBody = {
    url: webhookUrl,
    enabled: true,
    base64: true,
    media: true,
    events: ["messages", "connection", "history", "presence", "ChatPresence", "chatpresence", "status", "documents", "media", "chat"],
    subscribe: ["Message", "ReadReceipt", "ChatPresence", "HistorySync"],
  };

  const webhookEndpoints = [
    uazapiUrl(uazapiBaseUrl, '/instance/webhook'),
    uazapiUrl(uazapiBaseUrl, '/webhook'),
  ];

  let lastError = '';
  for (const endpoint of webhookEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
        body: JSON.stringify(webhookBody),
      });
      const responseData = await readResponse(response);
      if (response.ok) {
        return { success: true, provider: 'uazapi', endpoint, response: responseData };
      }
      lastError = `${response.status}: ${JSON.stringify(responseData)}`;
    } catch (error) {
      lastError = String(error);
      console.error(`[WEBHOOK_CONFIG] UAZAPI endpoint failed: ${endpoint}`, error);
    }
  }

  return { success: false, provider: 'uazapi', error: lastError || 'Failed to configure UAZAPI webhook' };
}

async function configureEvolutionWebhook(
  instance: any,
  webhookUrl: string,
  evolutionBaseUrl: string,
  defaultApiKey: string,
) {
  const instanceName = instance.evolution_instance_name || instance.zapi_instance_id;
  const apiKey = instance.evolution_api_key || defaultApiKey || instance.zapi_token;
  if (!evolutionBaseUrl || !apiKey || !instanceName) {
    return { success: false, provider: 'evolution', error: 'Evolution API not configured for instance' };
  }

  const webhookConfig = {
    enabled: true,
    url: webhookUrl,
    webhookByEvents: false,
    webhookBase64: true,
    byEvents: false,
    base64: true,
    events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'PRESENCE_UPDATE'],
  };

  const attempts = [
    {
      endpoint: `${evolutionBaseUrl}/webhook/set/${instanceName}`,
      body: { webhook: webhookConfig },
    },
    {
      endpoint: `${evolutionBaseUrl}/webhook/set/${instanceName}`,
      body: webhookConfig,
    },
  ];

  let lastError = '';
  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify(attempt.body),
      });
      const responseData = await readResponse(response);
      if (response.ok) {
        return { success: true, provider: 'evolution', endpoint: attempt.endpoint, response: responseData };
      }
      lastError = `${response.status}: ${JSON.stringify(responseData)}`;
    } catch (error) {
      lastError = String(error);
      console.error(`[WEBHOOK_CONFIG] Evolution endpoint failed: ${attempt.endpoint}`, error);
    }
  }

  return { success: false, provider: 'evolution', error: lastError || 'Failed to configure Evolution webhook' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const connectionSettings = await loadConnectionSettings(supabase, supabaseUrl);

    let organizationId: string | null = null;

    // Try to parse body for organization_id (service-role call)
    let bodyData: any = {};
    try { bodyData = await req.json(); } catch { /* empty body is ok */ }

    const authHeader = req.headers.get('Authorization');

    if (bodyData.organization_id) {
      // Direct call with org id (service role)
      organizationId = bodyData.organization_id;
    } else if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: profile } = await supabase
        .from('profiles').select('organization_id').eq('user_id', user.id).single();
      if (!profile) {
        return new Response(JSON.stringify({ error: 'Profile not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      organizationId = profile.organization_id;
    } else {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let instanceQuery = supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', organizationId)
      .not('zapi_token', 'is', null);

    if (bodyData.instanceId) {
      instanceQuery = instanceQuery.eq('id', bodyData.instanceId);
    }

    const { data: instances } = await instanceQuery;

    if (!instances?.length) {
      return new Response(JSON.stringify({ error: 'WhatsApp instance not configured' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const webhookUrl = connectionSettings.webhookUrl;
    console.log(`Configuring webhook URL: ${webhookUrl}`);

    const results = [];
    for (const instance of instances) {
      const provider = instance.provider === 'evolution' ? 'evolution' : 'uazapi';
      const result = provider === 'evolution'
        ? await configureEvolutionWebhook(
          instance,
          webhookUrl,
          connectionSettings.evolutionBaseUrl,
          connectionSettings.evolutionApiKey,
        )
        : await configureUazapiWebhook(
          instance,
          webhookUrl,
          connectionSettings.uazapiBaseUrl,
        );

      results.push({
        instanceId: instance.id,
        label: instance.label,
        externalId: provider === 'evolution'
          ? (instance.evolution_instance_name || instance.zapi_instance_id)
          : instance.zapi_instance_id,
        ...result,
      });
    }

    const success = results.some((result) => result.success);
    console.log('Webhook config results:', JSON.stringify(results));

    return new Response(JSON.stringify({
      success,
      webhookUrl,
      results,
    }), {
      status: success ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
