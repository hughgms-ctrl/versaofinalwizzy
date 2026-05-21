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

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('Auth error (getUser):', userError);
      return new Response(JSON.stringify({ error: 'Invalid token', details: userError?.message }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const requestedInstanceId = url.searchParams.get('instanceId');

    const ensureCountryCode = (phone: string): string => {
      let cleaned = phone.replace(/\D/g, '');
      if (cleaned.length === 0) return '';

      // WhatsApp standard (55 + DDD + 9? + number)
      if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);

      // If it has 10-11 digits and doesn't start with 55, add 55 (Brazil)
      if (cleaned.length >= 10 && cleaned.length <= 11 && !cleaned.startsWith('55')) {
        cleaned = '55' + cleaned;
      }

      return cleaned;
    };

    const sanitizePhone = (value: unknown): string | null => {
      if (typeof value !== 'string') return null;
      const cleaned = ensureCountryCode(value);
      if (cleaned.length >= 8 && cleaned.length <= 15) return cleaned;
      return null;
    };

    if (requestedInstanceId) {
      const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('id', requestedInstanceId)
        .eq('organization_id', profile.organization_id)
        .maybeSingle();

      if (!instance) {
        return new Response(JSON.stringify({ error: 'Instance not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = await checkSingleInstance(
        supabase,
        instance,
        uazapiBaseUrl,
        sanitizePhone,
        authHeader,
        supabaseUrl,
      );
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: instances } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: true });

    if (!instances || instances.length === 0) {
      return new Response(JSON.stringify({
        status: 'not_configured', connected: false, instances: [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const primaryInstance = instances[0];
    const primaryResult = await checkSingleInstance(
      supabase,
      primaryInstance,
      uazapiBaseUrl,
      sanitizePhone,
      authHeader,
      supabaseUrl,
    );

    const allResults = [];
    for (const inst of instances) {
      if (inst.id === primaryInstance.id) {
        allResults.push({ id: inst.id, label: inst.label, ...primaryResult });
      } else {
        const r = await checkSingleInstance(
          supabase,
          inst,
          uazapiBaseUrl,
          sanitizePhone,
          authHeader,
          supabaseUrl,
        );
        allResults.push({ id: inst.id, label: inst.label, ...r });
      }
    }

    return new Response(JSON.stringify({ ...primaryResult, instances: allResults }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function bootstrapConnectedInstance(
  supabase: any,
  supabaseUrl: string,
  authHeader: string,
  organizationId: string,
  instanceId: string,
) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/zapi-configure-webhook`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    });

    await fetch(`${supabaseUrl}/functions/v1/zapi-sync-chats?instanceId=${instanceId}`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    });

    const { data: recentConversations } = await supabase
      .from('conversations')
      .select('id')
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(40);

    if (!recentConversations?.length) return;

    await Promise.allSettled(
      recentConversations.slice(0, 25).map((conversation: { id: string }) =>
        fetch(`${supabaseUrl}/functions/v1/zapi-sync-messages`, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: conversation.id, amount: 50 }),
        })
      )
    );
  } catch (error) {
    console.error('Bootstrap sync error:', error);
  }
}

async function checkSingleInstance(
  supabase: any,
  instance: any,
  uazapiBaseUrl: string,
  sanitizePhone: (v: unknown) => string | null,
  authHeader: string,
  supabaseUrl: string,
) {
  if (!instance.zapi_token) {
    return { status: 'pending', connected: false, hasCredentials: false };
  }

  const instanceToken = String(instance.zapi_token).trim();

  const readJsonFromUazapi = async (
    path: string,
    init: RequestInit,
    context: string,
  ): Promise<any | null> => {
    try {
      let response = await fetch(uazapiUrl(uazapiBaseUrl, path), init);

      // SELF-HEALING: If 401/403, try to recover the token and retry once
      if ((response.status === 401 || response.status === 403) && Deno.env.get('UAZAPI_ADMIN_TOKEN')) {
        console.warn(`[SELF-HEALING] ${context} failed with ${response.status}. Attempting token recovery...`);
        try {
          const instanceName = `wizzy-org-${instance.organization_id.substring(0, 10)}`;
          const listResp = await fetch(uazapiUrl(uazapiBaseUrl, '/instance/list'), {
            method: 'GET',
            headers: { admintoken: Deno.env.get('UAZAPI_ADMIN_TOKEN')! },
          });

          if (listResp.ok) {
            const listData = await listResp.json();
            const instancesArray = Array.isArray(listData) ? listData : (listData.data || listData.instances || []);
            const matched = instancesArray.find((i: any) =>
              (i.name === instanceName) || (i.instanceName === instanceName) || (i.id === instance.zapi_instance_id) || (i.id === instanceName)
            );

            if (matched) {
              const newToken = matched.token || matched.key || matched.instanceToken;
              if (newToken && newToken !== instanceToken) {
                console.log(`[SELF-HEALING] Found new token. Updating DB.`);
                await supabase.from('whatsapp_instances').update({ zapi_token: newToken }).eq('id', instance.id);

                // Retry the original request with the new token
                const newInit = { ...init, headers: { ...init.headers, 'token': newToken } };
                response = await fetch(uazapiUrl(uazapiBaseUrl, path), newInit);
              }
            }
          }
        } catch (recoverErr) {
          console.error('[SELF-HEALING ERROR] Recovery failed:', recoverErr);
        }
      }

      const raw = await response.text();

      if (!response.ok) {
        console.error(`UAZAPI ${context} failed:`, response.status, raw);
        return null;
      }

      try {
        return JSON.parse(raw);
      } catch {
        console.error(`UAZAPI ${context} returned invalid JSON:`, raw);
        return null;
      }
    } catch (e) {
      console.error(`UAZAPI ${context} fetch error:`, e);
      return null;
    }
  };

  const getConnectionState = (payload: any): string => {
    return String(
      payload?.state ??
      payload?.status ??
      payload?.instance?.state ??
      payload?.instance?.status ??
      payload?.data?.state ??
      payload?.data?.status ??
      payload?.instanceState ??
      ''
    ).toLowerCase();
  };

  const isPayloadConnected = (payload: any): boolean => {
    const state = getConnectionState(payload);
    console.log(`[DEBUG] getConnectionState: ${state} | payload_connected: ${payload?.connected}`);
    return (
      payload?.connected === true ||
      payload?.instance?.connected === true ||
      payload?.data?.connected === true ||
      state === 'connected' ||
      state === 'open' ||
      state === 'online' ||
      state === 'loggedin' ||
      state === 'active'
    );
  };

  const extractPhoneFromPayload = (payload: any): string | null => {
    const candidates = [
      payload?.phone,
      payload?.instance?.phone,
      payload?.data?.phone,
      payload?.jid,
      payload?.instance?.jid,
      payload?.data?.jid,
    ];

    for (const value of candidates) {
      if (typeof value === 'string') {
        const maybePhone = value.includes('@') ? value.split('@')[0] : value;
        const cleaned = sanitizePhone(maybePhone);
        if (cleaned) return cleaned;
      }
    }

    return null;
  };

  // Primary probe: /instance/connect gives the freshest state in UAZAPI
  const connectProbe = await readJsonFromUazapi(
    '/instance/connect',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: instanceToken,
      },
    },
    'connect probe',
  );

  // Fallback: legacy status endpoint
  const statusProbe = connectProbe
    ? null
    : await readJsonFromUazapi(
      '/instance/status',
      {
        method: 'GET',
        headers: { token: instanceToken },
      },
      'status check',
    );

  const statusData = connectProbe ?? statusProbe;

  if (!statusData) {
    return {
      status: instance.status,
      connected: instance.status === 'connected',
      phoneNumber: instance.phone_number,
      hasCredentials: true,
    };
  }

  console.log('UAZAPI connection probe:', JSON.stringify(statusData));

  const isConnected = isPayloadConnected(statusData);

  let connectedPhone: string | null = extractPhoneFromPayload(statusData);

  if (isConnected && !connectedPhone) {
    try {
      const profileResponse = await fetch(
        uazapiUrl(uazapiBaseUrl, '/instance/profile'),
        {
          method: 'GET',
          headers: { token: instanceToken }
        }
      );
      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        if (profileData?.phone) {
          connectedPhone = sanitizePhone(profileData.phone);
        } else if (profileData?.jid) {
          connectedPhone = sanitizePhone(profileData.jid.split('@')[0]);
        }
      }
    } catch (e) {
      console.error('Error fetching profile info:', e);
    }
  }

  const previousPhone = sanitizePhone(instance.phone_number);
  const phoneChanged = !!(previousPhone && connectedPhone && previousPhone !== connectedPhone);

  if (isConnected) {
    const wasDisconnected = instance.status !== 'connected';
    const isReconnection = wasDisconnected || phoneChanged;

    await supabase
      .from('whatsapp_instances')
      .update({
        status: 'connected', is_active: true,
        connected_at: wasDisconnected ? new Date().toISOString() : instance.connected_at,
        phone_number: connectedPhone ?? sanitizePhone(instance.phone_number),
      })
      .eq('id', instance.id);

    fetch(`${supabaseUrl}/functions/v1/zapi-configure-webhook`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    }).catch((error) => console.error('Webhook ensure error:', error));

    // Bootstrap synchronization in background (don't await to avoid connection close)
    if (isReconnection) {
      console.log(`[BOOTSTRAP] Triggering background sync for instance ${instance.id}`);
      bootstrapConnectedInstance(
        supabase,
        supabaseUrl,
        authHeader,
        instance.organization_id,
        instance.id,
      ).catch(e => console.error('[BOOTSTRAP ERROR]', e));
    }

    return {
      status: 'connected', connected: true,
      phoneNumber: connectedPhone ?? sanitizePhone(instance.phone_number),
      hasCredentials: true, phoneChanged, isReconnection, needsSync: isReconnection,
    };
  }

  const probeState = getConnectionState(statusData);
  const isConnectingState = ['connecting', 'pairing', 'qrcode', 'qr'].includes(probeState);

  if (isConnectingState) {
    // CRITICAL FIX: If UAZAPI explicitly says connected=false, respect that
    // even if DB still says 'connected'. This prevents false-positive connected status.
    if (statusData?.connected === false || statusData?.instance?.connected === false) {
      console.log('[DEBUG] UAZAPI says connected=false with state connecting/pairing. Marking as disconnected.');
      
      await supabase
        .from('whatsapp_instances')
        .update({
          status: 'disconnected',
          is_active: false,
          disconnected_at: new Date().toISOString(),
        })
        .eq('id', instance.id);

      return {
        status: 'disconnected',
        connected: false,
        phoneNumber: instance.phone_number,
        hasCredentials: true,
        wasConnected: instance.status === 'connected',
      };
    }

    // If connected field is not explicitly false, and was connected, stay connected briefly
    if (instance.status === 'connected') {
      console.log('[DEBUG] Instance was connected, UAZAPI says connecting but not explicitly disconnected. Staying connected briefly.');
      return {
        status: 'connected',
        connected: true,
        phoneNumber: instance.phone_number,
        hasCredentials: true,
      };
    }

    await supabase
      .from('whatsapp_instances')
      .update({
        status: 'connecting',
        is_active: true,
      })
      .eq('id', instance.id);

    return {
      status: 'connecting',
      connected: false,
      phoneNumber: instance.phone_number,
      hasCredentials: true,
    };
  }

  // If UAZAPI says something else (like null or error or empty string), 
  // and we were connected/connecting, we should be VERY CAREFUL.
  if (!probeState || probeState === 'undefined') {
    console.log('[DEBUG] Empty probeState, preserving current status:', instance.status);
    return {
      status: instance.status,
      connected: instance.status === 'connected',
      phoneNumber: instance.phone_number,
      hasCredentials: true,
    };
  }

  if (instance.status === 'connected') {
    // Only mark as disconnected IF it's explicitly disconnected or loggedout
    // AND the connected flag is false.
    const isExplicitlyDisconnected = ['disconnected', 'loggedout', 'close', 'closed', 'refused'].includes(probeState);
    const isExplicitlyFalse = statusData?.connected === false || statusData?.instance?.connected === false;

    if (isExplicitlyDisconnected && isExplicitlyFalse) {
      console.log(`[DEBUG] Marking instance ${instance.id} as disconnected. State: ${probeState}, ConnectedFlag: false`);
      await supabase
        .from('whatsapp_instances')
        .update({
          status: 'disconnected', is_active: false,
          disconnected_at: new Date().toISOString(),
        })
        .eq('id', instance.id);

      return {
        status: 'disconnected', connected: false,
        phoneNumber: instance.phone_number, hasCredentials: true,
      };
    } else {
      console.log(`[DEBUG] State '${probeState}' is transient or not explicitly false. Preserving 'connected' status for instance ${instance.id}.`);
      return {
        status: 'connected', connected: true,
        phoneNumber: instance.phone_number, hasCredentials: true,
      };
    }
  }

  return {
    status: 'disconnected', connected: false,
    phoneNumber: instance.phone_number, hasCredentials: true,
  };
}
