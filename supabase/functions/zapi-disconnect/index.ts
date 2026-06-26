import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeBaseUrl(value?: string | null): string {
  return (value || '').trim().replace(/\/$/, '');
}

function uazapiUrl(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

// Load WhatsApp connection settings with the same precedence used across the
// codebase (platform_settings first, env vars as fallback). Calling the wrong
// base URL is why a "disconnect" never reached the provider.
async function loadConnectionSettings(supabase: any) {
  const { data: row } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'whatsapp_connection_settings')
    .maybeSingle();
  const value = row?.value || {};
  return {
    uazapiBaseUrl: normalizeBaseUrl(value.uazapi_base_url || Deno.env.get('UAZAPI_BASE_URL')),
    evolutionBaseUrl: normalizeBaseUrl(value.evolution_base_url || Deno.env.get('EVOLUTION_BASE_URL')),
    evolutionApiKey: value.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY') || '',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[ERROR] No Authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('[ERROR] Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Invalid token', details: userError?.message }), {
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

    const url = new URL(req.url);
    let requestedInstanceId = url.searchParams.get('instanceId');
    if (!requestedInstanceId && req.method === 'POST') {
      try { const body = await req.json(); requestedInstanceId = body.instanceId || null; } catch { }
    }

    let instance;
    if (requestedInstanceId) {
      const { data } = await supabase.from('whatsapp_instances').select('*')
        .eq('id', requestedInstanceId).eq('organization_id', profile.organization_id).maybeSingle();
      instance = data;
    } else {
      const { data } = await supabase.from('whatsapp_instances').select('*')
        .eq('organization_id', profile.organization_id).order('created_at', { ascending: true }).limit(1).maybeSingle();
      instance = data;
    }

    if (!instance) {
      return new Response(JSON.stringify({ error: 'Instance not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const provider = (instance.provider || 'uazapi') === 'evolution' ? 'evolution' : 'uazapi';
    console.log(`[DEBUG] Disconnecting instance ${instance.id} (provider=${provider})`);

    const settings = await loadConnectionSettings(supabase);
    let providerOk = false;
    let providerError: string | null = null;

    if (provider === 'evolution') {
      // Evolution: logout the session at DELETE /instance/logout/{instanceName}
      const instanceName =
        instance.evolution_instance_name || instance.zapi_instance_id || instance.evolution_instance_id || '';
      const apiKey = instance.evolution_api_key || settings.evolutionApiKey || instance.zapi_token || '';
      if (settings.evolutionBaseUrl && apiKey && instanceName) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          const resp = await fetch(`${settings.evolutionBaseUrl}/instance/logout/${instanceName}`, {
            method: 'DELETE',
            headers: { apikey: apiKey },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          providerOk = resp.ok;
          if (!resp.ok) providerError = `Evolution logout HTTP ${resp.status}: ${await resp.text()}`;
          console.log(`[DEBUG] Evolution logout status: ${resp.status}`);
        } catch (e) {
          providerError = `Evolution logout error: ${String(e)}`;
          console.error(providerError);
        }
      } else {
        providerError = 'Evolution config incompleta (baseUrl/apiKey/instanceName)';
        console.error(providerError);
      }
    } else if (instance.zapi_token) {
      // UAZAPI: disconnect the session at POST /instance/disconnect
      if (settings.uazapiBaseUrl) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          const resp = await fetch(uazapiUrl(settings.uazapiBaseUrl, '/instance/disconnect'), {
            method: 'POST',
            headers: { token: instance.zapi_token },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          providerOk = resp.ok;
          if (!resp.ok) providerError = `UAZAPI disconnect HTTP ${resp.status}: ${await resp.text()}`;
          console.log(`[DEBUG] UAZAPI disconnect status: ${resp.status}`);
        } catch (e) {
          providerError = `UAZAPI disconnect error: ${String(e)}`;
          console.error(providerError);
        }
      } else {
        providerError = 'UAZAPI base URL nao configurada';
        console.error(providerError);
      }
    }

    // Always update database to reflect disconnection in UI
    await supabase.from('whatsapp_instances').update({
      status: 'disconnected',
      disconnected_at: new Date().toISOString(),
      is_active: false,
    }).eq('id', instance.id);

    console.log('[DEBUG] Database updated to disconnected');

    return new Response(JSON.stringify({
      success: true,
      provider,
      providerDisconnected: providerOk,
      providerError,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in zapi-disconnect:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
