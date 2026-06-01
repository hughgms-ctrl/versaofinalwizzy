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
  // 1. Find the last remarketing follow-up message we sent AFTER this execution started
  //    This prevents old follow-up messages from previous executions from interfering
  const { data: lastFollowUp } = await supabase
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('is_from_bot', true)
    .eq('metadata->>source', 'remarketing_followup')
    .gt('created_at', executionStartedAt)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 2. If no follow-up was sent in THIS execution, we're at step 0
  //    Check if contact sent a message AFTER this execution started
  //    (meaning they responded before we even sent the first follow-up)
  if (!lastFollowUp?.created_at) {
    // Check for inbound messages after execution start
    const { data: recentInbound } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('is_from_bot', false)
      .eq('direction', 'inbound')
      .gt('created_at', executionStartedAt)
      .limit(1)
      .maybeSingle();

    return !!recentInbound;
  }

  // 3. Check if contact sent a message AFTER the last follow-up of THIS execution
  const { data: recentMsg } = await supabase
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('is_from_bot', false)
    .gt('created_at', lastFollowUp.created_at)
    .limit(1)
    .maybeSingle();

  return !!recentMsg;
}

function getNowInSaoPauloHHMM(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function toMinutes(hhmm: string, fallback: string): number {
  const [h, m] = (hhmm || fallback).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) {
    const [fh, fm] = fallback.split(':').map(Number);
    return fh * 60 + fm;
  }
  return h * 60 + m;
}

function isWithinQuietHours(nowHHMM: string, quietStart: string, quietEnd: string): boolean {
  const nowMin = toMinutes(nowHHMM, '00:00');
  const startMin = toMinutes(quietStart, '22:00');
  const endMin = toMinutes(quietEnd, '08:00');

  if (startMin <= endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }

  // Overnight window (e.g. 19:00 -> 08:00)
  return nowMin >= startMin || nowMin < endMin;
}

function minutesUntilQuietEnd(nowHHMM: string, quietEnd: string): number {
  const nowMin = toMinutes(nowHHMM, '00:00');
  const endMin = toMinutes(quietEnd, '08:00');

  if (nowMin < endMin) {
    return endMin - nowMin;
  }

  return (24 * 60 - nowMin) + endMin;
}

type Provider = 'evolution' | 'uazapi';

function normalizeBaseUrl(value?: string | null): string {
  return (value || '').trim().replace(/\/$/, '');
}

async function loadConnectionSettings(supabase: any) {
  const { data: row } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'whatsapp_connection_settings')
    .maybeSingle();
  const value = row?.value || {};
  return {
    uazapiBaseUrl: normalizeBaseUrl(value.uazapi_base_url || Deno.env.get('UAZAPI_BASE_URL')),
    evolutionBaseUrl: normalizeBaseUrl(value.evolution_base_url || Deno.env.get('EVOLUTION_BASE_URL')),
    evolutionApiKey: value.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY') || '',
  };
}

function getProvider(instance: any): Provider {
  if (instance?.provider === 'evolution' || instance?.evolution_instance_name || instance?.evolution_instance_id) {
    return 'evolution';
  }
  return 'uazapi';
}

