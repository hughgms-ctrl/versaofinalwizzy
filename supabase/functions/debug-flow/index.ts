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
        const supabase = createClient(supabaseUrl, supabaseKey);

        const flowId = 'b20eebad-5b5e-4f1b-af7c-b719a3f07ccb';
        const { data: flow } = await supabase.from('flows').select('*').eq('id', flowId).maybeSingle();

        const { data: tags } = await supabase.from('tags').select('*');
        const { data: contactTags } = await supabase.from('contact_tags').select('*, tags(*)').order('created_at', { ascending: false }).limit(20);

        return new Response(JSON.stringify({ flow, tags, contactTags }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
});
