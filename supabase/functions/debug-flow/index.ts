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

        const { data: flows } = await supabase.from('flows')
            .select('id, name, nodes, edges')
            .ilike('name', '%AR%');

        const { data: masterPrompts } = await supabase.from('master_prompts')
            .select('*')
            .eq('is_active', true);

        const { data: aiAgents } = await supabase.from('ai_agents')
            .select('*')
            .eq('is_active', true);

        const { data: trainingRules } = await supabase.from('agent_training_rules')
            .select('*')
            .eq('is_active', true);

        const { data: recentExecutions } = await supabase.from('flow_executions')
            .select('*, flow:flows(name)')
            .order('started_at', { ascending: false })
            .limit(10);

        return new Response(JSON.stringify({ flows, masterPrompts, aiAgents, trainingRules, recentExecutions }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
    }
});
