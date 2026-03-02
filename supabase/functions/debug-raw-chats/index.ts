import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: instances } = await supabase.from('whatsapp_instances').select('*').eq('status', 'connected');

        const results = [];
        for (const inst of (instances || [])) {
            const resp = await fetch(`${uazapiBaseUrl}/chat/list`, {
                headers: { 'token': inst.zapi_token }
            });
            const data = await resp.json();
            results.push({
                instance_phone: inst.phone_number,
                chat_count: Array.isArray(data) ? data.length : (data.data?.length || 0),
                raw_data: data
            });
        }

        return new Response(JSON.stringify(results), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
});
