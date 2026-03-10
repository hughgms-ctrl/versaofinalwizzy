import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * DIAGNOSTIC & RECOVERY TOOL for remarketing follow-ups.
 * 
 * Actions:
 * - "status": Show current state of all active follow-up executions
 * - "reactivate": Reactivate wrongly completed executions (requires flowId + completedAfter)
 * 
 * This tool does NOT auto-cancel. Cancellation logic is handled ONLY by:
 * 1. zapi-webhook (when contact responds)
 * 2. process-flow-timeouts (safety check before each send)
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'status';

  if (action === 'status') {
    // Show all active remarketing executions
    const { data: active } = await supabase
      .from('flow_executions')
      .select('id, conversation_id, remarketing_step, timeout_at, current_node_id, status, started_at')
      .eq('status', 'waiting_input')
      .order('started_at', { ascending: false })
      .limit(50);

    const withRemarketing = (active || []).filter(e => e.remarketing_step > 0 || e.timeout_at);

    return new Response(JSON.stringify({ 
      success: true, 
      total_waiting: active?.length || 0,
      with_remarketing: withRemarketing.length,
      executions: withRemarketing
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (action === 'reactivate') {
    const { flowId, completedAfter, completedBefore } = body;
    if (!flowId || !completedAfter) {
      return new Response(JSON.stringify({ error: 'flowId and completedAfter are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let query = supabase
      .from('flow_executions')
      .select('id, conversation_id, current_node_id, completed_at, started_at, flow_id')
      .eq('flow_id', flowId)
      .eq('status', 'completed')
      .gt('completed_at', completedAfter);

    if (completedBefore) {
      query = query.lt('completed_at', completedBefore);
    }

    const { data: canceled, error } = await query;

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let reactivated = 0;
    for (const exec of (canceled || [])) {
      // Find last follow-up sent
      const { data: lastFollowUp } = await supabase
        .from('messages')
        .select('created_at, metadata')
        .eq('conversation_id', exec.conversation_id)
        .eq('is_from_bot', true)
        .eq('metadata->>source', 'remarketing_followup')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastFollowUp) continue;
      const lastStep = (lastFollowUp.metadata as any)?.remarketing_step || 0;

      // Check if contact responded AFTER the last follow-up
      const { data: responseAfter } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', exec.conversation_id)
        .eq('is_from_bot', false)
        .gt('created_at', lastFollowUp.created_at)
        .limit(1)
        .maybeSingle();

      if (responseAfter) continue; // Contact responded, don't reactivate

      // Get flow to check remaining steps
      const { data: flow } = await supabase
        .from('flows')
        .select('nodes')
        .eq('id', flowId)
        .single();

      const nodes = (flow?.nodes || []) as any[];
      const node = nodes.find((n: any) => n.id === exec.current_node_id);
      const steps = node?.data?.remarketingSteps || [];

      if (lastStep < steps.length) {
        await supabase.from('flow_executions').update({
          status: 'waiting_input',
          completed_at: null,
          remarketing_step: lastStep,
          timeout_at: new Date(Date.now() + 60 * 1000).toISOString(),
        }).eq('id', exec.id);
        console.log(`[FIX-REMARKETING] Reactivated exec ${exec.id}: resuming from step ${lastStep + 1}/${steps.length}`);
        reactivated++;
      }
    }

    return new Response(JSON.stringify({ success: true, reactivated, checked: canceled?.length || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ error: 'Unknown action. Use "status" or "reactivate"' }), {
    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
