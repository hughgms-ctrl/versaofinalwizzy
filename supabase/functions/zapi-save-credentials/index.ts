import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { instanceId, instanceToken, dbInstanceId, label, workspaceId } = body;

    if (!instanceToken) {
      return new Response(JSON.stringify({ error: 'Instance Token is required' }), {
        status: 400,
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

    // Soft validation: try to reach the instance (non-blocking)
    // /instance/status confirms the token is valid; 401 = invalid, 200 = valid (connected or not)
    try {
      const statusResponse = await fetch(`${uazapiBaseUrl}/instance/status`, {
        method: 'GET',
        headers: { 'token': instanceToken.trim() },
      });
      const statusText = await statusResponse.text();
      console.log(`UAZAPI token validation: HTTP ${statusResponse.status}`, statusText);
      // 401 = truly invalid token; anything else (200, 400, etc.) means token is recognized
      if (statusResponse.status === 401) {
        return new Response(JSON.stringify({
          error: 'Token inválido no Uazapi',
          details: statusText,
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } catch (validationError) {
      // Network error - don't block the save, just log
      console.error('UAZAPI validation network error (non-blocking):', validationError);
    }

    let targetInstanceId: string = dbInstanceId;

    // If no dbInstanceId provided, check if we already have an instance with this token or zapi_instance_id
    if (!targetInstanceId) {
      const { data: existing } = await supabase
        .from('whatsapp_instances')
        .select('id')
        .eq('organization_id', profile.organization_id)
        .or(`zapi_token.eq.${instanceToken.trim()},zapi_instance_id.eq.${instanceId?.trim() || 'NONE'}`)
        .maybeSingle();

      if (existing) {
        targetInstanceId = existing.id;
        console.log(`[SAVE] Found existing instance ${targetInstanceId} for this token/id. Updating instead of inserting.`);
      }
    }

    if (targetInstanceId) {
      const { error: updateError } = await supabase
        .from('whatsapp_instances')
        .update({
          zapi_instance_id: instanceId?.trim() || null,
          zapi_token: instanceToken.trim(),
          status: 'pending',
          label: label || undefined,
        })
        .eq('id', targetInstanceId)
        .eq('organization_id', profile.organization_id);

      if (updateError) {
        console.error('Update error:', updateError);
        return new Response(JSON.stringify({ error: 'Failed to save credentials' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      const { data: newInstance, error: insertError } = await supabase
        .from('whatsapp_instances')
        .insert({
          organization_id: profile.organization_id,
          zapi_instance_id: instanceId?.trim() || null,
          zapi_token: instanceToken.trim(),
          status: 'pending',
          label: label || null,
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
      targetInstanceId = newInstance.id;
    }

    if (workspaceId) {
      await supabase
        .from('workspaces')
        .update({ whatsapp_instance_id: targetInstanceId })
        .eq('id', workspaceId)
        .eq('organization_id', profile.organization_id);
    }

    // Configure webhook on UAZAPI
    const webhookUrl = `${supabaseUrl}/functions/v1/zapi-webhook`;
    console.log(`Configuring webhook URL: ${webhookUrl}`);

    try {
      const response = await fetch(`${uazapiBaseUrl}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': instanceToken.trim(),
        },
        body: JSON.stringify({
          url: webhookUrl,
          enabled: true,
        }),
      });
      const data = await response.json().catch(() => ({}));
      console.log('Webhook configured:', response.status, data);
    } catch (err) {
      console.error('Error configuring webhook:', err);
    }

    return new Response(JSON.stringify({
      success: true,
      instanceId: targetInstanceId,
      message: 'Credentials saved and webhook configured',
      webhookUrl,
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
