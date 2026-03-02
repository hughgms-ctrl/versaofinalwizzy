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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[ERROR] No Authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
    const uazapiAdminToken = Deno.env.get('UAZAPI_ADMIN_TOKEN') || '';
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

    console.log(`[DEBUG] Disconnecting instance ${instance.id} (Token: ${instance.zapi_token?.substring(0, 8)}...)`);

    // UAZAPI Disconnect
    if (instance.zapi_token) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const disconnectResp = await fetch(uazapiUrl(uazapiBaseUrl, '/instance/disconnect'), {
          method: 'POST',
          headers: { 'token': instance.zapi_token },
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        console.log(`[DEBUG] UAZAPI Disconnect Status: ${disconnectResp.status}`);
      } catch (e) {
        console.error('UAZAPI disconnect timeout or error (non-blocking):', e);
      }
    }

    // Always update database to reflect disconnection in UI
    await supabase.from('whatsapp_instances').update({
      status: 'disconnected',
      disconnected_at: new Date().toISOString(),
      is_active: false,
    }).eq('id', instance.id);

    console.log('[DEBUG] Database updated to disconnected');

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in zapi-disconnect:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
