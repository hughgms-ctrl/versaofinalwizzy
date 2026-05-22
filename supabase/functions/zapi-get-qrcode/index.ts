import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function extractQr(data: Record<string, any> | null): string | null {
  if (!data) return null;
  return (
    data?.qrcode?.base64 ||
    data?.qrcode?.code ||
    data.qrcode ||
    data.qr ||
    data.value ||
    data.base64 ||
    data.code ||
    data?.instance?.qrcode ||
    data?.data?.qrcode ||
    data?.data?.qr ||
    null
  );
}

function normalizeBaseUrl(value?: string | null) {
  return (value || '').trim().replace(/\/$/, '');
}

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

function isPayloadConnected(payload: any): boolean {
  const state = String(
    payload?.state ??
    payload?.status ??
    payload?.instance?.state ??
    payload?.instance?.status ??
    payload?.data?.state ??
    payload?.data?.status ??
    ''
  ).toLowerCase();
  return (
    payload?.connected === true ||
    payload?.instance?.connected === true ||
    payload?.data?.connected === true ||
    state === 'connected' ||
    state === 'open' ||
    state === 'online' ||
    payload?.loggedIn === true ||
    payload?.instance?.loggedIn === true
  );
}

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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const connectionSettings = await loadConnectionSettings(supabase);

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

    // Get instanceId from query or body
    let requestedInstanceId: string | null = new URL(req.url).searchParams.get('instanceId');
    if (!requestedInstanceId && req.method === 'POST') {
      try {
        const body = await req.json();
        requestedInstanceId = body.instanceId || null;
      } catch { /* no body */ }
    }

    // Find instance
    let instance;
    if (requestedInstanceId) {
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('id', requestedInstanceId)
        .eq('organization_id', profile.organization_id)
        .maybeSingle();
      instance = data;
    } else {
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      instance = data;
    }

    if (!instance) {
      return new Response(JSON.stringify({ error: 'No instance found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!instance.zapi_token) {
      return new Response(JSON.stringify({ error: 'Instance not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const provider = instance.provider || 'uazapi';

    if (provider === 'evolution') {
      const evolutionBaseUrl = connectionSettings.evolutionBaseUrl;
      const evolutionApiKey = connectionSettings.evolutionApiKey;
      const instanceName = instance.evolution_instance_name || instance.zapi_instance_id;

      if (!evolutionBaseUrl || !evolutionApiKey || !instanceName) {
        return new Response(JSON.stringify({ error: 'Evolution API not configured' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[DEBUG] Connecting Evolution instance ${instanceName}`);
      const connectResp = await fetch(`${evolutionBaseUrl}/instance/connect/${instanceName}`, {
        method: 'GET',
        headers: { apikey: evolutionApiKey },
      });
      const connectRaw = await connectResp.text();

      if (!connectResp.ok) {
        return new Response(JSON.stringify({
          error: 'Failed to connect Evolution instance',
          code: connectResp.status,
          details: connectRaw,
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let connectData: any = {};
      try { connectData = connectRaw ? JSON.parse(connectRaw) : {}; } catch (_) {}

      if (isPayloadConnected(connectData)) {
        await supabase
          .from('whatsapp_instances')
          .update({
            status: 'connected',
            is_active: true,
            connected_at: new Date().toISOString(),
            disconnected_at: null,
          })
          .eq('id', instance.id);

        return new Response(JSON.stringify({ connected: true, instanceId: instance.id, provider }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const qrCode = extractQr(connectData);
      if (!qrCode) {
        return new Response(JSON.stringify({
          error: 'No QR code available',
          details: connectData,
          note: 'A instância Evolution pode estar inicializando. Tente novamente em instantes.',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase
        .from('whatsapp_instances')
        .update({ status: 'connecting', is_active: true })
        .eq('id', instance.id);

      return new Response(JSON.stringify({
        qrCode,
        connected: false,
        instanceId: instance.id,
        provider,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Call /instance/connect with the instance token
    console.log(`[DEBUG] Connecting instance ${instance.id} via ${connectionSettings.uazapiBaseUrl}/instance/connect`);

    const connectResp = await fetch(`${connectionSettings.uazapiBaseUrl}/instance/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: instance.zapi_token,
      },
    });

    const connectRaw = await connectResp.text();
    console.log(`Connect response: ${connectResp.status}`, connectRaw.substring(0, 300));

    if (!connectResp.ok) {
      return new Response(JSON.stringify({
        error: 'Failed to connect instance',
        code: connectResp.status,
        details: connectRaw,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let connectData;
    try {
      connectData = JSON.parse(connectRaw);
    } catch {
      connectData = {};
    }

    const isConnected = isPayloadConnected(connectData);

    if (isConnected) {
      await supabase
        .from('whatsapp_instances')
        .update({
          status: 'connected',
          is_active: true,
          connected_at: new Date().toISOString(),
          disconnected_at: null,
        })
        .eq('id', instance.id);

      return new Response(JSON.stringify({ connected: true, instanceId: instance.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Extract QR code from connect response
    let qrCode = extractQr(connectData);

    // Step 3: If no QR in connect response, try dedicated QR endpoints
    if (!qrCode) {
      console.log('No QR in connect response, trying /instance/qr');
      const qrEndpoints = ['/instance/qr', '/instance/qrcode'];

      for (const endpoint of qrEndpoints) {
        if (qrCode) break;
        try {
            const qrResp = await fetch(`${connectionSettings.uazapiBaseUrl}${endpoint}`, {
            method: 'GET',
            headers: { token: instance.zapi_token },
          });
          if (qrResp.ok) {
            const qrRaw = await qrResp.text();
            console.log(`${endpoint} response:`, qrRaw.substring(0, 200));
            try {
              const qrData = JSON.parse(qrRaw);
              qrCode = extractQr(qrData);
            } catch {
              // Maybe it's raw base64/text QR
              if (qrRaw.length > 50 && !qrRaw.startsWith('{')) {
                qrCode = qrRaw.trim();
              }
            }
          }
        } catch (e) {
          console.log(`${endpoint} failed:`, e);
        }
      }
    }

    if (!qrCode) {
      console.error('[DEBUG] No QR code found in connectData or dedicated endpoints. Full connectData:', JSON.stringify(connectData));
      return new Response(JSON.stringify({
        error: 'No QR code available',
        details: connectData,
        note: 'A instância pode estar inicializando. Tente recarregar a página em instantes.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update instance status
    await supabase
      .from('whatsapp_instances')
      .update({ status: 'connecting', is_active: true })
      .eq('id', instance.id);

    return new Response(JSON.stringify({
      qrCode,
      connected: false,
      instanceId: instance.id,
      provider,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', message: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
