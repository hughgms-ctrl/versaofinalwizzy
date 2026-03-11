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

    // Forced redeploy to refresh secrets - 2026-02-27

    if (!uazapiBaseUrl || !uazapiAdminToken) {
      return new Response(JSON.stringify({ error: 'UAZAPI not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace(/^Bearer\s+/i, '');
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

    // Create or reuse instance via UAZAPI using a FIXED name per organization
    // This prevents creating dozens of instances and getting charged for them
    const instanceName = `wizzy-org-${profile.organization_id.substring(0, 10)}`;
    let createEndpoint = '/instance/init';
    console.log(`[DEBUG] Ensuring instance with name: ${instanceName} via ${createEndpoint}...`);

    let initResponse = await fetch(`${uazapiBaseUrl}${createEndpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        admintoken: uazapiAdminToken,
      },
      body: JSON.stringify({ name: instanceName }),
    });

    // Fallback and probe logic for /instance/create
    if (initResponse.status === 404) {
      console.log(`[DEBUG] ${createEndpoint} failed with 404. Trying /instance/create...`);
      createEndpoint = '/instance/create';
      initResponse = await fetch(`${uazapiBaseUrl}${createEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          admintoken: uazapiAdminToken,
        },
        body: JSON.stringify({ name: instanceName }),
      });
    }

    const initRaw = await initResponse.text();
    console.log(`UAZAPI create/init response (${createEndpoint}): ${initResponse.status}`, initRaw);

    // If already exists (409) or success (2xx), proceed to extract data
    if (!initResponse.ok && initResponse.status !== 409) {
      return new Response(JSON.stringify({
        error: 'Failed to create UAZAPI instance',
        details: initRaw,
        statusCode: initResponse.status,
        endpoint: createEndpoint
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let initData;
    try {
      initData = JSON.parse(initRaw);
    } catch {
      initData = {};
    }

    // Extract instance data - UAZAPI V2 returns { instance: { id, token, ... }, token: "..." }
    const instanceData = initData.instance || initData.data || initData;
    let uazapiInstanceId = instanceData.id || instanceData.name || instanceData.instanceId || instanceName;
    let uazapiToken = initData.token || instanceData.token || instanceData.key;

    // SELF-HEALING: If already exists (409) or token is missing, fetch it via admin list
    if (initResponse.status === 409 || !uazapiToken) {
      console.log(`[SELF-HEALING] Instance exists or token missing. Fetching current token from UAZAPI list...`);
      try {
        const listResp = await fetch(`${uazapiBaseUrl}/instance/list`, {
          method: 'GET',
          headers: { admintoken: uazapiAdminToken },
        });
        if (listResp.ok) {
          const listData = await listResp.json();
          const instancesArray = Array.isArray(listData) ? listData : (listData.data || listData.instances || []);
          const matched = instancesArray.find((i: any) =>
            (i.name === instanceName) || (i.instanceName === instanceName) || (i.id === uazapiInstanceId)
          );

          if (matched) {
            uazapiToken = matched.token || matched.key || matched.instanceToken;
            uazapiInstanceId = matched.id || matched.name || uazapiInstanceId;
            console.log(`[SELF-HEALING] Token recovered for ${instanceName}`);
          }
        }
      } catch (e) {
        console.error('[SELF-HEALING ERROR] Failed to recover token:', e);
      }
    }

    if (!uazapiToken) {
      return new Response(JSON.stringify({
        error: 'No token returned from UAZAPI',
        details: initData,
        statusCode: initResponse.status
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
