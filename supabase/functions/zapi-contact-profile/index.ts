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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const uazapiBaseUrl = (Deno.env.get('UAZAPI_BASE_URL') || '').replace(/\/$/, '');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('user_id', user.id).single();
    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { contactId, phone } = await req.json();
    if (!contactId && !phone) {
      return new Response(JSON.stringify({ error: 'contactId or phone required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get instance
    const { data: instance } = await supabase
      .from('whatsapp_instances').select('*')
      .eq('organization_id', profile.organization_id)
      .eq('status', 'connected')
      .order('created_at', { ascending: true }).limit(1).maybeSingle();

    if (!instance) {
      return new Response(JSON.stringify({ error: 'No connected instance' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let targetPhone = phone;
    if (contactId && !phone) {
      const { data: contact } = await supabase
        .from('contacts').select('phone')
        .eq('id', contactId).eq('organization_id', profile.organization_id).single();
      if (!contact) {
        return new Response(JSON.stringify({ error: 'Contact not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      targetPhone = contact.phone;
    }

    // Fetch profile from UAZAPI
    const resp = await fetch(`${uazapiBaseUrl}/contact/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
      body: JSON.stringify({ number: targetPhone }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      return new Response(JSON.stringify({ error: 'Failed to fetch profile', details: errorText }), {
        status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const profileData = await resp.json();

    // Update contact in DB if contactId provided
    if (contactId) {
      const updateData: Record<string, any> = {};
      const profileName = profileData.name || profileData.pushname || profileData.notify;
      const profilePic = profileData.profilePicUrl || profileData.profilePictureUrl || profileData.imgUrl;
      if (profileName) updateData.name = profileName;
      if (profilePic) updateData.avatar_url = profilePic;
      if (Object.keys(updateData).length > 0) {
        await supabase.from('contacts').update(updateData).eq('id', contactId);
      }
    }

    return new Response(JSON.stringify({ success: true, profile: profileData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
