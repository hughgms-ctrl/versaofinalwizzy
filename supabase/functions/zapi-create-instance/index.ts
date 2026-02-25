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
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL');
    const uazapiAdminToken = Deno.env.get('UAZAPI_ADMIN_TOKEN');

    if (!uazapiBaseUrl || !uazapiAdminToken) {
      return new Response(JSON.stringify({ error: 'UAZAPI not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for ANY existing instance for this org that might be reusable
    // (Disconnected or pending without instance ID)
    const { data: existingInstance } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingInstance && existingInstance.zapi_instance_id && existingInstance.status === 'disconnected') {
      console.log('Reusing disconnected instance:', existingInstance.id);
      return new Response(JSON.stringify({
        success: true,
        instanceId: existingInstance.id,
        status: 'disconnected',
        reused: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for pending instance without credentials
    const { data: pendingInstance } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .is('zapi_instance_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Create a new instance on UAZAPI via POST /instance/init
    const instanceName = `org-${profile.organization_id.substring(0, 8)}-${Date.now()}`;

    const initUrl = uazapiUrl(uazapiBaseUrl, '/instance/init');
    console.log(`Creating UAZAPI instance at: ${initUrl}`);

    const uazapiResponse = await fetch(initUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'admintoken': uazapiAdminToken // Reverted to 'admintoken' as per documentation
      },
      body: JSON.stringify({ name: instanceName }),
    });

    console.log(`UAZAPI create response status: ${uazapiResponse.status}`);

    if (!uazapiResponse.ok) {
      const errorText = await uazapiResponse.text();
      console.error('UAZAPI create instance error:', errorText);
      return new Response(JSON.stringify({
        error: 'Failed to create UAZAPI instance',
        details: errorText,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const uazapiData = await uazapiResponse.json();
    console.log('UAZAPI instance created:', JSON.stringify(uazapiData));

    const uazapiInstanceId = uazapiData.name || uazapiData.id || instanceName;
    const uazapiToken = uazapiData.token || uazapiData.api_token;

    if (!uazapiToken) {
      console.error('No token returned from UAZAPI:', uazapiData);
      return new Response(JSON.stringify({ error: 'No token returned from UAZAPI' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Configure webhook on UAZAPI
    const webhookUrl = `${supabaseUrl}/functions/v1/zapi-webhook`;
    try {
      const webhookResp = await fetch(uazapiUrl(uazapiBaseUrl, '/webhook'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': uazapiToken
        },
        body: JSON.stringify({ url: webhookUrl, enabled: true }),
      });
      console.log('Webhook set status:', webhookResp.status, await webhookResp.text().catch(() => ''));
    } catch (err) {
      console.error('Error configuring webhook:', err);
    }

    let dbInstanceId: string;

    if (pendingInstance) {
      const { error: updateError } = await supabase
        .from('whatsapp_instances')
        .update({
          zapi_instance_id: uazapiInstanceId,
          zapi_token: uazapiToken,
          status: 'pending',
        })
        .eq('id', pendingInstance.id);

      if (updateError) {
        console.error('Update error:', updateError);
        return new Response(JSON.stringify({ error: 'Failed to save instance' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      dbInstanceId = pendingInstance.id;
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
        console.error('Insert error:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to create instance' }), {
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
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
