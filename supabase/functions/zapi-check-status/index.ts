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

    const sanitizePhone = (value: unknown): string | null => {
      if (typeof value !== 'string') return null;
      const cleaned = value.replace(/\D/g, '');
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

      const result = await checkSingleInstance(supabase, instance, uazapiBaseUrl, sanitizePhone);
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
    const primaryResult = await checkSingleInstance(supabase, primaryInstance, uazapiBaseUrl, sanitizePhone);

    const allResults = [];
    for (const inst of instances) {
      if (inst.id === primaryInstance.id) {
        allResults.push({ id: inst.id, label: inst.label, ...primaryResult });
      } else {
        const r = await checkSingleInstance(supabase, inst, uazapiBaseUrl, sanitizePhone);
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

async function checkSingleInstance(
  supabase: any, instance: any, uazapiBaseUrl: string,
  sanitizePhone: (v: unknown) => string | null
) {
  if (!instance.zapi_token) {
    return { status: 'pending', connected: false, hasCredentials: false };
  }

  let statusData: any;
  try {
    const statusResponse = await fetch(
      uazapiUrl(uazapiBaseUrl, '/instance/status'),
      {
        method: 'GET',
        headers: { 'token': instance.zapi_token }
      }
    );

    if (!statusResponse.ok) {
      console.error('UAZAPI status check failed:', statusResponse.status, await statusResponse.text().catch(() => ''));
      return {
        status: instance.status, connected: instance.status === 'connected',
        phoneNumber: instance.phone_number, hasCredentials: true,
      };
    }

    statusData = await statusResponse.json();
    console.log('UAZAPI status response:', JSON.stringify(statusData));
  } catch (e) {
    console.error('UAZAPI status fetch error:', e);
    return {
      status: instance.status, connected: instance.status === 'connected',
      phoneNumber: instance.phone_number, hasCredentials: true,
    };
  }

  // UAZAPI returns: { instance: { status: "connected", owner: "55..." }, status: { connected: true, jid: "55...@s.whatsapp.net" } }
  const isConnected = 
    statusData?.status?.connected === true || 
    statusData?.instance?.status === 'connected' ||
    statusData?.state === 'connected' || 
    statusData?.connected === true;

  let connectedPhone: string | null = null;
  
  // Try to extract phone from UAZAPI response
  if (isConnected) {
    // From instance.owner
    if (statusData?.instance?.owner) {
      connectedPhone = sanitizePhone(statusData.instance.owner);
    }
    // From status.jid  
    if (!connectedPhone && statusData?.status?.jid) {
      connectedPhone = sanitizePhone(statusData.status.jid.split('@')[0].split(':')[0]);
    }
    // From top-level phone
    if (!connectedPhone && statusData?.phone) {
      connectedPhone = sanitizePhone(statusData.phone);
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

    return {
      status: 'connected', connected: true,
      phoneNumber: connectedPhone ?? sanitizePhone(instance.phone_number),
      hasCredentials: true, phoneChanged, isReconnection, needsSync: isReconnection,
    };
  } else if (instance.status === 'connected') {
    await supabase
      .from('whatsapp_instances')
      .update({
        status: 'disconnected', is_active: false,
        disconnected_at: new Date().toISOString(),
      })
      .eq('id', instance.id);
  }

  return {
    status: 'disconnected', connected: false,
    phoneNumber: instance.phone_number, hasCredentials: true,
  };
}
