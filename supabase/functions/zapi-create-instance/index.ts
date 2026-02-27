import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const uazapiBaseUrl = (Deno.env.get('UAZAPI_BASE_URL') || '').replace(/\/$/, '');
    const uazapiAdminToken = Deno.env.get('UAZAPI_ADMIN_TOKEN') || '';

    if (!uazapiBaseUrl || !uazapiAdminToken) {
      return new Response(JSON.stringify({ error: 'UAZAPI not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if there's an existing instance with a valid token we can reuse
    const { data: existingInstance } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingInstance?.zapi_token && existingInstance.zapi_instance_id) {
      // Validate the existing token
      try {
        const statusResp = await fetch(`${uazapiBaseUrl}/instance/status`, {
          method: 'GET',
          headers: { token: existingInstance.zapi_token },
        });
        if (statusResp.ok) {
          console.log('Reusing existing instance:', existingInstance.id);
          return new Response(JSON.stringify({
            success: true,
            instanceId: existingInstance.id,
            status: existingInstance.status,
            reused: true,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (e) {
        console.log('Existing token validation failed, creating new instance:', e);
      }
    }

    // Create new instance via UAZAPI using the winning auth method:
    // POST /instance/init with header { admintoken: <admin_token> }
    const instanceName = `org-${profile.organization_id.substring(0, 8)}-${Date.now()}`;
    console.log(`Creating UAZAPI instance: ${instanceName}`);

    const initResponse = await fetch(`${uazapiBaseUrl}/instance/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        admintoken: uazapiAdminToken,
      },
      body: JSON.stringify({ name: instanceName }),
    });

    const initRaw = await initResponse.text();
    console.log(`UAZAPI init response: ${initResponse.status}`, initRaw);

    if (!initResponse.ok) {
      return new Response(JSON.stringify({
        error: 'Failed to create UAZAPI instance',
        details: initRaw,
        statusCode: initResponse.status,
        debug_url: `${uazapiBaseUrl}/instance/init`,
        debug_token_prefix: uazapiAdminToken.substring(0, 4),
        debug_token_len: uazapiAdminToken.length
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let initData;
    try {
      initData = JSON.parse(initRaw);
    } catch {
      return new Response(JSON.stringify({
        error: 'Invalid JSON from UAZAPI',
        details: initRaw,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract instance data - UAZAPI returns { instance: { id, token, ... }, token: "..." }
    const instanceData = initData.instance || initData.data || initData;
    const uazapiInstanceId = instanceData.id || instanceData.name || instanceName;
    const uazapiToken = initData.token || instanceData.token;

    if (!uazapiToken) {
      return new Response(JSON.stringify({
        error: 'No token returned from UAZAPI',
        details: initData,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Instance created: id=${uazapiInstanceId}, token=${uazapiToken.substring(0, 8)}...`);

    // Configure webhook
    const webhookUrl = `${supabaseUrl}/functions/v1/zapi-webhook`;
    try {
      await fetch(`${uazapiBaseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token: uazapiToken,
        },
        body: JSON.stringify({ url: webhookUrl, enabled: true }),
      });
      console.log('Webhook configured:', webhookUrl);
    } catch (err) {
      console.error('Webhook config error (non-blocking):', err);
    }

    // Save to database - update existing pending instance or create new one
    let dbInstanceId: string;

    if (existingInstance && (!existingInstance.zapi_instance_id || existingInstance.status === 'disconnected' || existingInstance.status === 'pending')) {
      const { error: updateError } = await supabase
        .from('whatsapp_instances')
        .update({
          zapi_instance_id: uazapiInstanceId,
          zapi_token: uazapiToken,
          status: 'pending',
          disconnected_at: null,
          connected_at: null,
          is_active: false,
        })
        .eq('id', existingInstance.id);

      if (updateError) {
        return new Response(JSON.stringify({ error: 'Failed to save instance', details: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      dbInstanceId = existingInstance.id;
    } else {
      const { data: newInstance, error: insertError } = await supabase
        .from('whatsapp_instances')
        .insert({
          organization_id: profile.organization_id,
          zapi_instance_id: uazapiInstanceId,
          zapi_token: uazapiToken,
          status: 'pending',
          label: `Número ${Date.now().toString().slice(-4)}`,
        })
        .select('id')
        .single();

      if (insertError) {
        return new Response(JSON.stringify({ error: 'Failed to create instance', details: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      dbInstanceId = newInstance.id;
    }

    return new Response(JSON.stringify({
      success: true,
      instanceId: dbInstanceId,
      status: 'pending',
      reused: false,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
