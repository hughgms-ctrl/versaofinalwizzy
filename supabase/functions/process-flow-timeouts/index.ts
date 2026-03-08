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
      .select('id, flow_id, conversation_id, current_node_id, variables, remarketing_step, flow:flows(nodes, edges)')
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
        const currentStep = exec.remarketing_step || 0;

        // Find the current node to check for remarketing steps
        const currentNode = nodes.find((n: any) => n.id === currentNodeId);
        const remarketingSteps = currentNode?.data?.remarketingSteps as any[] || [];

        if (remarketingSteps.length > 0 && currentStep < remarketingSteps.length) {
          // There are still remarketing steps to send
          const step = remarketingSteps[currentStep];
          console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: sending remarketing step ${currentStep + 1}/${remarketingSteps.length}`);

          // Send the remarketing message
          if (step.message) {
            // Get conversation details for sending
            const { data: conv } = await supabase
              .from('conversations')
              .select('contact_id, organization_id, whatsapp_instance_id')
              .eq('id', exec.conversation_id)
              .single();

            if (conv) {
              const { data: contact } = await supabase
                .from('contacts')
                .select('phone')
                .eq('id', conv.contact_id)
                .single();

              if (contact?.phone) {
                // Replace variables in message
                const variables = exec.variables || {};
                let messageText = step.message;
                for (const [key, val] of Object.entries(variables as Record<string, any>)) {
                  messageText = messageText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
                }

                // Send via zapi-send-message
                try {
                  await fetch(`${supabaseUrl}/functions/v1/zapi-send-message`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${supabaseKey}`,
                    },
                    body: JSON.stringify({
                      organizationId: conv.organization_id,
                      conversationId: exec.conversation_id,
                      phone: contact.phone,
                      message: messageText,
                      isFromBot: true,
                    }),
                  });
                  console.log(`[FLOW TIMEOUTS] Sent remarketing message for exec ${exec.id}`);
                } catch (sendErr) {
                  console.error(`[FLOW TIMEOUTS] Error sending message:`, sendErr);
                }
              }
            }
          }

          // Calculate next timeout
          const nextStepIndex = currentStep + 1;
          let nextTimeoutAt: string | null = null;

          if (nextStepIndex < remarketingSteps.length) {
            const nextStep = remarketingSteps[nextStepIndex];
            const delayMs = nextStep.delayMinutes * 60 * 1000;
            nextTimeoutAt = new Date(Date.now() + delayMs).toISOString();
          } else {
            // Last step done — set a final short timeout to trigger the timeout edge
            nextTimeoutAt = new Date(Date.now() + 1000).toISOString(); // 1 second
          }

          // Update execution: advance step, set new timeout
          await supabase.from('flow_executions').update({
            remarketing_step: nextStepIndex,
            timeout_at: nextTimeoutAt,
          }).eq('id', exec.id);

          processed++;
        } else {
          // All remarketing steps exhausted (or none configured) — route via timeout edge
          const timeoutEdge = edges.find((e: any) => e.source === currentNodeId && e.sourceHandle === 'timeout');

          if (timeoutEdge) {
            const nextNodeId = timeoutEdge.target;
            console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: all steps exhausted, routing via timeout edge to ${nextNodeId}`);

            await supabase.from('flow_executions').update({
              status: 'running',
              current_node_id: nextNodeId,
              timeout_at: null,
              remarketing_step: 0,
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
            // No timeout edge — just complete
            console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: no timeout edge, completing flow.`);
            await supabase.from('flow_executions').update({
              status: 'completed',
              timeout_at: null,
              remarketing_step: 0,
              completed_at: new Date().toISOString(),
            }).eq('id', exec.id);
            processed++;
          }
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
