import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Find all waiting_input executions with NULL timeout that have remarketing steps
  const { data: stuck, error } = await supabase
    .from('flow_executions')
    .select('id, current_node_id, flow_id, flow:flows(nodes)')
    .eq('status', 'waiting_input')
    .is('timeout_at', null)
    .eq('remarketing_step', 0);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let fixed = 0;
  for (const exec of (stuck || [])) {
    const nodes = (exec.flow?.nodes || []) as any[];
    const node = nodes.find((n: any) => n.id === exec.current_node_id);
    const steps = node?.data?.remarketingSteps as any[] || [];

    if (steps.length > 0) {
      const firstStep = steps[0];
      const delayMs = (firstStep.delayMinutes || 1) * 60 * 1000;
      const timeoutAt = new Date(Date.now() + delayMs).toISOString();

      console.log(`[FIX-REMARKETING] Fixing exec ${exec.id}: setting timeout in ${firstStep.delayMinutes}min`);

      await supabase.from('flow_executions').update({
        timeout_at: timeoutAt,
      }).eq('id', exec.id);

      fixed++;
    }
  }

  return new Response(JSON.stringify({ success: true, fixed, checked: stuck?.length || 0 }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
