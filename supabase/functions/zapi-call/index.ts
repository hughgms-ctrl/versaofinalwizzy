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

        const { phone, type = 'audio', instanceId } = await req.json();

        let instance;
        if (instanceId) {
            const { data } = await supabase.from('whatsapp_instances').select('*').eq('id', instanceId).single();
            instance = data;
        } else {
            const { data: instances } = await supabase.from('whatsapp_instances').select('*').eq('status', 'connected').limit(1);
            instance = instances?.[0];
        }

        if (!instance) throw new Error('No instance');

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
