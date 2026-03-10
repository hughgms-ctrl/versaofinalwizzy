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
    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[FLOW TIMEOUTS] Checking for timed-out flow executions...');

    // Find all flow executions that are waiting_input and have passed their timeout
    const { data: timedOut, error } = await supabase
      .from('flow_executions')
      .select('id, flow_id, conversation_id, current_node_id, variables, remarketing_step, organization_id, flow:flows(nodes, edges, name)')
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
    }

    // Auto-fix: find waiting_input executions with NULL timeout that should have remarketing
    const { data: stuckExecs } = await supabase
      .from('flow_executions')
      .select('id, current_node_id, flow_id, remarketing_step, flow:flows(nodes)')
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

    if ((!timedOut || timedOut.length === 0) && autoFixed === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, autoFixed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[FLOW TIMEOUTS] Found ${timedOut.length} timed-out executions.`);
    let processed = 0;

    for (const exec of timedOut) {
      try {
        // Check if contact already responded — cancel follow-ups if so
        if ((exec.remarketing_step || 0) > 0) {
          const { data: recentMsg } = await supabase
            .from('messages')
            .select('id')
            .eq('conversation_id', exec.conversation_id)
            .eq('is_from_bot', false)
            .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (recentMsg) {
            console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: contact already responded — canceling follow-ups`);
            await supabase.from('flow_executions').update({
              status: 'completed',
              timeout_at: null,
              remarketing_step: 0,
              completed_at: new Date().toISOString(),
            }).eq('id', exec.id);
            processed++;
            continue;
          }
        }
        const nodes = (exec.flow?.nodes || []) as any[];
        const edges = (exec.flow?.edges || []) as any[];
        const currentNodeId = exec.current_node_id;
        const currentStep = exec.remarketing_step || 0;

        // Find the current node to check for remarketing steps
        const currentNode = nodes.find((n: any) => n.id === currentNodeId);
        const remarketingSteps = currentNode?.data?.remarketingSteps as any[] || [];

        // Check quiet hours
        const quietHoursEnabled = currentNode?.data?.remarketingQuietHours === true;
        if (quietHoursEnabled && remarketingSteps.length > 0 && currentStep < remarketingSteps.length) {
          const quietStart = currentNode?.data?.remarketingQuietStart || '22:00';
          const quietEnd = currentNode?.data?.remarketingQuietEnd || '08:00';
          
          const nowBR = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit', minute: '2-digit', hour12: false
          }).format(new Date());

          let isQuiet = false;
          if (quietStart <= quietEnd) {
            isQuiet = nowBR >= quietStart && nowBR < quietEnd;
          } else {
            // Crosses midnight (e.g., 22:00 - 08:00)
            isQuiet = nowBR >= quietStart || nowBR < quietEnd;
          }

          if (isQuiet) {
            // Reschedule for quiet end time
            const [endH, endM] = quietEnd.split(':').map(Number);
            const reschedule = new Date();
            // Convert to São Paulo time for scheduling
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

        if (remarketingSteps.length > 0 && currentStep < remarketingSteps.length) {
          // There are still remarketing steps to send
          const step = remarketingSteps[currentStep];
          console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: sending remarketing step ${currentStep + 1}/${remarketingSteps.length}`);

          // Send the remarketing message directly via UAZAPI
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

              // Get WhatsApp instance for UAZAPI token
              const { data: instance } = await supabase
                .from('whatsapp_instances')
                .select('zapi_instance_id, zapi_token')
                .eq('organization_id', conv.organization_id)
                .eq('status', 'connected')
                .limit(1)
                .single();

              if (contact?.phone && instance?.zapi_token) {
                // Replace variables in message
                const variables = exec.variables || {};
                let messageText = step.message;
                for (const [key, val] of Object.entries(variables as Record<string, any>)) {
                  messageText = messageText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
                }

                const normalizedPhone = contact.phone.replace(/\D/g, '');

                // Send directly via UAZAPI API
                try {
                  console.log(`[FLOW TIMEOUTS] Sending via UAZAPI: phone=${normalizedPhone}, message=${messageText.substring(0, 50)}...`);
                  
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
                    // Parse message ID from response
                    let zapiMessageId: string | null = null;
                    try {
                      const result = await uazapiResp.json();
                      zapiMessageId = result?.messageId || result?.id || result?.ID || result?.key?.id || null;
                    } catch { /* ignore */ }

                    // Save message to DB so it appears in the conversation UI
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

                    // Update conversation last_message_at
                    await supabase.from('conversations').update({ 
                      last_message_at: new Date().toISOString() 
                    }).eq('id', exec.conversation_id);

                    console.log(`[FLOW TIMEOUTS] Remarketing message sent and saved for exec ${exec.id} (step ${currentStep + 1})`);
                  }
                } catch (sendErr) {
                  console.error(`[FLOW TIMEOUTS] Error sending message via UAZAPI:`, sendErr);
                }
              } else {
                console.error(`[FLOW TIMEOUTS] Missing phone or instance for exec ${exec.id}`);
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

            // Cleanup conversation state
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

    console.log(`[FLOW TIMEOUTS] Processed ${processed} timed-out executions.`);

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