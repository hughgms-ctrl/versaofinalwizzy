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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
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

    if (!instance || !instance.zapi_token) {
      return new Response(JSON.stringify({ error: 'Instance not found or not configured' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      await fetch(uazapiUrl(uazapiBaseUrl, '/instance/disconnect'), {
        method: 'POST',
        headers: { 'token': instance.zapi_token }
      });
    } catch (e) {
      console.error('UAZAPI disconnect error:', e);
    }

    await supabase.from('whatsapp_instances').update({
      status: 'disconnected', disconnected_at: new Date().toISOString(), is_active: false,
    }).eq('id', instance.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
