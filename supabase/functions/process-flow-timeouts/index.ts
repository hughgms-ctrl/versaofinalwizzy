import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * CRITICAL SAFETY: Check if a contact responded AFTER the last follow-up message.
 * This MUST check after the LAST follow-up, NOT after execution start.
 * Reason: contacts often send messages BEFORE follow-ups begin (initial flow interaction),
 * which should NOT cancel the follow-up sequence.
 */
async function contactRespondedAfterLastFollowUp(
  supabase: any, 
  conversationId: string,
  executionStartedAt: string
): Promise<boolean> {
  // 1. Find the last remarketing follow-up message we sent
  const { data: lastFollowUp } = await supabase
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('is_from_bot', true)
    .eq('metadata->>source', 'remarketing_followup')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 2. If no follow-up was ever sent, check after execution start
  //    BUT only count messages that came AFTER a reasonable grace period (5 min)
  //    to avoid counting the initial interaction that triggered the flow
  const referenceTime = lastFollowUp?.created_at || null;
  
  if (!referenceTime) {
    // No follow-up sent yet — we're at step 0, about to send step 1
    // Don't cancel based on old messages, only if something came in very recently
    // (the webhook should have already handled the response routing)
    return false;
  }

  // 3. Check if contact sent a message AFTER the last follow-up
  const { data: recentMsg } = await supabase
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('is_from_bot', false)
    .gt('created_at', referenceTime)
    .limit(1)
    .maybeSingle();

  return !!recentMsg;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[FLOW TIMEOUTS] Checking for timed-out flow executions...');

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1: AUTO-FIX — Find stuck executions (waiting_input, no timeout, step 0)
    // These are executions that should have had a timeout set but didn't
    // ═══════════════════════════════════════════════════════════════════
    const { data: stuckExecs } = await supabase
      .from('flow_executions')
      .select('id, current_node_id, flow_id, remarketing_step, started_at, conversation_id, flow:flows(nodes)')
      .eq('status', 'waiting_input')
      .is('timeout_at', null)
      .eq('remarketing_step', 0)
      .limit(20);

    let autoFixed = 0;
    for (const exec of (stuckExecs || [])) {
      const nodes = (exec.flow?.nodes || []) as any[];
      const node = nodes.find((n: any) => n.id === exec.current_node_id);
      const steps = node?.data?.remarketingSteps as any[] || [];
      
      if (steps.length > 0) {
        // SAFETY: Before auto-fixing, verify contact hasn't already responded
        const responded = await contactRespondedAfterLastFollowUp(
          supabase, exec.conversation_id, exec.started_at
        );
        
        if (responded) {
          // Contact responded — this execution should be completed, not fixed
          console.log(`[FLOW TIMEOUTS] Auto-fix skipped for exec ${exec.id}: contact already responded`);
          continue;
        }

        const firstStep = steps[0];
        const delayMs = (firstStep.delayMinutes || 1) * 60 * 1000;
        await supabase.from('flow_executions').update({
          timeout_at: new Date(Date.now() + delayMs).toISOString(),
        }).eq('id', exec.id);
        console.log(`[FLOW TIMEOUTS] Auto-fixed stuck exec ${exec.id}: timeout in ${firstStep.delayMinutes}min`);
        autoFixed++;
      }
    }
    if (autoFixed > 0) console.log(`[FLOW TIMEOUTS] Auto-fixed ${autoFixed} stuck executions.`);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2: Process timed-out executions (send follow-ups or route)
    // ═══════════════════════════════════════════════════════════════════
    const { data: timedOut, error } = await supabase
      .from('flow_executions')
      .select('id, flow_id, conversation_id, current_node_id, variables, remarketing_step, organization_id, started_at, flow:flows(nodes, edges, name)')
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
      return new Response(JSON.stringify({ success: true, processed: 0, autoFixed }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[FLOW TIMEOUTS] Found ${timedOut.length} timed-out executions.`);
    let processed = 0;

    for (const exec of timedOut) {
      try {
        // ═══════════════════════════════════════════════════════════════
        // SAFETY CHECK: Did the contact respond after the last follow-up?
        // This is the CRITICAL check that prevents sending follow-ups 
        // to contacts who already responded.
        // ═══════════════════════════════════════════════════════════════
        const responded = await contactRespondedAfterLastFollowUp(
          supabase, exec.conversation_id, exec.started_at
        );

        if (responded) {
          console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: contact responded after last follow-up — CANCELING remaining follow-ups`);
          
          // Route via 'responded' edge if available, otherwise complete
          const nodes = (exec.flow?.nodes || []) as any[];
          const edges = (exec.flow?.edges || []) as any[];
          const respondedEdge = edges.find((e: any) => e.source === exec.current_node_id && e.sourceHandle === 'responded');
          
          if (respondedEdge) {
            await supabase.from('flow_executions').update({
              status: 'running',
              current_node_id: respondedEdge.target,
              timeout_at: null,
              remarketing_step: 0,
            }).eq('id', exec.id);

            await fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
              body: JSON.stringify({
                flowId: exec.flow_id,
                conversationId: exec.conversation_id,
                startNodeId: respondedEdge.target,
              }),
            });
          } else {
            await supabase.from('flow_executions').update({
              status: 'completed',
              timeout_at: null,
              remarketing_step: 0,
              completed_at: new Date().toISOString(),
            }).eq('id', exec.id);
          }
          
          processed++;
          continue;
        }

        const nodes = (exec.flow?.nodes || []) as any[];
        const edges = (exec.flow?.edges || []) as any[];
        const currentNodeId = exec.current_node_id;
        const currentStep = exec.remarketing_step || 0;

        // Find the current node to check for remarketing steps
        const currentNode = nodes.find((n: any) => n.id === currentNodeId);
        // Chat follow-ups store steps in variables, flow nodes store in node data
        const execVars = (exec.variables || {}) as Record<string, any>;
        const isChatFollowUp = execVars.source === 'chat_follow_up';
        const remarketingSteps = isChatFollowUp
          ? (execVars.remarketingSteps as any[] || [])
          : (currentNode?.data?.remarketingSteps as any[] || []);

        // ═══════════════════════════════════════════════════════════════
        // QUIET HOURS: Pause sending during configured silent period
        // ═══════════════════════════════════════════════════════════════
        const quietHoursEnabled = isChatFollowUp
          ? (execVars.remarketingQuietHours === true)
          : (currentNode?.data?.remarketingQuietHours === true);
        if (quietHoursEnabled && remarketingSteps.length > 0 && currentStep < remarketingSteps.length) {
          const quietStart = isChatFollowUp ? (execVars.remarketingQuietStart || '22:00') : (currentNode?.data?.remarketingQuietStart || '22:00');
          const quietEnd = isChatFollowUp ? (execVars.remarketingQuietEnd || '08:00') : (currentNode?.data?.remarketingQuietEnd || '08:00');
          
          const nowBR = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit', minute: '2-digit', hour12: false
          }).format(new Date());

          let isQuiet = false;
          if (quietStart <= quietEnd) {
            isQuiet = nowBR >= quietStart && nowBR < quietEnd;
          } else {
            isQuiet = nowBR >= quietStart || nowBR < quietEnd;
          }

          if (isQuiet) {
            const [endH, endM] = quietEnd.split(':').map(Number);
            const reschedule = new Date();
            const spNow = new Date(reschedule.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
            spNow.setHours(endH, endM, 0, 0);
            if (spNow.getTime() <= Date.now()) {
              spNow.setDate(spNow.getDate() + 1);
            }
            
            console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: quiet hours active (${nowBR} in ${quietStart}-${quietEnd}). Rescheduling to ${spNow.toISOString()}`);
            await supabase.from('flow_executions').update({
              timeout_at: spNow.toISOString(),
            }).eq('id', exec.id);
            continue;
          }
        }

        // ═══════════════════════════════════════════════════════════════
        // SEND FOLLOW-UP or ROUTE via timeout edge
        // ═══════════════════════════════════════════════════════════════
        if (remarketingSteps.length > 0 && currentStep < remarketingSteps.length) {
          const step = remarketingSteps[currentStep];
          console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: sending remarketing step ${currentStep + 1}/${remarketingSteps.length}`);

          if (step.message) {
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

              const { data: instance } = await supabase
                .from('whatsapp_instances')
                .select('zapi_instance_id, zapi_token')
                .eq('organization_id', conv.organization_id)
                .eq('status', 'connected')
                .limit(1)
                .single();

              if (contact?.phone && instance?.zapi_token) {
                const variables = exec.variables || {};
                let messageText = step.message;
                for (const [key, val] of Object.entries(variables as Record<string, any>)) {
                  messageText = messageText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
                }

                const normalizedPhone = contact.phone.replace(/\D/g, '');

                try {
                  console.log(`[FLOW TIMEOUTS] Sending via UAZAPI: phone=${normalizedPhone}, step=${currentStep + 1}, message=${messageText.substring(0, 50)}...`);
                  
                  const uazapiResp = await fetch(`${uazapiBaseUrl}/send/text`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'token': instance.zapi_token,
                    },
                    body: JSON.stringify({
                      number: normalizedPhone,
                      text: messageText,
                    }),
                  });

                  if (!uazapiResp.ok) {
                    const errText = await uazapiResp.text();
                    console.error(`[FLOW TIMEOUTS] UAZAPI send failed: ${uazapiResp.status} ${errText}`);
                  } else {
                    let zapiMessageId: string | null = null;
                    try {
                      const result = await uazapiResp.json();
                      zapiMessageId = result?.messageId || result?.id || result?.ID || result?.key?.id || null;
                    } catch { /* ignore */ }

                    await supabase.from('messages').insert({
                      conversation_id: exec.conversation_id,
                      content: messageText,
                      type: 'text',
                      direction: 'outbound',
                      is_from_bot: true,
                      zapi_message_id: zapiMessageId,
                      metadata: { 
                        source: 'remarketing_followup',
                        remarketing_step: currentStep + 1,
                        flow_name: exec.flow?.name || null,
                      },
                    });

                    await supabase.from('conversations').update({ 
                      last_message_at: new Date().toISOString() 
                    }).eq('id', exec.conversation_id);

                    console.log(`[FLOW TIMEOUTS] ✅ Remarketing step ${currentStep + 1} sent for exec ${exec.id}`);
                  }
                } catch (sendErr) {
                  console.error(`[FLOW TIMEOUTS] Error sending message via UAZAPI:`, sendErr);
                }
              } else {
                console.error(`[FLOW TIMEOUTS] Missing phone or instance for exec ${exec.id}`);
              }
            }
          }

          // Schedule next step
          const nextStepIndex = currentStep + 1;
          let nextTimeoutAt: string | null = null;

          if (nextStepIndex < remarketingSteps.length) {
            const nextStep = remarketingSteps[nextStepIndex];
            const delayMs = nextStep.delayMinutes * 60 * 1000;
            nextTimeoutAt = new Date(Date.now() + delayMs).toISOString();
            console.log(`[FLOW TIMEOUTS] Next step ${nextStepIndex + 1} scheduled in ${nextStep.delayMinutes}min`);
          } else {
            // Last step done — short timeout to trigger the timeout edge
            nextTimeoutAt = new Date(Date.now() + 1000).toISOString();
            console.log(`[FLOW TIMEOUTS] All ${remarketingSteps.length} steps sent — will route via timeout edge next`);
          }

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
            // No timeout edge — complete the flow
            console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: no timeout edge, completing flow.`);
            await supabase.from('flow_executions').update({
              status: 'completed',
              timeout_at: null,
              remarketing_step: 0,
              completed_at: new Date().toISOString(),
            }).eq('id', exec.id);

            const { data: convData } = await supabase
              .from('conversations')
              .select('metadata')
              .eq('id', exec.conversation_id)
              .single();

            const cleanMeta = { ...(convData?.metadata || {}) };
            delete cleanMeta.ai_handoff_context;
            cleanMeta.flow_ended_at = new Date().toISOString();

            await supabase.from('conversations').update({
              service_mode: 'humano',
              ai_agent_id: null,
              metadata: cleanMeta,
            }).eq('id', exec.conversation_id);

            processed++;
          }
        }
      } catch (execError) {
        console.error(`[FLOW TIMEOUTS] Error processing exec ${exec.id}:`, execError);
      }
    }

    console.log(`[FLOW TIMEOUTS] ✅ Processed ${processed} executions, auto-fixed ${autoFixed}.`);

    return new Response(JSON.stringify({ success: true, processed, autoFixed }), {
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
