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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[FLOW TIMEOUTS] Checking for timed-out flow executions...');

    // Find all flow executions that are waiting_input and have passed their timeout
    const { data: timedOut, error } = await supabase
      .from('flow_executions')
      .select('id, flow_id, conversation_id, current_node_id, variables, flow:flows(nodes, edges)')
      .eq('status', 'waiting_input')
      .not('timeout_at', 'is', null)
      .lt('timeout_at', new Date().toISOString())
      .limit(50);

    if (error) {
      console.error('[FLOW TIMEOUTS] Query error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!timedOut || timedOut.length === 0) {
      console.log('[FLOW TIMEOUTS] No timed-out executions found.');
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[FLOW TIMEOUTS] Found ${timedOut.length} timed-out executions.`);
    let processed = 0;

    for (const exec of timedOut) {
      try {
        const nodes = (exec.flow?.nodes || []) as any[];
        const edges = (exec.flow?.edges || []) as any[];
        const currentNodeId = exec.current_node_id;

        // Find the timeout edge from this node
        const timeoutEdge = edges.find((e: any) => e.source === currentNodeId && e.sourceHandle === 'timeout');
        
        if (timeoutEdge) {
          const nextNodeId = timeoutEdge.target;
          console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: routing via timeout edge to node ${nextNodeId}`);

          // Update execution to resume from timeout path
          await supabase.from('flow_executions').update({
            status: 'running',
            current_node_id: nextNodeId,
            timeout_at: null,
            variables: { ...(exec.variables || {}), _timeout: true },
          }).eq('id', exec.id);

          // Trigger flow-execute to continue
          await fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify({
              flowId: exec.flow_id,
              conversationId: exec.conversation_id,
              startNodeId: nextNodeId,
            }),
          });

          processed++;
        } else {
          // No timeout edge — just mark as completed (no remarketing path configured)
          console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: no timeout edge found, completing flow.`);
          await supabase.from('flow_executions').update({
            status: 'completed',
            timeout_at: null,
            completed_at: new Date().toISOString(),
          }).eq('id', exec.id);
          processed++;
        }
      } catch (execError) {
        console.error(`[FLOW TIMEOUTS] Error processing exec ${exec.id}:`, execError);
      }
    }

    console.log(`[FLOW TIMEOUTS] Processed ${processed} timed-out executions.`);

    return new Response(JSON.stringify({ success: true, processed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[FLOW TIMEOUTS] Fatal error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
