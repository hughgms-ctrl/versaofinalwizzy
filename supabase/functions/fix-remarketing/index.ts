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

  const { action } = await req.json().catch(() => ({ action: 'check' }));

  if (action === 'reactivate') {
    // Reactivate wrongly canceled executions at node_2 of flow 9eecfd1a
    // These were completed by the previous fix-remarketing but should still be sending follow-ups
    const flowId = '9eecfd1a-5318-4b5e-8834-ca06fec2b4c8';
    
    const { data: canceled, error } = await supabase
      .from('flow_executions')
      .select('id, conversation_id, current_node_id, completed_at, started_at')
      .eq('flow_id', flowId)
      .eq('status', 'completed')
      .eq('current_node_id', 'node_2')
      .gt('completed_at', '2026-03-10T14:00:00Z')
      .lt('completed_at', '2026-03-10T15:00:00Z');

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let reactivated = 0;
    for (const exec of (canceled || [])) {
      // Check the last remarketing message sent for this conversation
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
      const { data: responseAfterFollowUp } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', exec.conversation_id)
        .eq('is_from_bot', false)
        .gt('created_at', lastFollowUp.created_at)
        .limit(1)
        .maybeSingle();

      if (responseAfterFollowUp) {
        console.log(`[FIX-REMARKETING] Exec ${exec.id}: contact DID respond after follow-up, keeping completed`);
        continue;
      }

      // Reactivate: set back to waiting_input with next step timeout
      // Get the flow to find remarketing steps
      const { data: flow } = await supabase
        .from('flows')
        .select('nodes')
        .eq('id', flowId)
        .single();

      const nodes = (flow?.nodes || []) as any[];
      const node = nodes.find((n: any) => n.id === exec.current_node_id);
      const steps = node?.data?.remarketingSteps || [];

      if (lastStep < steps.length) {
        // Schedule next step immediately (it's overdue)
        await supabase.from('flow_executions').update({
          status: 'waiting_input',
          completed_at: null,
          remarketing_step: lastStep,
          timeout_at: new Date(Date.now() + 60 * 1000).toISOString(), // 1 minute from now
        }).eq('id', exec.id);
        console.log(`[FIX-REMARKETING] Reactivated exec ${exec.id}: resuming from step ${lastStep + 1}/${steps.length}`);
        reactivated++;
      }
    }

    return new Response(JSON.stringify({ success: true, reactivated, checked: canceled?.length || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Default: check and cancel only if contact responded AFTER the last follow-up message
  const { data: active, error } = await supabase
    .from('flow_executions')
    .select('id, conversation_id, remarketing_step, started_at')
    .eq('status', 'waiting_input')
    .gt('remarketing_step', 0);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let canceled = 0;
  for (const exec of (active || [])) {
    // Find the last follow-up message sent
    const { data: lastFollowUp } = await supabase
      .from('messages')
      .select('created_at')
      .eq('conversation_id', exec.conversation_id)
      .eq('is_from_bot', true)
      .eq('metadata->>source', 'remarketing_followup')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check if contact responded AFTER the last follow-up (not after execution start)
    const checkAfter = lastFollowUp?.created_at || exec.started_at;
    const { data: recentMsg } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', exec.conversation_id)
      .eq('is_from_bot', false)
      .gt('created_at', checkAfter)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentMsg) {
      console.log(`[FIX-REMARKETING] Canceling exec ${exec.id}: contact responded after follow-up`);
      await supabase.from('flow_executions').update({
        status: 'completed',
        timeout_at: null,
        remarketing_step: 0,
        completed_at: new Date().toISOString(),
      }).eq('id', exec.id);
      canceled++;
    }
  }

  return new Response(JSON.stringify({ success: true, canceled, checked: active?.length || 0 }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
