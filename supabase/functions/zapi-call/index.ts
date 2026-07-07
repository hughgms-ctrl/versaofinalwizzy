import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUserOrganizationIds } from '../_shared/access.ts';

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

        const { phone, type = 'audio', instanceId } = await req.json();

        // IDOR guard: só instâncias das orgs de que o caller é membro.
        const orgIds = await getUserOrganizationIds(supabase, user.id);
        if (orgIds.length === 0) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        let instance;
        if (instanceId) {
            const { data } = await supabase.from('whatsapp_instances').select('*').eq('id', instanceId).in('organization_id', orgIds).maybeSingle();
            instance = data;
        } else {
            const { data: instances } = await supabase.from('whatsapp_instances').select('*').eq('status', 'connected').in('organization_id', orgIds).limit(1);
            instance = instances?.[0];
        }

        if (!instance) {
            return new Response(JSON.stringify({ error: 'Instance not found' }), {
                status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const normalizedPhone = phone.replace(/\D/g, '');
        console.log(`[Call] Initiating ${type} call to ${normalizedPhone}`);

        const response = await fetch(`${uazapiBaseUrl}/call/make`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
            body: JSON.stringify({ number: normalizedPhone, type }), // type: 'audio' | 'video'
        });

        const data = await response.json();
        return new Response(JSON.stringify({ success: response.ok, data }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
});
