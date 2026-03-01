import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function ensureCountryCode(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length >= 12) return clean;
  if (clean.length >= 10 && clean.length <= 11) return `55${clean}`;
  return clean;
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

    // Get all contacts for this organization
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts').select('id, phone, name, avatar_url')
      .eq('organization_id', profile.organization_id);

    if (contactsError) throw contactsError;

    let fixed = 0;
    let profilesUpdated = 0;
    const errors: string[] = [];

    for (const contact of contacts || []) {
      try {
        const currentPhone = contact.phone;
        const fixedPhone = ensureCountryCode(currentPhone);
        
        let needsUpdate = false;
        const updateData: Record<string, any> = {};

        // Fix short numbers
        if (fixedPhone !== currentPhone) {
          // Check if a contact with the fixed number already exists
          const { data: duplicate } = await supabase
            .from('contacts').select('id')
            .eq('phone', fixedPhone)
            .eq('organization_id', profile.organization_id)
            .neq('id', contact.id)
            .maybeSingle();

          if (!duplicate) {
            updateData.phone = fixedPhone;
            needsUpdate = true;
            fixed++;
          }
        }

        // Fetch profile from UAZAPI if missing name
        if (!contact.name || !contact.avatar_url) {
          try {
            const resp = await fetch(`${uazapiBaseUrl}/contact/info`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
              body: JSON.stringify({ number: fixedPhone || currentPhone }),
            });
            if (resp.ok) {
              const profileData = await resp.json();
              const profileName = profileData.name || profileData.pushname || profileData.notify;
              const profilePic = profileData.profilePicUrl || profileData.profilePictureUrl || profileData.imgUrl;
              if (profileName && !contact.name) { updateData.name = profileName; needsUpdate = true; }
              if (profilePic && !contact.avatar_url) { updateData.avatar_url = profilePic; needsUpdate = true; }
              if (profileName || profilePic) profilesUpdated++;
            }
          } catch (e) {
            // Ignore individual profile fetch errors
          }
          // Rate limit
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        if (needsUpdate) {
          await supabase.from('contacts').update(updateData).eq('id', contact.id);
        }
      } catch (e) {
        errors.push(`${contact.phone}: ${String(e)}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      totalContacts: contacts?.length || 0,
      numbersFixed: fixed,
      profilesUpdated,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
