import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function uazapiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${path}`;
}

type PresenceType = 'typing' | 'recording' | 'composing';

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
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { phone, presence, duration = 3000 } = await req.json() as {
      phone: string; presence: PresenceType; duration?: number;
    };

    if (!phone || !presence) {
      return new Response(JSON.stringify({ error: 'Phone and presence are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles').select('organization_id').eq('user_id', user.id).single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: instance } = await supabase
      .from('whatsapp_instances').select('*')
      .eq('organization_id', profile.organization_id)
      .eq('status', 'connected').limit(1).maybeSingle();

    if (!instance) {
      return new Response(JSON.stringify({ error: 'No connected WhatsApp instance' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedPhone = phone.replace(/\D/g, '');
    const presenceType = presence === 'typing' ? 'composing' : (presence === 'recording' ? 'recording' : 'paused');

    const response = await fetch(uazapiUrl(uazapiBaseUrl, '/message/presence'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': instance.zapi_token
      },
      body: JSON.stringify({
        number: normalizedPhone,
        presence: presenceType,
        delay: duration
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('UAZAPI presence error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to send presence', details: errorText }), {
        status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
