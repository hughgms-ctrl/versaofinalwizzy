import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function uazapiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${path}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    const { data: instance } = await supabase
      .from('whatsapp_instances').select('*')
      .eq('organization_id', organizationId)
      .not('zapi_token', 'is', null)
      .limit(1).maybeSingle();

    if (!instance || !instance.zapi_token) {
      return new Response(JSON.stringify({ error: 'WhatsApp instance not configured' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;
    console.log(`Configuring webhook URL: ${webhookUrl}`);

    const webhookBody = {
      url: webhookUrl,
      enabled: true,
      base64: true,
      media: true,
      events: ["messages", "connection", "history", "presence", "ChatPresence", "chatpresence", "status", "documents", "media", "chat"],
      subscribe: ["Message", "ReadReceipt", "ChatPresence", "HistorySync"],
    };

    // Try multiple possible webhook endpoints for V1/V2 compatibility
    const webhoolsEndpoints = [
      uazapiUrl(uazapiBaseUrl, '/instance/webhook'),
      uazapiUrl(uazapiBaseUrl, '/webhook'),
    ];

    let webhookResponse: Response | null = null;
    let successfulUrl = '';

    for (const endpoint of webhoolsEndpoints) {
      console.log(`[DEBUG] Attempting to set webhook at: ${endpoint}`);
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
          body: JSON.stringify(webhookBody),
        });
        if (resp.ok) {
          webhookResponse = resp;
          successfulUrl = endpoint;
          break;
        }
      } catch (e) {
        console.error(`[DEBUG] Webhook endpoint ${endpoint} failed:`, e);
      }
    }

    if (!webhookResponse) {
      return new Response(JSON.stringify({ error: 'Failed to configure webhook on all endpoints' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const responseData = await webhookResponse.json();
    console.log('Webhook set response:', responseData);

    return new Response(JSON.stringify({
      success: webhookResponse.ok, webhookUrl, response: responseData,
    }), {
      status: webhookResponse.ok ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
