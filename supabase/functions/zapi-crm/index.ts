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

    const { data: instance } = await supabase
      .from('whatsapp_instances').select('*')
      .eq('organization_id', profile.organization_id)
      .eq('status', 'connected')
      .order('created_at', { ascending: true }).limit(1).maybeSingle();

    const { action, ...params } = await req.json();

    switch (action) {
      case 'save': {
        const { contactId, customFields } = params;
        if (!contactId) {
          return new Response(JSON.stringify({ error: 'contactId required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Save to Supabase (primary)
        const { data: existing } = await supabase
          .from('crm_entries').select('*')
          .eq('contact_id', contactId)
          .eq('organization_id', profile.organization_id)
          .maybeSingle();

        let crmEntry;
        if (existing) {
          const { data, error } = await supabase
            .from('crm_entries')
            .update({ custom_fields: customFields || {}, synced_to_uazapi: false })
            .eq('id', existing.id).select().single();
          if (error) throw error;
          crmEntry = data;
        } else {
          const { data, error } = await supabase
            .from('crm_entries')
            .insert({
              contact_id: contactId,
              organization_id: profile.organization_id,
              custom_fields: customFields || {},
            })
            .select().single();
          if (error) throw error;
          crmEntry = data;
        }

        // Sync to UAZAPI CRM if instance available
        if (instance) {
          try {
            const { data: contact } = await supabase
              .from('contacts').select('phone, name, email')
              .eq('id', contactId).single();

            if (contact) {
              const resp = await fetch(`${uazapiBaseUrl}/crm/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
                body: JSON.stringify({
                  number: contact.phone,
                  name: contact.name || '',
                  email: contact.email || '',
                  ...customFields,
                }),
              });

              if (resp.ok) {
                const result = await resp.json();
                await supabase.from('crm_entries').update({
                  synced_to_uazapi: true,
                  uazapi_crm_id: result.id || result._id || null,
                }).eq('id', crmEntry.id);
                crmEntry.synced_to_uazapi = true;
              }
            }
          } catch (e) {
            console.error('UAZAPI CRM sync failed:', e);
          }
        }

        return new Response(JSON.stringify({ success: true, entry: crmEntry }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'find': {
        const { contactId } = params;
        const query = supabase
          .from('crm_entries').select('*')
          .eq('organization_id', profile.organization_id);

        if (contactId) query.eq('contact_id', contactId);

        const { data: entries, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({ success: true, entries }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'sync_from_uazapi': {
        if (!instance) {
          return new Response(JSON.stringify({ error: 'No connected instance' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const resp = await fetch(`${uazapiBaseUrl}/crm/find`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
          body: JSON.stringify(params.filter || {}),
        });

        if (!resp.ok) {
          return new Response(JSON.stringify({ error: 'Failed to fetch from UAZAPI CRM' }), {
            status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const crmData = await resp.json();
        return new Response(JSON.stringify({ success: true, uazapi_data: crmData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action. Use: save, find, sync_from_uazapi' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
