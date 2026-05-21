import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

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
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized', details: authError?.message }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { action, contactId, data, instanceId } = await req.json();

        // action: 'save' | 'find' | 'sync_from_uazapi'

        let instance;
        if (instanceId) {
            const { data: inst } = await supabase.from('whatsapp_instances').select('*').eq('id', instanceId).single();
            instance = inst;
        } else {
            const { data: instances } = await supabase.from('whatsapp_instances').select('*').eq('status', 'connected').limit(1);
            instance = instances?.[0];
        }

        if (!instance) throw new Error('No instance');

        if (action === 'save') {
            // Save to Supabase
            const { error: dbError } = await supabase.from('crm_entries').upsert({
                contact_id: contactId,
                organization_id: instance.organization_id,
                data: data,
                updated_at: new Date().toISOString(),
            });
            if (dbError) throw dbError;

            // Save to Uazapi Storage (internal CRM)
            const uazResp = await fetch(`${uazapiBaseUrl}/storage/set`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
                body: JSON.stringify({ key: `crm_${contactId}`, value: JSON.stringify(data) }),
            });

            return new Response(JSON.stringify({ success: true, uazapi: uazResp.ok }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (action === 'sync_from_uazapi') {
            const uazResp = await fetch(`${uazapiBaseUrl}/storage/get/crm_${contactId}`, {
                method: 'GET',
                headers: { 'token': instance.zapi_token },
            });
            if (uazResp.ok) {
                const uazData = await uazResp.json();
                const parsed = JSON.parse(uazData.value);
                await supabase.from('crm_entries').upsert({
                    contact_id: contactId,
                    organization_id: instance.organization_id,
                    data: parsed,
                    updated_at: new Date().toISOString(),
                });
                return new Response(JSON.stringify({ success: true, data: parsed }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        return new Response(JSON.stringify({ error: 'Action not implemented' }), { status: 400 });

    } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
});