function guessMimeType(type: string, mediaUrl?: string): string {
  const lower = (mediaUrl || '').toLowerCase();
  if (type === 'image') {
    if (lower.includes('.png')) return 'image/png';
    if (lower.includes('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
  if (type === 'audio') {
    if (lower.includes('.ogg')) return 'audio/ogg';
    if (lower.includes('.mpeg') || lower.includes('.mp3')) return 'audio/mpeg';
    if (lower.includes('.webm')) return 'audio/webm';
    return 'audio/mp4';
  }
  if (type === 'video') {
    if (lower.includes('.webm')) return 'video/webm';
    if (lower.includes('.3gp')) return 'video/3gpp';
    return 'video/mp4';
  }
  if (type === 'document') {
    if (lower.includes('.pdf')) return 'application/pdf';
    return 'application/octet-stream';
  }
  return 'application/octet-stream';
}

function fileNameFromUrl(mediaUrl?: string, fallback = 'arquivo') {
  if (!mediaUrl) return fallback;
  try {
    const pathname = new URL(mediaUrl).pathname;
    const name = pathname.split('/').filter(Boolean).pop();
    return name || fallback;
  } catch {
    return fallback;
  }
}

async function parseProviderMessageId(response: Response): Promise<string | null> {
  try {
    const result = await response.clone().json();
    return result?.messageId || result?.id || result?.ID || result?.key?.id || null;
  } catch {
    return null;
  }
}

async function loadConversationInstance(supabase: any, organizationId: string, conversationInstanceId?: string | null) {
  if (conversationInstanceId) {
    const { data } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', conversationInstanceId)
      .eq('organization_id', organizationId)
      .eq('status', 'connected')
      .maybeSingle();
    if (data) return data;
  }

  const { data } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'connected')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function sendFollowUpProviderMessage(params: {
  settings: Awaited<ReturnType<typeof loadConnectionSettings>>;
  instance: any;
  phone: string;
  messageText: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
}) {
  const { settings, instance, phone, messageText, mediaUrl } = params;
  const provider = getProvider(instance);
  const normalizedPhone = phone.replace(/\D/g, '');
  const mediaType = (params.mediaType || 'image') as 'image' | 'video' | 'audio' | 'document';
  const hasMedia = !!mediaUrl;

  if (provider === 'evolution') {
    const evolutionBaseUrl = settings.evolutionBaseUrl;
    const evolutionApiKey = instance.evolution_api_key || settings.evolutionApiKey || instance.zapi_token;
    const evolutionInstanceName = instance.evolution_instance_name || instance.zapi_instance_id || instance.evolution_instance_id;
    if (!evolutionBaseUrl || !evolutionApiKey || !evolutionInstanceName) {
      throw new Error('Evolution API not configured for follow-up');
    }

    if (hasMedia) {
      const body: Record<string, unknown> = mediaType === 'audio'
        ? { number: normalizedPhone, audio: mediaUrl, delay: 1000, linkPreview: true }
        : {
          number: normalizedPhone,
          mediatype: mediaType,
          mimetype: guessMimeType(mediaType, mediaUrl || undefined),
          caption: messageText || undefined,
          media: mediaUrl,
          fileName: fileNameFromUrl(mediaUrl || undefined, `${mediaType}-${Date.now()}`),
          delay: 1000,
          linkPreview: true,
        };
      const endpoint = mediaType === 'audio'
        ? `${evolutionBaseUrl}/message/sendWhatsAppAudio/${evolutionInstanceName}`
        : `${evolutionBaseUrl}/message/sendMedia/${evolutionInstanceName}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionApiKey },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Evolution media send failed: ${response.status} ${await response.text()}`);
      return { provider, zapiMessageId: await parseProviderMessageId(response), msgType: mediaType };
    }

    const response = await fetch(`${evolutionBaseUrl}/message/sendText/${evolutionInstanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evolutionApiKey },
      body: JSON.stringify({ number: normalizedPhone, text: messageText, delay: 1000, linkPreview: true }),
    });
    if (!response.ok) throw new Error(`Evolution text send failed: ${response.status} ${await response.text()}`);
    return { provider, zapiMessageId: await parseProviderMessageId(response), msgType: 'text' };
  }

  if (!settings.uazapiBaseUrl || !instance.zapi_token) {
    throw new Error('UAZAPI not configured for follow-up');
  }

  if (hasMedia) {
    const body: Record<string, unknown> = {
      number: normalizedPhone,
      file: mediaUrl,
      type: mediaType,
      mimetype: guessMimeType(mediaType, mediaUrl || undefined),
      mimeType: guessMimeType(mediaType, mediaUrl || undefined),
      fileName: fileNameFromUrl(mediaUrl || undefined, `${mediaType}-${Date.now()}`),
    };
    if (messageText) body.caption = messageText;
    if (mediaType === 'audio') body.ptt = true;
    const response = await fetch(`${settings.uazapiBaseUrl}/send/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: instance.zapi_token },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`UAZAPI media send failed: ${response.status} ${await response.text()}`);
    return { provider, zapiMessageId: await parseProviderMessageId(response), msgType: mediaType };
  }

  const response = await fetch(`${settings.uazapiBaseUrl}/send/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: instance.zapi_token },
    body: JSON.stringify({ number: normalizedPhone, text: messageText }),
  });
  if (!response.ok) throw new Error(`UAZAPI text send failed: ${response.status} ${await response.text()}`);
  return { provider, zapiMessageId: await parseProviderMessageId(response), msgType: 'text' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const connectionSettings = await loadConnectionSettings(supabase);

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
    // PHASE 1.5: RECOVERY — Catch-up old quiet-hours schedules that were pushed to the wrong day
    // (legacy bug for chat follow-up created during silent period)
    // ═══════════════════════════════════════════════════════════════════
    const nowIso = new Date().toISOString();
    const nowBR = getNowInSaoPauloHHMM();

    const { data: quietRecoveryCandidates } = await supabase
      .from('flow_executions')
      .select('id, started_at, timeout_at, variables')
      .eq('status', 'waiting_input')
      .eq('remarketing_step', 0)
      .not('timeout_at', 'is', null)
      .gt('timeout_at', nowIso)
      .eq('variables->>source', 'chat_follow_up')
      .eq('variables->>remarketingQuietHours', 'true')
      .limit(200);

    let recoveredFromQuietBug = 0;
    for (const exec of (quietRecoveryCandidates || [])) {
      const vars = (exec.variables || {}) as Record<string, any>;
      const steps = (vars.remarketingSteps as any[]) || [];
      if (!steps.length) continue;

      const quietStart = String(vars.remarketingQuietStart || '22:00');
      const quietEnd = String(vars.remarketingQuietEnd || '08:00');
      const isQuietNow = isWithinQuietHours(nowBR, quietStart, quietEnd);
      if (isQuietNow) continue;

      const firstDelayMinutes = Number(steps[0]?.delayMinutes || 1);
      const expectedFirstSendAtMs = new Date(exec.started_at).getTime() + firstDelayMinutes * 60 * 1000;

      if (expectedFirstSendAtMs <= Date.now()) {
        await supabase
          .from('flow_executions')
          .update({ timeout_at: new Date(Date.now() - 1000).toISOString() })
          .eq('id', exec.id);

        recoveredFromQuietBug++;
      }
    }

    if (recoveredFromQuietBug > 0) {
      console.log(`[FLOW TIMEOUTS] Recovered ${recoveredFromQuietBug} quiet-hours executions stuck in future schedule.`);
    }

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
      return new Response(JSON.stringify({ success: true, processed: 0, autoFixed, recoveredFromQuietBug }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[FLOW TIMEOUTS] Found ${timedOut.length} timed-out executions.`);
    let processed = 0;

    for (const exec of timedOut) {
      try {
        // ═══════════════════════════════════════════════════════════════
        // SAFETY CHECK 0: Is the AI paused or disabled for this conversation?
        // Chat follow-ups are AI-triggered actions — if the user paused/disabled
        // the AI, we MUST NOT keep sending automated follow-up messages.
        // ═══════════════════════════════════════════════════════════════
        const execVarsEarly = (exec.variables || {}) as Record<string, any>;
        const isChatFollowUpEarly = execVarsEarly.source === 'chat_follow_up';

        if (isChatFollowUpEarly) {
          const { data: convCheck } = await supabase
            .from('conversations')
            .select('service_mode, metadata')
            .eq('id', exec.conversation_id)
            .single();

          const pausedUntil = (convCheck?.metadata as any)?.ai_paused_until;
          const isPaused = pausedUntil === 'permanent' || (pausedUntil && new Date(pausedUntil).getTime() > Date.now());
          const aiDisabled = convCheck?.service_mode && convCheck.service_mode !== 'ia';

          if (isPaused || aiDisabled) {
            console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: AI is paused/disabled (service_mode=${convCheck?.service_mode}, paused=${isPaused}) — CANCELING chat follow-up`);
            await supabase.from('flow_executions').update({
              status: 'completed',
              timeout_at: null,
              remarketing_step: 0,
              completed_at: new Date().toISOString(),
              error_message: 'Cancelled: AI was paused or disabled by human agent',
            }).eq('id', exec.id);
            processed++;
            continue;
          }
        }

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
                resumeExecutionId: exec.id,
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
          const quietStart = String(isChatFollowUp ? (execVars.remarketingQuietStart || '22:00') : (currentNode?.data?.remarketingQuietStart || '22:00'));
          const quietEnd = String(isChatFollowUp ? (execVars.remarketingQuietEnd || '08:00') : (currentNode?.data?.remarketingQuietEnd || '08:00'));
          const nowBR = getNowInSaoPauloHHMM();

          if (isWithinQuietHours(nowBR, quietStart, quietEnd)) {
            const minutesToResume = Math.max(1, minutesUntilQuietEnd(nowBR, quietEnd));
            const resumeAt = new Date(Date.now() + minutesToResume * 60 * 1000);

            console.log(
              `[FLOW TIMEOUTS] Exec ${exec.id}: quiet hours active (${nowBR} in ${quietStart}-${quietEnd}). Rescheduling to ${resumeAt.toISOString()}`
            );

            await supabase.from('flow_executions').update({
              timeout_at: resumeAt.toISOString(),
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
          let followUpSent = !(step.message || step.mediaUrl);

          if (step.message || step.mediaUrl) {
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

              const instance = await loadConversationInstance(
                supabase,
                conv.organization_id,
                conv.whatsapp_instance_id,
              );

              if (contact?.phone && instance) {
                const variables = exec.variables || {};
                let messageText = step.message || '';
                for (const [key, val] of Object.entries(variables as Record<string, any>)) {
                  messageText = messageText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
                }

                const hasMedia = !!step.mediaUrl;
                const mediaType = step.mediaType || 'image';

                try {
                  console.log(`[FLOW TIMEOUTS] Sending follow-up via ${getProvider(instance)}: step=${currentStep + 1}, media=${hasMedia ? mediaType : 'none'}`);
                  const { provider, zapiMessageId, msgType } = await sendFollowUpProviderMessage({
                    settings: connectionSettings,
                    instance,
                    phone: contact.phone,
                    messageText,
                    mediaUrl: step.mediaUrl,
                    mediaType,
                  });

                  // Save to messages table
                  if (zapiMessageId || messageText || hasMedia) {
                    await supabase.from('messages').insert({
                      conversation_id: exec.conversation_id,
                      content: messageText || '',
                      type: msgType,
                      direction: 'outbound',
                      is_from_bot: true,
                      media_url: hasMedia ? step.mediaUrl : null,
                      zapi_message_id: zapiMessageId,
                      metadata: { 
                        source: 'remarketing_followup',
                        remarketing_step: currentStep + 1,
                        flow_name: exec.flow?.name || null,
                        provider,
                      },
                    });

                    await supabase.from('conversations').update({ 
                      last_message_at: new Date().toISOString() 
                    }).eq('id', exec.conversation_id);
                    followUpSent = true;

                    console.log(`[FLOW TIMEOUTS] ✅ Remarketing step ${currentStep + 1} sent for exec ${exec.id}`);
                  }
                } catch (sendErr) {
                  console.error(`[FLOW TIMEOUTS] Error sending follow-up message:`, sendErr);
                }
              } else {
                console.error(`[FLOW TIMEOUTS] Missing phone or instance for exec ${exec.id}`);
              }
            }
          }

          if (!followUpSent) {
            const retryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
            await supabase.from('flow_executions').update({
              timeout_at: retryAt,
              error_message: 'Follow-up send failed; retry scheduled',
            }).eq('id', exec.id);
            console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: follow-up was not sent; retry scheduled at ${retryAt}`);
            processed++;
            continue;
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
                resumeExecutionId: exec.id,
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

            // ═══════════════════════════════════════════════════════════════
            // PIPELINE MOVE: Move conversation when follow-up exhausted
            // ═══════════════════════════════════════════════════════════════
            const execVarsMove = (exec.variables || {}) as Record<string, any>;
            const movePipelineId = execVarsMove.movePipelineId;
            const moveColumnId = execVarsMove.moveColumnId;

            if (movePipelineId && moveColumnId) {
              console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: moving conversation to pipeline ${movePipelineId} column ${moveColumnId}`);
              
              const { data: existingPos } = await supabase
                .from('conversation_pipeline_positions')
                .select('id, column_id')
                .eq('conversation_id', exec.conversation_id)
                .maybeSingle();

              const fromColumnId = existingPos?.column_id || null;

              if (existingPos) {
                await supabase.from('conversation_pipeline_positions').update({
                  pipeline_id: movePipelineId,
                  column_id: moveColumnId,
                  order: 0,
                  updated_at: new Date().toISOString(),
                }).eq('id', existingPos.id);
              } else {
                await supabase.from('conversation_pipeline_positions').insert({
                  conversation_id: exec.conversation_id,
                  pipeline_id: movePipelineId,
                  column_id: moveColumnId,
                  order: 0,
                });
              }

              // Log stage change
              await supabase.from('conversation_stage_history').insert({
                conversation_id: exec.conversation_id,
                pipeline_id: movePipelineId,
                from_column_id: fromColumnId,
                to_column_id: moveColumnId,
                changed_by_type: 'followup_exhausted',
                organization_id: exec.organization_id,
              });

              console.log(`[FLOW TIMEOUTS] ✅ Conversation moved after follow-up exhaustion`);
            }

            processed++;
          }
        }
      } catch (execError) {
        console.error(`[FLOW TIMEOUTS] Error processing exec ${exec.id}:`, execError);
      }
    }

    console.log(`[FLOW TIMEOUTS] ✅ Processed ${processed} executions, auto-fixed ${autoFixed}, recovered ${recoveredFromQuietBug}.`);

    return new Response(JSON.stringify({ success: true, processed, autoFixed, recoveredFromQuietBug }), {
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
