import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrchestrationState {
  master_prompt_id: string;
  current_node_id: string | null;
  completed_nodes: string[];
  waiting_for_response: boolean;
  active_agent_id?: string;
  flow_completed?: boolean;
  document_context?: DocumentCollectionContext;
}

interface DocumentCollectionContext {
  template_id: string;
  template_name: string;
  template_content: string;
  fields: { name: string; label: string; type: string }[];
  collected_data: Record<string, string>;
  require_confirmation: boolean;
  send_pdf_in_chat: boolean;
  send_signature_link: boolean;
  signing_method: string;
  additional_instructions: string;
  confirmed: boolean;
  pdf_generated?: boolean;
  pdf_url?: string;
  signature_requested?: boolean;
  // Pack support
  is_pack?: boolean;
  pack_id?: string;
  pack_name?: string;
  pack_template_ids?: string[];
  pack_templates?: { id: string; name: string; content: string }[];
}

const MAX_TOOL_ROUNDS = 3;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const payload = await req.json();
    const { conversationId, messageContent, masterPromptOverride, additionalContext, flowExecutionId } = payload;

    // ===== SIMULATION MODE =====
    // Called by the Flow Builder simulator. Uses exact same prompt-building logic
    // but skips DB writes/ZAPI and takes conversation history from the request body.
    if (payload.simulationMode) {
      const simResult = await handleSimulation(supabase, payload, LOVABLE_API_KEY!);
      return new Response(JSON.stringify(simResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!conversationId || !messageContent) {
      return new Response(JSON.stringify({ error: 'conversationId and messageContent are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Has flowExecutionId:', !!flowExecutionId);

    console.log('=== AGENT ORCHESTRATOR START ===');
    console.log('ConversationId:', conversationId);
    console.log('Has masterPromptOverride:', !!masterPromptOverride, typeof masterPromptOverride);
    console.log('Has additionalContext:', !!additionalContext);

    // 1. Load conversation with contact
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*, contact:contacts(*)')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('Conversation not found:', convError);
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const organizationId = conversation.organization_id;
    const contactId = conversation.contact_id;

    // 2. Resolve the active master prompt
    let masterPrompt = null;

    if (masterPromptOverride && typeof masterPromptOverride === 'object' && masterPromptOverride.content) {
      // Proper object override from flow-execute (has id, name, content)
      masterPrompt = masterPromptOverride;
      console.log('Using provided masterPromptOverride object:', masterPrompt.name);
    } else if (masterPromptOverride && typeof masterPromptOverride === 'string') {
      // Legacy: string override — wrap it as a prompt object
      masterPrompt = {
        id: 'override',
        name: 'Override Prompt',
        content: masterPromptOverride,
        is_active: true,
      };
      console.log('Using string masterPromptOverride (wrapped)');
    } else {
      masterPrompt = await resolveActiveMasterPrompt(supabase, conversation);
    }

    // Append additionalContext to the master prompt content if provided
    if (additionalContext && masterPrompt?.content) {
      masterPrompt = {
        ...masterPrompt,
        content: masterPrompt.content + `\n\n---\nINSTRUÇÕES ADICIONAIS DO NÓ DO FLUXO:\n${additionalContext}`,
      };
    }

    // Fallback: if no master prompt, try to build one from the agent's own prompt_base + additionalContext
    if (!masterPrompt && conversation.ai_agent_id) {
      const { data: agent } = await supabase.from('ai_agents').select('*').eq('id', conversation.ai_agent_id).single();
      if (agent && (agent.prompt_base || additionalContext)) {
        const parts: string[] = [];
        if (agent.prompt_base) parts.push(agent.prompt_base);
        if (agent.persona) parts.push(`PERSONA: ${agent.persona}`);
        if (additionalContext) parts.push(`---\nINSTRUÇÕES ADICIONAIS DO NÓ DO FLUXO:\n${additionalContext}`);
        masterPrompt = {
          id: `agent-${agent.id}`,
          name: `Agent: ${agent.name}`,
          content: parts.join('\n\n'),
          is_active: true,
        };
        console.log('Using agent prompt_base as master prompt fallback:', agent.name);
      }
    }

    // Last resort: use additionalContext alone as prompt
    if (!masterPrompt && additionalContext) {
      masterPrompt = {
        id: 'flow-context',
        name: 'Flow Context Prompt',
        content: additionalContext,
        is_active: true,
      };
      console.log('Using additionalContext alone as master prompt');
    }

    if (!masterPrompt) {
      console.log('No active master prompt found');
      return new Response(JSON.stringify({ success: false, reason: 'no_master_prompt' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Using master prompt:', masterPrompt.id, masterPrompt.name);

    // 3. Load context in parallel (including training rules)
    const [
      messagesResult, agentsResult, tagsResult, contactTagsResult,
      pipelinesResult, pipelinePositionsResult, flowsResult, workspaceConfig, integrationConfig,
      trainingRulesResult,
    ] = await Promise.all([
      supabase.from('messages').select('*').eq('conversation_id', conversationId)
        .order('created_at', { ascending: false }).limit(30),
      supabase.from('ai_agents').select('*').eq('organization_id', organizationId).eq('is_active', true),
      supabase.from('tags').select('*').eq('organization_id', organizationId),
      supabase.from('contact_tags').select('*, tag:tags(*)').eq('contact_id', contactId),
      supabase.from('pipelines').select('*, columns:pipeline_columns!pipeline_columns_pipeline_id_fkey(*)').eq('organization_id', organizationId),
      supabase.from('conversation_pipeline_positions')
        .select('*, pipeline:pipelines(name), column:pipeline_columns(name)')
        .eq('conversation_id', conversationId),
      supabase.from('flows').select('id, name, description').eq('organization_id', organizationId).eq('is_active', true),
      resolveWorkspaceConfig(supabase, conversation),
      resolveIntegrationConfig(supabase, organizationId),
      supabase.from('agent_training_rules').select('*')
        .eq('organization_id', organizationId).eq('is_active', true),
    ]);

    const rawMessages = (messagesResult.data || []).reverse();
    const agents = agentsResult.data || [];

    // Fetch media transcriptions for messages that are audio/image/video
    const mediaMessageIds = rawMessages
      .filter((m: any) => ['audio', 'image', 'video'].includes(m.type) && m.id)
      .map((m: any) => m.id);

    let transcriptionsMap: Record<string, string> = {};
    if (mediaMessageIds.length > 0) {
      const { data: transcriptions } = await supabase
        .from('media_transcriptions')
        .select('message_id, transcription')
        .in('message_id', mediaMessageIds);
      if (transcriptions) {
        for (const t of transcriptions) {
          transcriptionsMap[t.message_id] = t.transcription;
        }
      }
    }

    // Enrich messages with transcription content
    const messages = rawMessages.map((m: any) => {
      if (transcriptionsMap[m.id]) {
        const typeLabel = m.type === 'audio' ? '🎤 Áudio transcrito' : m.type === 'image' ? '🖼️ Descrição da imagem' : '🎥 Descrição do vídeo';
        const enrichedContent = m.content
          ? `${m.content}\n\n[${typeLabel}: ${transcriptionsMap[m.id]}]`
          : `[${typeLabel}: ${transcriptionsMap[m.id]}]`;
        return { ...m, content: enrichedContent };
      }
      return m;
    });
    const allTags = tagsResult.data || [];
    const contactTags = contactTagsResult.data || [];
    const pipelines = pipelinesResult.data || [];
    const pipelinePositions = pipelinePositionsResult.data || [];
    const flows = flowsResult.data || [];
    const trainingRules = trainingRulesResult.data || [];
    console.log(`[ORCHESTRATOR] Loaded ${trainingRules.length} active training rules for org ${organizationId}`);

    // Resolve AI config: masterPrompt > integration_configs > workspace_agent_configs > defaults
    const masterProvider = masterPrompt.provider || integrationConfig?.ai_provider || 'lovable';
    const masterModel = masterPrompt.model || integrationConfig?.default_model || 'google/gemini-3-flash-preview';

    const aiConfig = resolveAIConfig(integrationConfig, 'agents', LOVABLE_API_KEY!, masterProvider, masterModel);
    const aiModel = aiConfig.model;

    const context = {
      conversationId, contactId, organizationId, conversation,
      messages, agents, allTags, contactTags, pipelines, pipelinePositions,
      flows, aiModel, masterPrompt, LOVABLE_API_KEY,
      aiEndpoint: aiConfig.endpoint, aiApiKey: aiConfig.apiKey,
      integrationConfig, flowExecutionId, trainingRules,
    };

    // 4. Resolve flow_id from available sources
    let resolvedFlowId = (masterPrompt as any).flow_id || null;
    if (!resolvedFlowId && flowExecutionId) {
      const { data: flowExec } = await supabase
        .from('flow_executions')
        .select('flow_id')
        .eq('id', flowExecutionId)
        .single();
      if (flowExec) resolvedFlowId = flowExec.flow_id;
    }

    // Inject resolvedFlowId into context so training rules can match flow_node rules
    (context as any).resolvedFlowId = resolvedFlowId;

    // 5. Check for flow-based orchestration
    const flowNodes = masterPrompt.agent_rules?.orchestration_nodes;
    const flowEdges = masterPrompt.agent_rules?.orchestration_edges;

    let result;
    if (flowNodes && flowNodes.length > 0) {
      console.log('Using FLOW ENGINE (state machine)');
      result = await executeFlowOrchestration(supabase, context, flowNodes, flowEdges || [], enrichedMessageContent);
    } else {
      console.log('Using LEGACY orchestration (AI-only)');
      result = await executeLegacyOrchestration(supabase, context, enrichedMessageContent);
    }

    // 6. Send reply (strip any leaked internal annotations)
    if (result.replyText) {
      result.replyText = stripInternalAnnotations(result.replyText);
    }
    if (result.replyText) {
      await sendReplyViaZAPI(supabase, conversation, result.replyText, {
        agent_id: result.active_agent_id || conversation.ai_agent_id,
        master_prompt_id: masterPrompt.id,
        node_id: result.current_node_id,
        flow_id: resolvedFlowId,
      });
    }

    // 6. Log execution
    const executionTimeMs = Date.now() - startTime;
    await supabase.from('agent_execution_logs').insert({
      conversation_id: conversationId,
      organization_id: organizationId,
      master_prompt_id: masterPrompt.id,
      agent_id: conversation.ai_agent_id,
      input_message: messageContent,
      ai_response: result.replyText,
      tools_executed: result.toolsExecuted,
      execution_time_ms: executionTimeMs,
    });

    // Enrich messageContent if it's just '[mídia]' — use the last inbound message's enriched content
    let enrichedMessageContent = messageContent;
    if (messageContent === '[mídia]' || !messageContent) {
      const lastInbound = [...messages].reverse().find((m: any) => m.direction === 'inbound');
      if (lastInbound?.content && lastInbound.content !== '[mídia]') {
        enrichedMessageContent = lastInbound.content;
        console.log('Enriched messageContent from transcription:', enrichedMessageContent.substring(0, 100));
      }
    }
    console.log(`=== ORCHESTRATOR COMPLETE (${executionTimeMs}ms, ${result.toolsExecuted.length} tools) ===`);

    return new Response(JSON.stringify({
      success: true, reply: result.replyText,
      toolsExecuted: result.toolsExecuted.length, executionTimeMs,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Orchestrator error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ==================== SIMULATION MODE ====================

async function handleSimulation(supabase: any, payload: any, LOVABLE_API_KEY: string) {
  const {
    organizationId,
    agentId,
    agentName,
    masterPrompt: masterPromptContent,
    additionalPrompt,
    conversationHistory, // Array of { role: 'user'|'assistant', content: string }
    flowId,
    nodeId,
    isFirstActivation,
    hasNextNodes,
    contactName,
  } = payload;

  if (!organizationId) return { error: 'organizationId is required for simulation' };

  // Load context from DB (same as production)
  const [agentsResult, tagsResult, pipelinesResult, trainingRulesResult, integrationConfigResult] = await Promise.all([
    supabase.from('ai_agents').select('*').eq('organization_id', organizationId).eq('is_active', true),
    supabase.from('tags').select('*').eq('organization_id', organizationId),
    supabase.from('pipelines').select('*, columns:pipeline_columns!pipeline_columns_pipeline_id_fkey(*)').eq('organization_id', organizationId),
    supabase.from('agent_training_rules').select('*').eq('organization_id', organizationId).eq('is_active', true),
    resolveIntegrationConfig(supabase, organizationId),
  ]);

  const agents = agentsResult.data || [];
  const allTags = tagsResult.data || [];
  const pipelines = pipelinesResult.data || [];
  const trainingRules = trainingRulesResult.data || [];
  const integrationConfig = integrationConfigResult;

  const agent = agentId ? agents.find((a: any) => a.id === agentId) : null;

  // Resolve AI config — IDENTICAL to production (line 223-227 + resolveAgentConfig)
  // 1. Start with master prompt provider/model → integration_configs → defaults
  const masterProvider = integrationConfig?.ai_provider || 'lovable';
  const masterModel = integrationConfig?.default_model || 'google/gemini-2.5-flash';
  const baseAiConfig = resolveAIConfig(integrationConfig, 'agents', LOVABLE_API_KEY, masterProvider, masterModel);
  
  // 2. Check agent-level overrides (same as resolveAgentConfig in production)
  let aiConfig = baseAiConfig;
  if (agent?.provider || agent?.model) {
    const agentProvider = agent.provider || integrationConfig?.ai_provider || 'lovable';
    const agentModel = agent.model || integrationConfig?.default_model || 'google/gemini-2.5-flash';
    aiConfig = resolveAIConfig(integrationConfig, 'agents', LOVABLE_API_KEY, agentProvider, agentModel);
  }
  
  console.log(`[SIMULATION] AI Config resolved: model=${aiConfig.model}, endpoint=${aiConfig.endpoint}`);
  console.log(`[SIMULATION] Context: agentId=${agentId}, agentName=${agentName}, historyLen=${(conversationHistory || []).length}`);
  // Build system prompt — EXACT SAME as invokeAgentAI
  let systemPrompt = '';

  if (masterPromptContent) {
    systemPrompt += `PERSONALIDADE E REGRAS GERAIS:\n${masterPromptContent}\n\n`;
  }

  systemPrompt += `---\n\n`;
  systemPrompt += `Você é o agente "${agent?.name || agentName || 'Assistente'}" neste momento da conversa.\n\n`;

  if (agent?.prompt_base) {
    systemPrompt += `PROMPT DO AGENTE:\n${agent.prompt_base}\n\n`;
  }

  if (agent?.persona) {
    systemPrompt += `PERSONA: ${agent.persona}\n\n`;
  }

  if (additionalPrompt) {
    systemPrompt += `INSTRUÇÕES ESPECÍFICAS PARA ESTE MOMENTO:\n${additionalPrompt}\n\n`;
  }

  // Training rules (same function as production)
  const rulesSection = buildTrainingRulesSection(trainingRules, {
    agentId: agent?.id,
    masterPromptId: undefined,
    flowId: flowId || undefined,
    nodeId: nodeId || undefined,
  });
  if (rulesSection) systemPrompt += rulesSection;

  // Contact context
  systemPrompt += `DADOS DO CONTATO:\n`;
  systemPrompt += `- Nome: ${contactName || 'Cliente Simulado'}\n`;
  systemPrompt += `- Telefone: (simulação)\n\n`;

  // Available tags
  if (allTags.length > 0) {
    systemPrompt += `TAGS DISPONÍVEIS (para add_tag/remove_tag):\n`;
    for (const tag of allTags) {
      systemPrompt += `- "${tag.name}" → id: "${tag.id}"\n`;
    }
    systemPrompt += '\n';
  }

  // Available pipelines
  if (pipelines.length > 0) {
    systemPrompt += `PIPELINES DISPONÍVEIS (para move_pipeline):\n`;
    for (const p of pipelines) {
      systemPrompt += `- "${p.name}" (id: "${p.id}"): `;
      const cols = (p.columns || []).sort((a: any, b: any) => a.order - b.order);
      systemPrompt += cols.map((c: any) => `"${c.name}"(${c.id})`).join(', ');
      systemPrompt += '\n';
    }
    systemPrompt += '\n';
  }

  systemPrompt += `INSTRUÇÕES IMPORTANTES:\n`;
  systemPrompt += `- Use send_reply para responder ao cliente. A resposta DEVE ser em português brasileiro.\n`;
  systemPrompt += `- Leia TODA a conversa anterior antes de responder. Considere o contexto completo.\n`;
  systemPrompt += `- NUNCA envie mensagens em inglês, sem sentido, ou genéricas.\n`;
  systemPrompt += `- Mantenha a persona definida no prompt master.\n`;
  systemPrompt += `- NUNCA produza texto entre parênteses como "(aguardando resposta)" ou pensamentos internos. Apenas use send_reply.\n`;
  systemPrompt += `- Se não precisa responder ao cliente, NÃO gere texto algum. Apenas execute as ferramentas necessárias.\n`;

  if (isFirstActivation) {
    systemPrompt += `\n⚠️ ATENÇÃO: Você ACABOU de ser ativado nesta etapa do fluxo.\n`;
    systemPrompt += `- Esta é sua PRIMEIRA interação. Você DEVE iniciar seu trabalho conforme suas instruções.\n`;
    systemPrompt += `- NÃO pule sua etapa. Mesmo que o histórico contenha informações relevantes, execute sua tarefa.\n`;
    systemPrompt += `- Envie sua primeira mensagem ao cliente e aguarde a resposta dele.\n`;
    systemPrompt += `- Você NÃO pode avançar o fluxo agora. Faça seu trabalho primeiro.\n`;
  } else if (hasNextNodes) {
    systemPrompt += `- Quando sua tarefa nesta etapa estiver COMPLETA, use advance_flow para avançar o fluxo.\n`;
    systemPrompt += `- NÃO use advance_flow prematuramente. Só avance quando sua tarefa aqui estiver realmente concluída.\n`;
  } else {
    systemPrompt += `- Você é o último agente do fluxo. Continue atendendo até que a conversa se encerre naturalmente.\n`;
  }

  // Build messages (from provided history) — limit to last 20 messages to reduce latency
  const history = (conversationHistory || []);
  const trimmedHistory = history.length > 20 ? history.slice(-20) : history;
  console.log(`[SIMULATION] System prompt length: ${systemPrompt.length} chars, history: ${trimmedHistory.length}/${history.length} messages`);
  
  const aiMessages: any[] = [
    { role: 'system', content: systemPrompt },
    ...trimmedHistory,
  ];

  // Tools (same as production but only send_reply for simulation — tools don't execute)
  const tools: any[] = [
    {
      type: 'function',
      function: {
        name: 'send_reply',
        description: 'Enviar mensagem de resposta ao cliente.',
        parameters: {
          type: 'object',
          properties: { message: { type: 'string', description: 'Texto da mensagem' } },
          required: ['message'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'add_tag',
        description: 'Adicionar uma tag ao contato',
        parameters: {
          type: 'object',
          properties: { tag_id: { type: 'string', description: 'ID da tag' } },
          required: ['tag_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'remove_tag',
        description: 'Remover uma tag do contato',
        parameters: {
          type: 'object',
          properties: { tag_id: { type: 'string', description: 'ID da tag' } },
          required: ['tag_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'move_pipeline',
        description: 'Mover a conversa para uma coluna de pipeline',
        parameters: {
          type: 'object',
          properties: {
            pipeline_id: { type: 'string' },
            column_id: { type: 'string' },
          },
          required: ['pipeline_id', 'column_id'],
        },
      },
    },
  ];

  if (hasNextNodes && !isFirstActivation) {
    tools.push({
      type: 'function',
      function: {
        name: 'advance_flow',
        description: 'Avançar para a próxima etapa do fluxo de orquestração.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    });
  }

  // AI Call (same as production)
  let replyText: string | null = null;
  let toolsExecuted: any[] = [];
  let shouldAdvance = false;
  let round = 0;
  let replySentViaTool = false;

  while (round < 3) {
    round++;
    console.log(`[SIMULATION] Agent AI Round ${round}`);

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 25000); // 25s timeout

    let aiResponse: Response;
    try {
      aiResponse = await fetch(aiConfig.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${aiConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: aiConfig.model, messages: aiMessages, tools, tool_choice: 'auto' }),
        signal: abortController.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        console.error('[SIMULATION] AI call timed out after 25s');
        return { error: 'A chamada à IA demorou demais (timeout). Tente novamente.' };
      }
      console.error('[SIMULATION] AI fetch error:', fetchErr);
      return { error: `Erro de conexão com a IA: ${fetchErr.message}` };
    }
    clearTimeout(timeoutId);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[SIMULATION] AI error:', aiResponse.status, errorText);
      if (aiResponse.status === 429) return { error: 'Rate limit excedido. Tente novamente em alguns segundos.' };
      if (aiResponse.status === 402) return { error: 'Créditos insuficientes.' };
      return { error: `AI gateway error: ${aiResponse.status} - ${errorText.substring(0, 200)}` };
    }

    const aiResult = await aiResponse.json();
    const choice = aiResult.choices?.[0];
    if (!choice) break;

    aiMessages.push(choice.message);

    if (!choice.message?.tool_calls || choice.message.tool_calls.length === 0) {
      if (!replySentViaTool && !replyText && choice.message?.content) {
        const candidateReply = choice.message.content.trim();
        if (!isInternalThought(candidateReply)) {
          replyText = candidateReply;
        }
      }
      break;
    }

    const toolResults: any[] = [];
    for (const toolCall of choice.message.tool_calls) {
      const fnName = toolCall.function.name;
      let fnArgs: any;
      try { fnArgs = JSON.parse(toolCall.function.arguments); } catch { fnArgs = {}; }

      console.log('[SIMULATION] Tool:', fnName, fnArgs);

      if (fnName === 'send_reply' && fnArgs.message) {
        if (!isInternalThought(fnArgs.message)) {
          replyText = fnArgs.message;
          replySentViaTool = true;
        }
        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true }) });
        toolsExecuted.push({ name: 'send_reply', arguments: fnArgs });
      } else if (fnName === 'advance_flow') {
        shouldAdvance = true;
        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true }) });
        toolsExecuted.push({ name: 'advance_flow', arguments: {} });
      } else if (fnName === 'add_tag') {
        const tagName = allTags.find((t: any) => t.id === fnArgs.tag_id)?.name || fnArgs.tag_id;
        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, tag_name: tagName }) });
        toolsExecuted.push({ name: 'add_tag', arguments: fnArgs, tag_name: tagName });
      } else if (fnName === 'remove_tag') {
        const tagName = allTags.find((t: any) => t.id === fnArgs.tag_id)?.name || fnArgs.tag_id;
        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, tag_name: tagName }) });
        toolsExecuted.push({ name: 'remove_tag', arguments: fnArgs, tag_name: tagName });
      } else if (fnName === 'move_pipeline') {
        const pip = pipelines.find((p: any) => p.id === fnArgs.pipeline_id);
        const col = pip?.columns?.find((c: any) => c.id === fnArgs.column_id);
        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, pipeline: pip?.name, column: col?.name }) });
        toolsExecuted.push({ name: 'move_pipeline', arguments: fnArgs, pipeline_name: pip?.name, column_name: col?.name });
      } else {
        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: false, error: 'Unknown tool' }) });
      }
    }

    aiMessages.push(...toolResults);
    if (shouldAdvance) break;
    if (choice.finish_reason === 'stop') break;
  }

  // Strip internal annotations
  if (replyText) replyText = stripInternalAnnotations(replyText);

  return {
    success: true,
    content: replyText || '',
    toolsExecuted,
    shouldAdvance,
    model: aiConfig.model,
  };
}

// ==================== FLOW ENGINE (STATE MACHINE) ====================

async function executeFlowOrchestration(
  supabase: any, ctx: any, flowNodes: any[], flowEdges: any[], messageContent: string
) {
  const toolsExecuted: any[] = [];
  let replyText: string | null = null;

  // Load orchestration state from conversation metadata
  let state = loadOrchestrationState(ctx.conversation, ctx.masterPrompt.id);

  console.log('Flow state:', JSON.stringify(state));

  if (state.flow_completed) {
    // Flow already completed - if we have an active agent, let it handle
    if (state.active_agent_id) {
      const agentNode = flowNodes.find((n: any) => n.type === 'orch-agent' && n.data?.agentId === state.active_agent_id);
      if (agentNode) {
        console.log('Flow complete but agent still active, invoking agent');
        const agentResult = await invokeAgentAI(supabase, ctx, agentNode, state, messageContent, false);
        return { replyText: agentResult.replyText, toolsExecuted: agentResult.toolsExecuted };
      }
    }
    console.log('Flow complete, no active agent');
    return { replyText: null, toolsExecuted: [] };
  }

  if (state.waiting_for_response) {
    const currentNode = flowNodes.find((n: any) => n.id === state.current_node_id);
    console.log('Resuming from node:', state.current_node_id, currentNode?.type);

    if (currentNode?.type === 'orch-agent') {
      // Agent is handling - invoke AI
      const hasNextNodes = findNextNodeIds(flowEdges, state.current_node_id!).length > 0;
      const agentResult = await invokeAgentAI(supabase, ctx, currentNode, state, messageContent, hasNextNodes);
      replyText = agentResult.replyText;
      toolsExecuted.push(...agentResult.toolsExecuted);

      if (agentResult.shouldAdvance) {
        console.log('Agent called advance_flow - walking forward');
        state.completed_nodes.push(state.current_node_id!);
        state.waiting_for_response = false;
        state.active_agent_id = undefined;
        const walkResult = await walkFlowForward(supabase, ctx, state, flowNodes, flowEdges, messageContent);
        if (walkResult.replyText) replyText = walkResult.replyText;
        toolsExecuted.push(...walkResult.toolsExecuted);
      }
    } else if (currentNode?.type === 'orch-document') {
      // Document collection is active - invoke document agent
      const hasNextNodes = findNextNodeIds(flowEdges, state.current_node_id!).length > 0;
      const docResult = await invokeDocumentAgentAI(supabase, ctx, currentNode, state, messageContent, hasNextNodes);
      replyText = docResult.replyText;
      toolsExecuted.push(...docResult.toolsExecuted);

      if (docResult.shouldAdvance) {
        console.log('Document agent completed - walking forward');
        state.completed_nodes.push(state.current_node_id!);
        state.waiting_for_response = false;
        state.document_context = undefined;
        const walkResult = await walkFlowForward(supabase, ctx, state, flowNodes, flowEdges, messageContent);
        if (walkResult.replyText) replyText = walkResult.replyText;
        toolsExecuted.push(...walkResult.toolsExecuted);
      }
    } else {
      // Was waiting after flow/delay - advance
      console.log('Response received after flow/delay - walking forward');
      state.waiting_for_response = false;
      const walkResult = await walkFlowForward(supabase, ctx, state, flowNodes, flowEdges, messageContent);
      replyText = walkResult.replyText;
      toolsExecuted.push(...walkResult.toolsExecuted);
    }
  } else {
    // Not waiting - walk forward (first run or continuing)
    if (!state.current_node_id) {
      // Initialize: find trigger node
      const triggerNode = flowNodes.find((n: any) => n.type === 'orch-trigger');
      if (triggerNode) {
        state.current_node_id = triggerNode.id;
        state.completed_nodes.push(triggerNode.id);
        console.log('Starting from trigger node:', triggerNode.id);
      }
    }
    const walkResult = await walkFlowForward(supabase, ctx, state, flowNodes, flowEdges, messageContent);
    replyText = walkResult.replyText;
    toolsExecuted.push(...walkResult.toolsExecuted);
  }

  // Save state
  await saveOrchestrationState(supabase, ctx.conversationId, state);

  return { 
    replyText, 
    toolsExecuted,
    current_node_id: state.current_node_id,
    active_agent_id: state.active_agent_id
  };
}

async function walkFlowForward(
  supabase: any, ctx: any, state: OrchestrationState,
  nodes: any[], edges: any[], messageContent: string
) {
  const toolsExecuted: any[] = [];
  let replyText: string | null = null;
  let safetyCounter = 0;

  while (safetyCounter++ < 20) {
    const nextNodeIds = findNextNodeIds(edges, state.current_node_id!);
    if (nextNodeIds.length === 0) {
      console.log('End of flow reached — resetting service_mode to humano');
      state.flow_completed = true;
      // Reset service_mode so AI stops responding after flow ends
      await supabase.from('conversations').update({ service_mode: 'humano' }).eq('id', ctx.conversationId);
      break;
    }

    const nextNodeId = nextNodeIds[0]; // Take first path (conditions handled separately)
    const nextNode = nodes.find((n: any) => n.id === nextNodeId);
    if (!nextNode) { console.log('Node not found:', nextNodeId); break; }

    // Skip already completed non-agent nodes
    if (state.completed_nodes.includes(nextNode.id) && nextNode.type !== 'orch-agent') {
      state.current_node_id = nextNode.id;
      continue;
    }

    console.log('Executing node:', nextNode.id, nextNode.type, nextNode.data?.label);

    switch (nextNode.type) {
      case 'orch-tag':
      case 'action-tag': {
        const action = nextNode.data?.action || 'add';
        const tagId = nextNode.data?.tagId;
        if (tagId) {
          if (action === 'add') {
            const { data: existing } = await supabase.from('contact_tags')
              .select('id').eq('contact_id', ctx.contactId).eq('tag_id', tagId).maybeSingle();
            if (!existing) {
              await supabase.from('contact_tags').insert({ contact_id: ctx.contactId, tag_id: tagId, added_by_type: 'ai' });
            }
            console.log('Tag added:', tagId);
          } else {
            await supabase.from('contact_tags').delete().eq('contact_id', ctx.contactId).eq('tag_id', tagId);
            console.log('Tag removed:', tagId);
          }
          toolsExecuted.push({ name: action === 'add' ? 'add_tag' : 'remove_tag', arguments: { tag_id: tagId }, result: { success: true } });
        }
        state.completed_nodes.push(nextNode.id);
        state.current_node_id = nextNode.id;
        if (nextNode.data?.waitForResponse) { state.waiting_for_response = true; return { replyText, toolsExecuted }; }
        continue;
      }

      case 'orch-pipeline':
      case 'action-pipeline': {
        const pipelineId = nextNode.data?.pipelineId;
        const columnId = nextNode.data?.columnId;
        if (pipelineId && columnId) {
          // Get old column for history
          const { data: oldPos } = await supabase.from('conversation_pipeline_positions')
            .select('column_id').eq('conversation_id', ctx.conversationId)
            .eq('pipeline_id', pipelineId).maybeSingle();
          const fromColumnId = oldPos?.column_id || null;

          await supabase.from('conversation_pipeline_positions').upsert({
            conversation_id: ctx.conversationId, pipeline_id: pipelineId,
            column_id: columnId, updated_at: new Date().toISOString(),
          }, { onConflict: 'conversation_id,pipeline_id' });
          console.log('Pipeline moved:', pipelineId, columnId);

          // Log stage history
          await supabase.from('conversation_stage_history').insert({
            conversation_id: ctx.conversationId,
            pipeline_id: pipelineId,
            from_column_id: fromColumnId,
            to_column_id: columnId,
            changed_by_type: 'orchestrator',
            changed_by: null,
            organization_id: ctx.organizationId,
          });

          // Trigger stage notification
          try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const srvKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            await fetch(`${supabaseUrl}/functions/v1/stage-notification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${srvKey}` },
              body: JSON.stringify({ conversationId: ctx.conversationId, columnId, organizationId: ctx.organizationId }),
            });
          } catch (e) { console.error('Stage notification error:', e); }

          toolsExecuted.push({ name: 'move_pipeline', arguments: { pipeline_id: pipelineId, column_id: columnId }, result: { success: true } });
        }
        state.completed_nodes.push(nextNode.id);
        state.current_node_id = nextNode.id;
        if (nextNode.data?.waitForResponse) { state.waiting_for_response = true; return { replyText, toolsExecuted }; }
        continue;
      }

      case 'orch-department':
      case 'action-department': {
        const deptName = nextNode.data?.departmentName;
        if (deptName) {
          const { data: dept } = await supabase.from('departments').select('id')
            .eq('organization_id', ctx.organizationId).eq('name', deptName).maybeSingle();
          if (dept) {
            await supabase.from('conversations').update({ department_id: dept.id }).eq('id', ctx.conversationId);
            console.log('Department changed:', deptName);
          }
          toolsExecuted.push({ name: 'change_department', arguments: { department: deptName }, result: { success: !!dept } });
        }
        state.completed_nodes.push(nextNode.id);
        state.current_node_id = nextNode.id;
        if (nextNode.data?.waitForResponse) { state.waiting_for_response = true; return { replyText, toolsExecuted }; }
        continue;
      }

      case 'orch-flow':
      case 'action-flow': {
        const flowId = nextNode.data?.flowId;
        if (flowId) {
          console.log('Triggering flow:', flowId);
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          try {
            const resp = await fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
              body: JSON.stringify({ flowId, conversationId: ctx.conversationId }),
            });
            const flowResult = await resp.json();
            console.log('Flow result:', flowResult.success ? 'success' : 'failed');
            toolsExecuted.push({ name: 'trigger_flow', arguments: { flow_id: flowId }, result: flowResult });
          } catch (e) {
            console.error('Flow trigger error:', e);
            toolsExecuted.push({ name: 'trigger_flow', arguments: { flow_id: flowId }, result: { success: false, error: String(e) } });
          }
        }
        state.completed_nodes.push(nextNode.id);
        state.current_node_id = nextNode.id;
        // Default: wait after flow unless explicitly disabled
        const shouldWait = nextNode.data?.waitForResponse !== false;
        if (shouldWait) { state.waiting_for_response = true; return { replyText, toolsExecuted }; }
        continue;
      }

      case 'orch-agent':
      case 'ai-handoff': {
        const agentId = nextNode.data?.agentId;
        if (agentId) {
          // Switch agent in conversation
          const { data: agent } = await supabase.from('ai_agents').select('function_role').eq('id', agentId).single();
          const updateData: any = { ai_agent_id: agentId };
          if (agent?.function_role) {
            const { data: dept } = await supabase.from('departments').select('id')
              .eq('organization_id', ctx.organizationId).ilike('name', `%${agent.function_role}%`).maybeSingle();
            if (dept) updateData.department_id = dept.id;
          }
          await supabase.from('conversations').update(updateData).eq('id', ctx.conversationId);
          console.log('Agent switched:', agentId);
          toolsExecuted.push({ name: 'switch_agent', arguments: { agent_id: agentId }, result: { success: true } });
        }
        // Agent node: set as current, mark waiting, invoke AI
        state.current_node_id = nextNode.id;
        state.waiting_for_response = true;
        state.active_agent_id = nextNode.data?.agentId;

        // FIRST ACTIVATION: agent must send its first message and WAIT.
        // advance_flow is NOT available on first activation to prevent skipping.
        const isFirstActivation = true;
        const agentResult = await invokeAgentAI(supabase, ctx, nextNode, state, messageContent, false, isFirstActivation);
        replyText = agentResult.replyText;
        toolsExecuted.push(...agentResult.toolsExecuted);

        // Never allow advance on first activation - always wait for user response
        console.log('Agent first activation complete - waiting for user response');
        return { replyText, toolsExecuted };
      }

      case 'orch-document':
      case 'action-document': {
        const templateId = nextNode.data?.templateId;
        const packId = nextNode.data?.packId;
        const documentSource = nextNode.data?.documentSource || 'template';
        const documentMode = nextNode.data?.documentMode || 'ai_agent';

        const isPack = documentSource === 'pack' && !!packId;
        const hasSource = isPack ? !!packId : !!templateId;

        if (!hasSource) {
          console.log('Document node has no template/pack configured');
          state.completed_nodes.push(nextNode.id);
          state.current_node_id = nextNode.id;
          continue;
        }

        // === PUBLIC LINK MODE ===
        if (documentMode === 'public_link') {
          console.log('Document node: public_link mode, isPack:', isPack);
          const appUrl = 'https://wizzyai.lovable.app';

          let publicLink: string;
          if (isPack) {
            // Need pack's public_token
            const { data: pack } = await supabase.from('document_packs')
              .select('id, name, public_token').eq('id', packId).single();
            if (!pack?.public_token) {
              console.log('Pack has no public_token, skipping');
              state.completed_nodes.push(nextNode.id);
              state.current_node_id = nextNode.id;
              continue;
            }
            publicLink = `${appUrl}/pack-form/${pack.public_token}`;
          } else {
            publicLink = `${appUrl}/public-form/${templateId}`;
          }

          let linkMessage = (nextNode.data?.publicLinkMessage as string) || '';
          if (!linkMessage) {
            linkMessage = `📋 Por favor, preencha seus dados neste link para gerar ${isPack ? 'os documentos' : 'o documento'}:\n\n${publicLink}`;
          } else {
            linkMessage = linkMessage.replace(/\{\{link\}\}/g, publicLink);
          }

          await sendReplyViaZAPI(supabase, ctx.conversation, linkMessage);
          replyText = linkMessage;

          toolsExecuted.push({
            name: 'send_public_link',
            arguments: { source: documentSource, link: publicLink },
            result: { success: true }
          });

          state.completed_nodes.push(nextNode.id);
          state.current_node_id = nextNode.id;
          continue;
        }

        // === AI AGENT MODE ===
        let docFields: { name: string; label: string; type: string }[] = [];
        let docTemplateName = '';
        let docTemplateContent = '';
        let packTemplates: { id: string; name: string; content: string }[] = [];

        if (isPack) {
          // Load pack with its field_config (unified fields) and templates
          const { data: pack } = await supabase.from('document_packs')
            .select('id, name, template_ids, field_config').eq('id', packId).single();

          if (!pack) {
            console.log('Pack not found:', packId);
            state.completed_nodes.push(nextNode.id);
            state.current_node_id = nextNode.id;
            continue;
          }

          docTemplateName = pack.name;

          // Use unified field_config from the pack
          const fieldConfig = Array.isArray(pack.field_config) ? pack.field_config : [];
          if (fieldConfig.length > 0) {
            // field_config has unified/shared fields
            docFields = fieldConfig.map((f: any) => ({
              name: f.name || f.unified_name || f.label || '',
              label: f.label || f.unified_name || f.name || '',
              type: f.type || 'text',
            }));
          } else {
            // Fallback: load all template fields
            const { data: templates } = await supabase.from('document_templates')
              .select('id, name, content, fields').in('id', pack.template_ids || []);
            if (templates) {
              const seenFields = new Set<string>();
              for (const t of templates) {
                packTemplates.push({ id: t.id, name: t.name, content: t.content });
                const tFields = Array.isArray(t.fields) ? t.fields : [];
                for (const f of tFields) {
                  const fname = typeof f === 'string' ? f : (f.name || f);
                  if (!seenFields.has(fname)) {
                    seenFields.add(fname);
                    docFields.push({
                      name: fname,
                      label: typeof f === 'string' ? f : (f.label || f.name || f),
                      type: typeof f === 'string' ? 'text' : (f.type || 'text'),
                    });
                  }
                }
              }
            }
          }

          // Load templates for PDF generation later
          if (packTemplates.length === 0 && pack.template_ids?.length) {
            const { data: templates } = await supabase.from('document_templates')
              .select('id, name, content').in('id', pack.template_ids);
            if (templates) packTemplates = templates.map(t => ({ id: t.id, name: t.name, content: t.content }));
          }

          docTemplateContent = packTemplates.map(t => `--- ${t.name} ---\n${t.content?.substring(0, 500)}`).join('\n\n');

        } else {
          // Single template
          const { data: template } = await supabase.from('document_templates')
            .select('id, name, content, fields').eq('id', templateId).single();

          if (!template) {
            console.log('Template not found:', templateId);
            state.completed_nodes.push(nextNode.id);
            state.current_node_id = nextNode.id;
            continue;
          }

          docTemplateName = template.name;
          docTemplateContent = template.content;
          const fields = Array.isArray(template.fields) ? template.fields : [];
          docFields = fields.map((f: any) => ({
            name: typeof f === 'string' ? f : (f.name || f),
            label: typeof f === 'string' ? f : (f.label || f.name || f),
            type: typeof f === 'string' ? 'text' : (f.type || 'text'),
          }));
        }

        // Initialize document collection context
        state.document_context = {
          template_id: isPack ? '' : templateId,
          template_name: docTemplateName,
          template_content: docTemplateContent,
          fields: docFields,
          collected_data: {},
          require_confirmation: nextNode.data?.requireConfirmation !== false,
          send_pdf_in_chat: nextNode.data?.sendPdfInChat !== false,
          send_signature_link: nextNode.data?.sendSignatureLink !== false,
          signing_method: nextNode.data?.signingMethod || 'manual',
          additional_instructions: nextNode.data?.additionalInstructions || '',
          confirmed: false,
          pdf_generated: false,
          signature_requested: false,
          is_pack: isPack,
          pack_id: isPack ? packId : undefined,
          pack_name: isPack ? docTemplateName : undefined,
          pack_template_ids: isPack ? packTemplates.map(t => t.id) : undefined,
          pack_templates: isPack ? packTemplates : undefined,
        };

        // Pre-fill with contact data
        const contact = ctx.conversation.contact;
        if (contact) {
          for (const field of state.document_context.fields) {
            const fn = field.name.toLowerCase();
            if ((fn.includes('nome') || fn.includes('name')) && contact.name) {
              state.document_context.collected_data[field.name] = contact.name;
            }
            if ((fn.includes('telefone') || fn.includes('phone') || fn.includes('celular')) && contact.phone) {
              state.document_context.collected_data[field.name] = contact.phone;
            }
            if ((fn.includes('email') || fn.includes('e-mail')) && contact.email) {
              state.document_context.collected_data[field.name] = contact.email;
            }
          }
        }

        // Specific agent for this node
        const docAgentId = nextNode.data?.documentAgentId as string;
        if (docAgentId) {
          const docAgent = ctx.agents.find((a: any) => a.id === docAgentId);
          if (docAgent) {
            state.active_agent_id = docAgentId;
            console.log('Document node using specific agent:', docAgent.name);
          }
        }

        console.log('Document collection started:', docTemplateName, 'Fields:', docFields.length, 'isPack:', isPack);
        toolsExecuted.push({
          name: 'start_document_collection',
          arguments: { template_name: docTemplateName, mode: 'ai_agent', is_pack: isPack },
          result: { success: true, fields_count: docFields.length }
        });

        state.current_node_id = nextNode.id;
        state.waiting_for_response = true;

        const docResult = await invokeDocumentAgentAI(supabase, ctx, nextNode, state, messageContent, false, true);
        replyText = docResult.replyText;
        toolsExecuted.push(...docResult.toolsExecuted);

        return { replyText, toolsExecuted };
      }

      case 'orch-human':
      case 'action-transfer': {
        // Escalate to human - switch service mode
        await supabase.from('conversations').update({ service_mode: 'humano' }).eq('id', ctx.conversationId);
        console.log('Escalated to human');
        toolsExecuted.push({ name: 'escalate_human', arguments: {}, result: { success: true } });
        state.completed_nodes.push(nextNode.id);
        state.current_node_id = nextNode.id;
        state.flow_completed = true;
        return { replyText, toolsExecuted };
      }

      case 'orch-delay':
      case 'action-delay': {
        const seconds = Math.min(nextNode.data?.delaySeconds || 5, 25);
        if (seconds > 0) {
          console.log('Delay:', seconds, 'seconds');
          await new Promise(r => setTimeout(r, seconds * 1000));
        }
        state.completed_nodes.push(nextNode.id);
        state.current_node_id = nextNode.id;
        continue;
      }

      case 'orch-condition':
      case 'condition': {
        // Evaluate condition using AI
        const branch = await evaluateCondition(ctx, nextNode, messageContent);
        console.log('Condition evaluated:', nextNode.data?.conditionLabel, '→', branch);
        state.completed_nodes.push(nextNode.id);
        state.current_node_id = nextNode.id;
        toolsExecuted.push({ name: 'evaluate_condition', arguments: { condition: nextNode.data?.conditionLabel }, result: { branch } });

        // Find the correct branch edge
        const branchEdges = edges.filter((e: any) => e.source === nextNode.id);
        const targetEdge = branchEdges.find((e: any) => e.sourceHandle === branch) || branchEdges[0];
        if (targetEdge) {
          // Override next iteration to follow this branch
          state.current_node_id = nextNode.id;
          // We need to manually set which edge to follow
          const branchTarget = nodes.find((n: any) => n.id === targetEdge.target);
          if (branchTarget) {
            // Temporarily adjust: skip the normal findNextNodeIds by executing this node directly
            // We'll handle this by continuing the loop with a modified state
          }
        }
        continue;
      }

      default:
        console.log('Unknown node type:', nextNode.type);
        state.completed_nodes.push(nextNode.id);
        state.current_node_id = nextNode.id;
        continue;
    }
  }

  return { replyText, toolsExecuted };
}

// ==================== AGENT AI INVOCATION ====================

async function invokeAgentAI(
  supabase: any, ctx: any, agentNode: any, state: OrchestrationState,
  messageContent: string, hasNextNodes: boolean, isFirstActivation: boolean = false
) {
  const toolsExecuted: any[] = [];
  let replyText: string | null = null;
  let shouldAdvance = false;

  const agentId = agentNode.data?.agentId;
  const agent = ctx.agents.find((a: any) => a.id === agentId);
  const additionalPrompt = agentNode.data?.additionalPrompt || '';

  // Build agent-specific system prompt
  let systemPrompt = '';

  // Master prompt personality (NOT execution instructions)
  if (ctx.masterPrompt.content) {
    systemPrompt += `PERSONALIDADE E REGRAS GERAIS:\n${ctx.masterPrompt.content}\n\n`;
  }

  systemPrompt += `---\n\n`;
  systemPrompt += `Você é o agente "${agent?.name || 'Assistente'}" neste momento da conversa.\n\n`;

  if (agent?.prompt_base) {
    systemPrompt += `PROMPT DO AGENTE:\n${agent.prompt_base}\n\n`;
  }

  if (additionalPrompt) {
    systemPrompt += `INSTRUÇÕES ESPECÍFICAS PARA ESTE MOMENTO:\n${additionalPrompt}\n\n`;
  }

  // Inject training rules
  const rulesSection = buildTrainingRulesSection(ctx.trainingRules, {
    agentId: agent?.id, masterPromptId: ctx.masterPrompt?.id,
    flowId: ctx.resolvedFlowId || (ctx.masterPrompt as any)?.flow_id, nodeId: agentNode?.id,
  });
  if (rulesSection) systemPrompt += rulesSection;

  // Contact context
  systemPrompt += `DADOS DO CONTATO:\n`;
  systemPrompt += `- Nome: ${ctx.conversation.contact?.name || 'Não informado'}\n`;
  systemPrompt += `- Telefone: ${ctx.conversation.contact?.phone || 'N/A'}\n\n`;

  // Tags context
  const currentTagNames = ctx.contactTags.map((ct: any) => ct.tag?.name).filter(Boolean);
  if (currentTagNames.length > 0) {
    systemPrompt += `TAGS DO CONTATO: ${currentTagNames.join(', ')}\n\n`;
  }

  // Available tags for agent to use
  if (ctx.allTags.length > 0) {
    systemPrompt += `TAGS DISPONÍVEIS (para add_tag/remove_tag):\n`;
    for (const tag of ctx.allTags) {
      systemPrompt += `- "${tag.name}" → id: "${tag.id}"\n`;
    }
    systemPrompt += '\n';
  }

  // Available pipelines
  if (ctx.pipelines.length > 0) {
    systemPrompt += `PIPELINES DISPONÍVEIS (para move_pipeline):\n`;
    for (const p of ctx.pipelines) {
      systemPrompt += `- "${p.name}" (id: "${p.id}"): `;
      const cols = (p.columns || []).sort((a: any, b: any) => a.order - b.order);
      systemPrompt += cols.map((c: any) => `"${c.name}"(${c.id})`).join(', ');
      systemPrompt += '\n';
    }
    systemPrompt += '\n';
  }

  systemPrompt += `INSTRUÇÕES IMPORTANTES:\n`;
  systemPrompt += `- Use send_reply para responder ao cliente. A resposta DEVE ser em português brasileiro.\n`;
  systemPrompt += `- Leia TODA a conversa anterior antes de responder. Considere o contexto completo.\n`;
  systemPrompt += `- NUNCA envie mensagens em inglês, sem sentido, ou genéricas.\n`;
  systemPrompt += `- Mantenha a persona definida no prompt master.\n`;
  systemPrompt += `- NUNCA produza texto entre parênteses como "(aguardando resposta)" ou pensamentos internos. Apenas use send_reply.\n`;
  systemPrompt += `- Se não precisa responder ao cliente, NÃO gere texto algum. Apenas execute as ferramentas necessárias.\n`;

  if (isFirstActivation) {
    systemPrompt += `\n⚠️ ATENÇÃO: Você ACABOU de ser ativado nesta etapa do fluxo.\n`;
    systemPrompt += `- Esta é sua PRIMEIRA interação. Você DEVE iniciar seu trabalho conforme suas instruções.\n`;
    systemPrompt += `- NÃO pule sua etapa. Mesmo que o histórico contenha informações relevantes, execute sua tarefa.\n`;
    systemPrompt += `- Envie sua primeira mensagem ao cliente e aguarde a resposta dele.\n`;
    systemPrompt += `- Você NÃO pode avançar o fluxo agora. Faça seu trabalho primeiro.\n`;
  } else if (hasNextNodes) {
    systemPrompt += `- Quando sua tarefa nesta etapa estiver COMPLETA, use advance_flow para avançar o fluxo.\n`;
    systemPrompt += `- NÃO use advance_flow prematuramente. Só avance quando sua tarefa aqui estiver realmente concluída.\n`;
    systemPrompt += `- Você pode usar send_reply e advance_flow na mesma rodada SOMENTE se sua resposta é a última antes de avançar.\n`;
  } else {
    systemPrompt += `- Você é o último agente do fluxo. Continue atendendo até que a conversa se encerre naturalmente.\n`;
  }

  // Build messages
  const aiMessages: any[] = [
    { role: 'system', content: systemPrompt },
    ...ctx.messages.map((m: any) => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.content || '[mídia]',
    })),
  ];

  // Ensure last message is the current one
  if (aiMessages[aiMessages.length - 1]?.role !== 'user' ||
    aiMessages[aiMessages.length - 1]?.content !== messageContent) {
    aiMessages.push({ role: 'user', content: messageContent });
  }

  // Agent tools
  const tools: any[] = [
    {
      type: 'function',
      function: {
        name: 'send_reply',
        description: 'Enviar mensagem de resposta ao cliente.',
        parameters: {
          type: 'object',
          properties: { message: { type: 'string', description: 'Texto da mensagem' } },
          required: ['message'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'add_tag',
        description: 'Adicionar uma tag ao contato',
        parameters: {
          type: 'object',
          properties: { tag_id: { type: 'string', description: 'ID da tag' } },
          required: ['tag_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'remove_tag',
        description: 'Remover uma tag do contato',
        parameters: {
          type: 'object',
          properties: { tag_id: { type: 'string', description: 'ID da tag' } },
          required: ['tag_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'move_pipeline',
        description: 'Mover a conversa para uma coluna de pipeline',
        parameters: {
          type: 'object',
          properties: {
            pipeline_id: { type: 'string' },
            column_id: { type: 'string' },
          },
          required: ['pipeline_id', 'column_id'],
        },
      },
    },
  ];

  if (hasNextNodes) {
    tools.push({
      type: 'function',
      function: {
        name: 'advance_flow',
        description: 'Avançar para a próxima etapa do fluxo de orquestração. Use quando sua tarefa nesta etapa estiver completa.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    });
  }

  // AI call loop
  let round = 0;
  let replySentViaTool = false;

  while (round < MAX_TOOL_ROUNDS) {
    round++;
    console.log(`--- Agent AI Round ${round} ---`);

    const agentConfig = resolveAgentConfig(ctx, agent, ctx.integrationConfig);
    const abortCtrl = new AbortController();
    const tid = setTimeout(() => abortCtrl.abort(), 25000);
    let aiResponse: Response;
    try {
      aiResponse = await fetch(agentConfig.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: agentConfig.model, messages: aiMessages, tools, tool_choice: 'auto' }),
        signal: abortCtrl.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(tid);
      console.error('[AGENT] AI fetch error:', fetchErr.name, fetchErr.message);
      break;
    }
    clearTimeout(tid);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errorText);
      break;
    }

    const aiResult = await aiResponse.json();
    const choice = aiResult.choices?.[0];
    if (!choice) break;

    aiMessages.push(choice.message);

    if (!choice.message?.tool_calls || choice.message.tool_calls.length === 0) {
      if (!replySentViaTool && !replyText && choice.message?.content) {
        const candidateReply = choice.message.content.trim();
        // Filter out internal AI reasoning/monologue (parenthetical thoughts, meta-commentary)
        if (!isInternalThought(candidateReply)) {
          replyText = candidateReply;
        } else {
          console.log('Filtered internal thought:', candidateReply);
        }
      }
      break;
    }

    const toolResults: any[] = [];
    for (const toolCall of choice.message.tool_calls) {
      const fnName = toolCall.function.name;
      let fnArgs: any;
      try { fnArgs = JSON.parse(toolCall.function.arguments); } catch { fnArgs = {}; }

      console.log('Agent tool:', fnName, fnArgs);

      if (fnName === 'send_reply' && fnArgs.message) {
        // Filter internal thoughts - don't overwrite a good reply with garbage
        if (isInternalThought(fnArgs.message)) {
          console.log('Filtered internal thought from send_reply:', fnArgs.message);
          toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, note: 'Message filtered as internal thought' }) });
        } else {
          replyText = fnArgs.message;
          replySentViaTool = true;
          toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true }) });
          toolsExecuted.push({ name: 'send_reply', arguments: fnArgs, result: { success: true } });
        }
      } else if (fnName === 'advance_flow') {
        shouldAdvance = true;
        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, message: 'Advancing to next step' }) });
        toolsExecuted.push({ name: 'advance_flow', arguments: {}, result: { success: true } });
      } else if (fnName === 'add_tag') {
        const result = await executeToolDirect(supabase, 'add_tag', fnArgs, ctx);
        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
        toolsExecuted.push({ name: fnName, arguments: fnArgs, result });
      } else if (fnName === 'remove_tag') {
        const result = await executeToolDirect(supabase, 'remove_tag', fnArgs, ctx);
        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
        toolsExecuted.push({ name: fnName, arguments: fnArgs, result });
      } else if (fnName === 'move_pipeline') {
        const result = await executeToolDirect(supabase, 'move_pipeline', fnArgs, ctx);
        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
        toolsExecuted.push({ name: fnName, arguments: fnArgs, result });
      } else {
        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: false, error: 'Unknown tool' }) });
      }
    }

    aiMessages.push(...toolResults);

    if (shouldAdvance) break;
    if (choice.finish_reason === 'stop') break;
  }

  return { replyText, shouldAdvance, toolsExecuted };
}

// ==================== DOCUMENT AGENT AI ====================

async function invokeDocumentAgentAI(
  supabase: any, ctx: any, docNode: any, state: OrchestrationState,
  messageContent: string, hasNextNodes: boolean, isFirstActivation: boolean = false
) {
  const toolsExecuted: any[] = [];
  let replyText: string | null = null;
  let shouldAdvance = false;

  const docCtx = state.document_context!;

  // Use the agent configured on the document node, or fall back to conversation's active agent
  const docAgentId = state.active_agent_id;
  const activeAgentId = docAgentId || ctx.conversation.ai_agent_id;
  const agent = ctx.agents.find((a: any) => a.id === activeAgentId);

  // Build system prompt for document collection
  let systemPrompt = '';

  if (ctx.masterPrompt.content) {
    systemPrompt += `PERSONALIDADE E REGRAS GERAIS:\n${ctx.masterPrompt.content}\n\n---\n\n`;
  }

  systemPrompt += `Você é o agente "${agent?.name || 'Assistente'}" e está na etapa de COLETA DE DADOS para gerar o documento "${docCtx.template_name}".\n\n`;

  if (agent?.prompt_base) {
    systemPrompt += `PROMPT DO AGENTE:\n${agent.prompt_base}\n\n`;
  }

  // Document-specific instructions
  systemPrompt += `TAREFA: Coletar todos os dados necessários para preencher o documento/contrato.\n\n`;

  systemPrompt += `CAMPOS DO DOCUMENTO (todos são obrigatórios):\n`;
  for (const field of docCtx.fields) {
    const collected = docCtx.collected_data[field.name];
    systemPrompt += `- ${field.label} (${field.name}): ${collected ? `✅ "${collected}"` : '❌ Não coletado'}\n`;
  }
  systemPrompt += '\n';

  const missingFields = docCtx.fields.filter(f => !docCtx.collected_data[f.name]);
  const allCollected = missingFields.length === 0;

  systemPrompt += `STATUS: ${Object.keys(docCtx.collected_data).length}/${docCtx.fields.length} campos preenchidos.\n`;
  if (missingFields.length > 0) {
    systemPrompt += `FALTAM: ${missingFields.map(f => f.label).join(', ')}\n`;
  }
  systemPrompt += '\n';

  // Contact context
  systemPrompt += `DADOS DO CONTATO:\n`;
  systemPrompt += `- Nome: ${ctx.conversation.contact?.name || 'Não informado'}\n`;
  systemPrompt += `- Telefone: ${ctx.conversation.contact?.phone || 'N/A'}\n\n`;

  if (docCtx.additional_instructions) {
    systemPrompt += `INSTRUÇÕES ADICIONAIS DO OPERADOR:\n${docCtx.additional_instructions}\n\n`;
  }

  systemPrompt += `REGRAS DE COLETA:\n`;
  systemPrompt += `- Pergunte os dados faltantes de forma natural e conversacional.\n`;
  systemPrompt += `- Se o usuário enviar uma imagem ou documento, tente extrair os dados relevantes da descrição/transcrição.\n`;
  systemPrompt += `- Quando tiver um dado, use a ferramenta 'set_document_field' para registrá-lo.\n`;
  systemPrompt += `- Você pode coletar MÚLTIPLOS campos de uma mesma mensagem se o usuário fornecer vários dados.\n`;
  systemPrompt += `- Sempre confirme os dados com o usuário antes de finalizar.\n`;
  systemPrompt += `- Use send_reply para responder ao cliente. Respostas em PORTUGUÊS BRASILEIRO.\n`;
  systemPrompt += `- NUNCA produza texto entre parênteses como "(aguardando resposta)" ou pensamentos internos. Apenas use send_reply.\n`;
  systemPrompt += `- Se não precisa responder ao cliente, NÃO gere texto algum. Apenas execute as ferramentas necessárias.\n`;

  if (allCollected && docCtx.require_confirmation && !docCtx.confirmed) {
    systemPrompt += `\n⚠️ TODOS OS DADOS FORAM COLETADOS. Apresente um resumo dos dados ao cliente e peça confirmação.\n`;
    systemPrompt += `Se o cliente confirmar, use 'confirm_document_data' para prosseguir com a geração.\n`;
    systemPrompt += `Se o cliente quiser corrigir algum dado, use 'set_document_field' com o valor correto.\n`;
  } else if (allCollected && (!docCtx.require_confirmation || docCtx.confirmed)) {
    systemPrompt += `\n✅ DADOS CONFIRMADOS. Use 'generate_document' para gerar o PDF agora.\n`;
  }

  if (isFirstActivation) {
    systemPrompt += `\n⚠️ PRIMEIRA ATIVAÇÃO: Cumprimente o cliente e comece a coletar os dados faltantes.\n`;
    if (Object.keys(docCtx.collected_data).length > 0) {
      systemPrompt += `Alguns dados já foram pré-preenchidos a partir do cadastro do contato. Informe o cliente e pergunte os dados que faltam.\n`;
    }
  }

  // Build messages
  const aiMessages: any[] = [
    { role: 'system', content: systemPrompt },
    ...ctx.messages.map((m: any) => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.content || '[mídia]',
    })),
  ];

  if (aiMessages[aiMessages.length - 1]?.role !== 'user' ||
    aiMessages[aiMessages.length - 1]?.content !== messageContent) {
    aiMessages.push({ role: 'user', content: messageContent });
  }

  // Document-specific tools
  const tools: any[] = [
    {
      type: 'function',
      function: {
        name: 'send_reply',
        description: 'Enviar mensagem de resposta ao cliente.',
        parameters: {
          type: 'object',
          properties: { message: { type: 'string', description: 'Texto da mensagem' } },
          required: ['message'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'set_document_field',
        description: 'Definir o valor de um campo do documento. Use quando o cliente fornecer um dado.',
        parameters: {
          type: 'object',
          properties: {
            field_name: { type: 'string', description: 'Nome do campo (ex: nome_completo, cpf, endereco)' },
            value: { type: 'string', description: 'Valor do campo' },
          },
          required: ['field_name', 'value'],
        },
      },
    },
  ];

  if (allCollected && docCtx.require_confirmation && !docCtx.confirmed) {
    tools.push({
      type: 'function',
      function: {
        name: 'confirm_document_data',
        description: 'Confirmar que o cliente aprovou os dados coletados. Use após o cliente confirmar o resumo.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    });
  }

  if (allCollected && (!docCtx.require_confirmation || docCtx.confirmed)) {
    tools.push({
      type: 'function',
      function: {
        name: 'generate_document',
        description: 'Gerar o documento PDF com os dados coletados. Use quando todos os dados estiverem preenchidos e confirmados.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    });
  }

  if (hasNextNodes) {
    tools.push({
      type: 'function',
      function: {
        name: 'advance_flow',
        description: 'Avançar para a próxima etapa após o documento ter sido gerado.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    });
  }

  // AI call loop
  let round = 0;
  let replySentViaTool = false;

  while (round < MAX_TOOL_ROUNDS) {
    round++;
    console.log(`--- Document Agent AI Round ${round} ---`);

    const abortCtrl = new AbortController();
    const tid = setTimeout(() => abortCtrl.abort(), 25000);
    let aiResponse: Response;
    try {
      aiResponse = await fetch(ctx.aiEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.aiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: ctx.aiModel, messages: aiMessages, tools, tool_choice: 'auto' }),
        signal: abortCtrl.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(tid);
      console.error('[DOC-AGENT] AI fetch error:', fetchErr.name, fetchErr.message);
      break;
    }
    clearTimeout(tid);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errorText);
      break;
    }

    const aiResult = await aiResponse.json();
    const choice = aiResult.choices?.[0];
    if (!choice) break;

    aiMessages.push(choice.message);

    if (!choice.message?.tool_calls || choice.message.tool_calls.length === 0) {
      if (!replySentViaTool && !replyText && choice.message?.content) {
        const candidateReply = choice.message.content.trim();
        // Filter out internal AI reasoning/monologue (parenthetical thoughts, meta-commentary)
        if (!isInternalThought(candidateReply)) {
          replyText = candidateReply;
        } else {
          console.log('Filtered internal thought:', candidateReply);
        }
      }
      break;
    }

    const toolResults: any[] = [];
    for (const toolCall of choice.message.tool_calls) {
      const fnName = toolCall.function.name;
      let fnArgs: any;
      try { fnArgs = JSON.parse(toolCall.function.arguments); } catch { fnArgs = {}; }

      console.log('Document tool:', fnName, fnArgs);

      if (fnName === 'send_reply' && fnArgs.message) {
        // Filter internal thoughts - don't overwrite a good reply with garbage
        if (isInternalThought(fnArgs.message)) {
          console.log('Filtered internal thought from send_reply:', fnArgs.message);
          toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, note: 'Message filtered as internal thought' }) });
        } else {
          replyText = fnArgs.message;
          replySentViaTool = true;
          toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true }) });
          toolsExecuted.push({ name: 'send_reply', arguments: fnArgs, result: { success: true } });
        }

      } else if (fnName === 'set_document_field') {
        const { field_name, value } = fnArgs;
        // Validate field exists
        const fieldExists = docCtx.fields.some(f => f.name === field_name);
        if (fieldExists) {
          docCtx.collected_data[field_name] = value;
          console.log(`Document field set: ${field_name} = "${value}"`);
          toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, field: field_name, value }) });
          toolsExecuted.push({ name: 'set_document_field', arguments: fnArgs, result: { success: true } });
        } else {
          // Try fuzzy match
          const closestField = docCtx.fields.find(f =>
            f.name.toLowerCase().includes(field_name.toLowerCase()) ||
            field_name.toLowerCase().includes(f.name.toLowerCase())
          );
          if (closestField) {
            docCtx.collected_data[closestField.name] = value;
            console.log(`Document field set (fuzzy): ${closestField.name} = "${value}"`);
            toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, field: closestField.name, value, note: `Matched to "${closestField.name}"` }) });
            toolsExecuted.push({ name: 'set_document_field', arguments: { field_name: closestField.name, value }, result: { success: true } });
          } else {
            toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: false, error: `Campo "${field_name}" não encontrado. Campos disponíveis: ${docCtx.fields.map(f => f.name).join(', ')}` }) });
          }
        }

      } else if (fnName === 'confirm_document_data') {
        docCtx.confirmed = true;
        console.log('Document data confirmed by client');
        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, message: 'Dados confirmados. Agora use generate_document para gerar o PDF.' }) });
        toolsExecuted.push({ name: 'confirm_document_data', arguments: {}, result: { success: true } });

      } else if (fnName === 'generate_document') {
        // Generate PDF(s) - supports both single template and pack
        console.log('Generating document PDF(s)... isPack:', !!docCtx.is_pack);
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        try {
          const generatedDocs: { id: string; name: string; pdf_url: string }[] = [];
          const submissionGroup = docCtx.is_pack ? crypto.randomUUID() : undefined;

          // Determine templates to generate
          const templatesToGenerate = docCtx.is_pack && docCtx.pack_templates?.length
            ? docCtx.pack_templates
            : [{ id: docCtx.template_id, name: docCtx.template_name, content: docCtx.template_content }];

          for (const tmpl of templatesToGenerate) {
            const pdfResp = await fetch(`${supabaseUrl}/functions/v1/generate-document-pdf`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
              body: JSON.stringify({
                template_content: tmpl.content,
                filled_data: docCtx.collected_data,
                document_name: tmpl.name,
              }),
            });
            const pdfResult = await pdfResp.json();

            if (pdfResult.pdf_url) {
              console.log('PDF generated:', tmpl.name, pdfResult.pdf_url);

              const { data: genDoc } = await supabase.from('generated_documents').insert({
                organization_id: ctx.organizationId,
                template_id: tmpl.id || null,
                pack_id: docCtx.pack_id || null,
                name: tmpl.name,
                filled_data: docCtx.collected_data,
                pdf_url: pdfResult.pdf_url,
                contact_id: ctx.contactId,
                conversation_id: ctx.conversationId,
                status: 'generated',
                signing_method: docCtx.signing_method !== 'none' ? docCtx.signing_method : null,
                signing_status: docCtx.signing_method !== 'none' ? 'pending' : null,
                submission_group: submissionGroup || null,
              }).select('id').single();

              generatedDocs.push({ id: genDoc?.id || '', name: tmpl.name, pdf_url: pdfResult.pdf_url });

              // Send each PDF in chat if enabled
              if (docCtx.send_pdf_in_chat) {
                await sendMediaViaZAPI(supabase, ctx.conversation, pdfResult.pdf_url, `📄 ${tmpl.name}.pdf`);
              }

              // Create signature request per document if needed
              if (docCtx.signing_method && docCtx.signing_method !== 'none' && docCtx.signing_method !== 'manual' && genDoc?.id) {
                const contact = ctx.conversation.contact;
                await supabase.from('document_signatures').insert({
                  organization_id: ctx.organizationId,
                  generated_document_id: genDoc.id,
                  contact_id: ctx.contactId,
                  conversation_id: ctx.conversationId,
                  signing_method: docCtx.signing_method,
                  signer_name: contact?.name || docCtx.collected_data['nome_completo'] || docCtx.collected_data['nome'],
                  signer_phone: contact?.phone,
                  signer_email: contact?.email || docCtx.collected_data['email'],
                  signer_cpf: docCtx.collected_data['cpf'],
                  status: 'pending',
                });
                docCtx.signature_requested = true;
              }
            } else {
              console.error('PDF generation failed for', tmpl.name, pdfResult.error);
            }
          }

          if (generatedDocs.length > 0) {
            docCtx.pdf_generated = true;
            docCtx.pdf_url = generatedDocs[0].pdf_url;

            let resultMsg = docCtx.is_pack
              ? `${generatedDocs.length} documento(s) gerado(s) com sucesso!`
              : 'Documento gerado com sucesso!';
            if (docCtx.signature_requested) {
              resultMsg += ` Solicitação de assinatura via ${docCtx.signing_method === 'govbr' ? 'Gov.br' : 'ZapSign'} criada.`;
            }

            // Send signature link if needed
            if (docCtx.send_signature_link && docCtx.signing_method === 'govbr') {
              const sigMessage = `📝 *Assinatura Digital*\n\nOs documentos foram gerados e precisam de assinatura via Gov.br.\n\nVocê receberá o link para assinatura em breve.`;
              await sendReplyViaZAPI(supabase, ctx.conversation, sigMessage);
            }

            toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, documents_count: generatedDocs.length, message: resultMsg }) });
            toolsExecuted.push({ name: 'generate_document', arguments: {}, result: { success: true, documents_count: generatedDocs.length, signing_method: docCtx.signing_method } });

            // Send internal note if enabled
            const currentNode = ctx.nodes?.find((n: any) => n.id === state.current_node_id);
            const sendInternalNote = currentNode?.data?.sendInternalNote !== false;
            if (sendInternalNote && ctx.conversationId) {
              try {
                const contact = ctx.conversation.contact;
                let noteTemplate = currentNode?.data?.internalNoteTemplate as string || '';
                if (!noteTemplate) {
                  noteTemplate = docCtx.is_pack
                    ? `📋 *Pack gerado*\n\n📦 *Pack:* {{template_name}}\n📄 *Documentos:* ${generatedDocs.length}\n👤 *Contato:* {{contact_name}}\n📱 *Telefone:* {{contact_phone}}`
                    : `📋 *Documento gerado*\n\n📄 *Template:* {{template_name}}\n👤 *Contato:* {{contact_name}}\n📱 *Telefone:* {{contact_phone}}`;
                }
                const noteContent = noteTemplate
                  .replace(/\{\{template_name\}\}/g, docCtx.template_name || '')
                  .replace(/\{\{contact_name\}\}/g, contact?.name || '')
                  .replace(/\{\{contact_phone\}\}/g, contact?.phone || '')
                  .replace(/\{\{document_name\}\}/g, docCtx.template_name || '');

                await supabase.from('messages').insert({
                  conversation_id: ctx.conversationId,
                  content: noteContent,
                  direction: 'outbound',
                  is_from_bot: true,
                  type: 'text',
                  metadata: { is_internal_note: true, type: 'document_generated', template_name: docCtx.template_name },
                });
              } catch (noteErr) {
                console.error('Internal note error:', noteErr);
              }
            }

            // Move pipeline if configured
            const movePipelineAfter = currentNode?.data?.movePipelineAfter;
            const docPipelineId = currentNode?.data?.docPipelineId as string;
            const docPipelineColumnId = currentNode?.data?.docPipelineColumnId as string;
            if (movePipelineAfter && docPipelineId && ctx.conversationId) {
              try {
                let targetColumnId = docPipelineColumnId;
                if (!targetColumnId || targetColumnId === 'first') {
                  const { data: firstCol } = await supabase.from('pipeline_columns')
                    .select('id').eq('pipeline_id', docPipelineId).order('order', { ascending: true }).limit(1).single();
                  if (firstCol) targetColumnId = firstCol.id;
                }
                if (targetColumnId) {
                  await supabase.from('conversation_pipeline_positions').upsert({
                    conversation_id: ctx.conversationId,
                    pipeline_id: docPipelineId,
                    column_id: targetColumnId,
                    order: 0,
                  }, { onConflict: 'conversation_id' });

                  await supabase.from('conversation_stage_history').insert({
                    conversation_id: ctx.conversationId,
                    pipeline_id: docPipelineId,
                    to_column_id: targetColumnId,
                    organization_id: ctx.organizationId,
                    changed_by_type: 'flow',
                  });
                  console.log('Pipeline moved after document generation');
                }
              } catch (pipeErr) {
                console.error('Pipeline move error:', pipeErr);
              }
            }

            shouldAdvance = hasNextNodes;
          } else {
            toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: false, error: 'Nenhum PDF gerado' }) });
            toolsExecuted.push({ name: 'generate_document', arguments: {}, result: { success: false, error: 'No PDFs generated' } });
          }
        } catch (e) {
          console.error('PDF generation error:', e);
          toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: false, error: String(e) }) });
          toolsExecuted.push({ name: 'generate_document', arguments: {}, result: { success: false, error: String(e) } });
        }

      } else if (fnName === 'advance_flow') {
        shouldAdvance = true;
        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true }) });
        toolsExecuted.push({ name: 'advance_flow', arguments: {}, result: { success: true } });
      } else {
        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: false, error: 'Unknown tool' }) });
      }
    }

    aiMessages.push(...toolResults);

    if (shouldAdvance) break;
    if (choice.finish_reason === 'stop') break;
  }

  return { replyText, shouldAdvance, toolsExecuted };
}

// Helper: Send media (PDF) via Z-API
async function sendMediaViaZAPI(supabase: any, conversation: any, mediaUrl: string, caption: string) {
  const contactPhone = conversation.contact?.phone;
  if (!contactPhone) return;

  let instance = null;
  if (conversation.whatsapp_instance_id) {
    const { data } = await supabase.from('whatsapp_instances').select('*')
      .eq('id', conversation.whatsapp_instance_id).eq('status', 'connected').maybeSingle();
    instance = data;
  }
  if (!instance) {
    const { data } = await supabase.from('whatsapp_instances').select('*')
      .eq('organization_id', conversation.organization_id).eq('status', 'connected')
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    instance = data;
  }
  if (!instance) return;

  const normalizedPhone = contactPhone.replace(/\D/g, '');
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (clientToken) headers['Client-Token'] = clientToken;

  try {
    const resp = await fetch(`https://api.z-api.io/instances/${instance.zapi_instance_id}/token/${instance.zapi_token}/send-document/pdf`, {
      method: 'POST', headers,
      body: JSON.stringify({ phone: normalizedPhone, document: mediaUrl, fileName: caption }),
    });

    if (!resp.ok) {
      console.error('Z-API send document error:', await resp.text());
      return;
    }

    const zapiResult = await resp.json();
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      content: `📄 Documento gerado: ${caption}`,
      type: 'document',
      direction: 'outbound',
      is_from_bot: true,
      media_url: mediaUrl,
      zapi_message_id: zapiResult.messageId || zapiResult.zapiMessageId || null,
      metadata: { zapi_response: zapiResult, ai_generated: true, document_type: 'contract' },
    });

    await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation.id);
    console.log('Document sent via Z-API');
  } catch (e) {
    console.error('Send media error:', e);
  }
}

// ==================== CONDITION EVALUATION ====================

async function evaluateCondition(ctx: any, condNode: any, messageContent: string): Promise<string> {
  const condLabel = condNode.data?.conditionLabel || 'Condição';

  try {
    const systemPrompt = `Você é um avaliador de condições. Baseado no histórico da conversa, avalie se a condição "${condLabel}" é VERDADEIRA ou FALSA. Responda APENAS com "true" ou "false".`;

    const msgs = [
      { role: 'system', content: systemPrompt },
      ...ctx.messages.slice(-10).map((m: any) => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.content || '[mídia]',
      })),
      { role: 'user', content: `Última mensagem: "${messageContent}"\n\nA condição "${condLabel}" é verdadeira?` },
    ];

    const resp = await fetch(ctx.aiEndpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.aiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ctx.aiModel, messages: msgs }),
    });

    if (resp.ok) {
      const data = await resp.json();
      const answer = (data.choices?.[0]?.message?.content || '').toLowerCase().trim();
      return answer.includes('true') ? 'true' : 'false';
    }
  } catch (e) {
    console.error('Condition evaluation error:', e);
  }
  return 'true'; // Default to true branch
}

// ==================== LEGACY ORCHESTRATION (fallback) ====================

async function executeLegacyOrchestration(supabase: any, ctx: any, messageContent: string) {
  const toolsExecuted: any[] = [];
  let replyText: string | null = null;
  let replySentViaTool = false;

  const systemPrompt = buildLegacySystemPrompt(ctx);
  const aiMessages: any[] = [
    { role: 'system', content: systemPrompt },
    ...ctx.messages.map((m: any) => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.content || '[mídia]',
    })),
  ];

  if (aiMessages[aiMessages.length - 1]?.role !== 'user' ||
    aiMessages[aiMessages.length - 1]?.content !== messageContent) {
    aiMessages.push({ role: 'user', content: messageContent });
  }

  const tools = buildLegacyTools(ctx);
  let round = 0;

  while (round < MAX_TOOL_ROUNDS) {
    round++;
    const abortCtrl = new AbortController();
    const tid = setTimeout(() => abortCtrl.abort(), 25000);
    let aiResponse: Response;
    try {
      aiResponse = await fetch(ctx.aiEndpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ctx.aiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ctx.aiModel, messages: aiMessages, tools, tool_choice: 'auto' }),
        signal: abortCtrl.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(tid);
      console.error('[ORCHESTRATOR] AI fetch error:', fetchErr.name, fetchErr.message);
      break;
    }
    clearTimeout(tid);

    if (!aiResponse.ok) break;

    const aiResult = await aiResponse.json();
    const choice = aiResult.choices?.[0];
    if (!choice) break;

    aiMessages.push(choice.message);

    if (!choice.message?.tool_calls || choice.message.tool_calls.length === 0) {
      if (!replySentViaTool && !replyText && choice.message?.content) {
        replyText = choice.message.content.trim();
      }
      break;
    }

    const toolResults: any[] = [];
    let shouldBreak = false;

    for (const toolCall of choice.message.tool_calls) {
      const fnName = toolCall.function.name;
      let fnArgs: any;
      try { fnArgs = JSON.parse(toolCall.function.arguments); } catch { fnArgs = {}; }

      if (fnName === 'finalizar_interacao') {
        // AI agent is done with its task — advance the flow execution
        const resultado = fnArgs.resultado || 'concluido';
        console.log(`[ORCHESTRATOR] finalizar_interacao called with resultado: ${resultado}`);

        if (ctx.flowExecutionId) {
          // Get current flow execution to find the next node after ai-handoff
          const { data: flowExec } = await supabase
            .from('flow_executions')
            .select('*, flow:flows(nodes, edges)')
            .eq('id', ctx.flowExecutionId)
            .single();

          if (flowExec) {
            const nodes = flowExec.flow?.nodes || [];
            const edges = flowExec.flow?.edges || [];
            const currentNodeId = flowExec.current_node_id;

            // Find next node after the ai-handoff, using outcome-based routing
            const currentNodeObj = nodes.find((n: any) => n.id === currentNodeId);
            const configuredOutcomes = currentNodeObj?.data?.expectedOutcomes 
              ? String(currentNodeObj.data.expectedOutcomes).split(',').map((s: string) => s.trim()).filter(Boolean)
              : [];

            let nextEdge: any = null;
            if (configuredOutcomes.length > 0) {
              // Try to match resultado to a configured outcome handle
              const outcomeHandle = `outcome-${resultado}`;
              nextEdge = edges.find((e: any) => e.source === currentNodeId && e.sourceHandle === outcomeHandle);
              if (!nextEdge) {
                // Fallback to default handle
                nextEdge = edges.find((e: any) => e.source === currentNodeId && e.sourceHandle === 'outcome-default');
              }
              if (!nextEdge) {
                // Last fallback: any edge from this node
                nextEdge = edges.find((e: any) => e.source === currentNodeId);
              }
              console.log(`[ORCHESTRATOR] Outcome routing: resultado="${resultado}", matched handle="${nextEdge?.sourceHandle || 'none'}"`);
            } else {
              // No outcomes configured — use simple next edge (backward compatible)
              nextEdge = edges.find((e: any) => e.source === currentNodeId);
            }
            const nextNodeId = nextEdge?.target || null;

            // Store the resultado in variables for condition nodes downstream
            const variables = { ...(flowExec.variables || {}), ai_resultado: resultado };

            if (nextNodeId) {
              // Resume flow from the next node
              console.log(`[ORCHESTRATOR] Advancing flow ${ctx.flowExecutionId} to node ${nextNodeId}`);
              await supabase.from('flow_executions').update({
                status: 'running',
                current_node_id: nextNodeId,
                variables,
              }).eq('id', ctx.flowExecutionId);

              // Clear the handoff context from conversation metadata
              const { data: convData } = await supabase.from('conversations').select('metadata').eq('id', ctx.conversationId).single();
              const metadata = { ...(convData?.metadata || {}) };
              delete metadata.ai_handoff_context;
              await supabase.from('conversations').update({ metadata }).eq('id', ctx.conversationId);

              // Trigger flow-execute to continue from the next node
              const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
              const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
              try {
                await fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
                  body: JSON.stringify({
                    flowId: flowExec.flow_id,
                    conversationId: ctx.conversationId,
                    startNodeId: nextNodeId,
                  }),
                });
              } catch (e) {
                console.error('[ORCHESTRATOR] Error resuming flow:', e);
              }
            } else {
              // No next node — complete the flow and reset service_mode
              console.log(`[ORCHESTRATOR] No next node after ai-handoff — completing flow, resetting service_mode`);
              await supabase.from('flow_executions').update({
                status: 'completed',
                variables,
                completed_at: new Date().toISOString(),
              }).eq('id', ctx.flowExecutionId);
              // Reset service_mode so AI stops responding
              await supabase.from('conversations').update({ service_mode: 'humano' }).eq('id', ctx.conversationId);
            }
          }
        }

        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, resultado }) });
        toolsExecuted.push({ name: fnName, arguments: fnArgs, result: { success: true } });
        shouldBreak = true;
        continue;
      }

      const result = await executeToolDirect(supabase, fnName, fnArgs, ctx);
      toolsExecuted.push({ name: fnName, arguments: fnArgs, result });

      if (fnName === 'send_reply' && fnArgs.message) {
        if (!isInternalThought(fnArgs.message)) {
          replyText = fnArgs.message;
          replySentViaTool = true;
        } else {
          console.log('Filtered internal thought from legacy send_reply:', fnArgs.message);
        }
      }
      if (fnName === 'trigger_flow' || fnName === 'switch_agent') {
        replySentViaTool = true;
        shouldBreak = true;
      }

      toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
    }

    aiMessages.push(...toolResults);
    if (shouldBreak) break;
    if (choice.finish_reason === 'stop') break;
  }

  return { 
    replyText, 
    toolsExecuted,
    current_node_id: null,
    active_agent_id: ctx.conversation.ai_agent_id
  };
}

// ==================== TOOL EXECUTION ====================

async function executeToolDirect(supabase: any, toolName: string, args: any, ctx: any): Promise<any> {
  switch (toolName) {
    case 'send_reply':
      return { success: true };

    case 'move_pipeline': {
      const { pipeline_id, column_id } = args;
      const { error } = await supabase.from('conversation_pipeline_positions').upsert({
        conversation_id: ctx.conversationId, pipeline_id, column_id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id,pipeline_id' });
      return error ? { success: false, error: error.message } : { success: true };
    }

    case 'add_tag': {
      const { tag_id } = args;
      const { data: existing } = await supabase.from('contact_tags')
        .select('id').eq('contact_id', ctx.contactId).eq('tag_id', tag_id).maybeSingle();
      if (!existing) {
        await supabase.from('contact_tags').insert({ contact_id: ctx.contactId, tag_id, added_by_type: 'ai' });
      }
      return { success: true };
    }

    case 'remove_tag': {
      const { tag_id } = args;
      await supabase.from('contact_tags').delete().eq('contact_id', ctx.contactId).eq('tag_id', tag_id);
      return { success: true };
    }

    case 'trigger_flow': {
      const { flow_id } = args;
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
          body: JSON.stringify({
            flowId: flow_id,
            conversationId: ctx.conversationId,
            isFromOrchestrator: true // Per user request: IA messages if in orchestrator
          }),
        });
        const result = await resp.json();
        return { success: result.success };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case 'switch_agent': {
      const { agent_id } = args;
      const { data: agent } = await supabase.from('ai_agents').select('function_role').eq('id', agent_id).single();
      const updateData: any = { ai_agent_id: agent_id };
      if (agent?.function_role) {
        const { data: dept } = await supabase.from('departments').select('id')
          .eq('organization_id', ctx.organizationId).ilike('name', `%${agent.function_role}%`).maybeSingle();
        if (dept) updateData.department_id = dept.id;
      }
      await supabase.from('conversations').update(updateData).eq('id', ctx.conversationId);
      return { success: true };
    }

    default:
      return { success: false, error: 'Unknown tool' };
  }
}

// ==================== STATE MANAGEMENT ====================

function loadOrchestrationState(conversation: any, masterPromptId: string): OrchestrationState {
  const metadata = conversation.metadata || {};
  const saved = metadata.orchestration_state;

  if (saved && saved.master_prompt_id === masterPromptId) {
    return saved;
  }

  // Initialize new state
  return {
    master_prompt_id: masterPromptId,
    current_node_id: null,
    completed_nodes: [],
    waiting_for_response: false,
    flow_completed: false,
  };
}

async function saveOrchestrationState(supabase: any, conversationId: string, state: OrchestrationState) {
  const { data: conv } = await supabase.from('conversations').select('metadata').eq('id', conversationId).single();
  const metadata = { ...(conv?.metadata || {}), orchestration_state: state };
  await supabase.from('conversations').update({ metadata }).eq('id', conversationId);
  console.log('State saved:', JSON.stringify(state));
}

// ==================== GRAPH HELPERS ====================

function findNextNodeIds(edges: any[], currentNodeId: string): string[] {
  return edges
    .filter((e: any) => e.source === currentNodeId)
    .map((e: any) => e.target);
}

// ==================== LEGACY HELPERS ====================

function buildLegacySystemPrompt(ctx: any): string {
  let prompt = ctx.masterPrompt.content + '\n\n---\n\n';
  prompt += 'CONTEXTO ATUAL DO SISTEMA:\n\n';

  if (ctx.agents.length > 0) {
    prompt += 'AGENTES DISPONÍVEIS:\n';
    for (const agent of ctx.agents) {
      const isCurrent = agent.id === ctx.conversation.ai_agent_id ? ' (ATIVO)' : '';
      prompt += `- @[${agent.name}] → id: "${agent.id}"${isCurrent}\n`;
    }
    prompt += '\n';
  }

  if (ctx.pipelines.length > 0) {
    prompt += 'PIPELINES:\n';
    for (const p of ctx.pipelines) {
      const cols = (p.columns || []).sort((a: any, b: any) => a.order - b.order);
      for (const col of cols) {
        const isPos = ctx.pipelinePositions.some((pp: any) => pp.pipeline_id === p.id && pp.column_id === col.id);
        prompt += `  - "${col.name}" → pipeline_id: "${p.id}", column_id: "${col.id}"${isPos ? ' ← ATUAL' : ''}\n`;
      }
    }
    prompt += '\n';
  }

  if (ctx.allTags.length > 0) {
    prompt += 'TAGS: ';
    prompt += ctx.allTags.map((t: any) => `"${t.name}"(${t.id})`).join(', ') + '\n';
    const current = ctx.contactTags.map((ct: any) => ct.tag?.name).filter(Boolean);
    prompt += `Tags do contato: ${current.length > 0 ? current.join(', ') : 'Nenhuma'}\n\n`;
  }

  if (ctx.flows.length > 0) {
    prompt += 'FLUXOS: ';
    prompt += ctx.flows.map((f: any) => `"${f.name}"(${f.id})`).join(', ') + '\n\n';
  }

  prompt += `Contato: ${ctx.conversation.contact?.name || 'Não informado'} (${ctx.conversation.contact?.phone})\n\n`;

  // Include active agent's prompt if we have one
  const activeAgent = ctx.agents.find((a: any) => a.id === ctx.conversation.ai_agent_id);
  if (activeAgent) {
    prompt += `VOCÊ É O AGENTE "${activeAgent.name}" NESTE MOMENTO.\n`;
    if (activeAgent.prompt_base) {
      prompt += `PROMPT DO AGENTE:\n${activeAgent.prompt_base}\n\n`;
    }
  }

  prompt += `INSTRUÇÕES:\n`;
  prompt += `- Use send_reply para responder. Resposta em português brasileiro.\n`;
  prompt += `- Execute UMA etapa por vez. Após trigger_flow ou switch_agent, PARE.\n`;
  prompt += `- Leia TODA a conversa. NUNCA envie mensagens em inglês ou sem sentido.\n`;
  prompt += `- NUNCA produza texto entre parênteses ou pensamentos internos. Apenas use send_reply.\n`;

  if (ctx.flowExecutionId) {
    prompt += `\n⚠️ VOCÊ ESTÁ DENTRO DE UM FLUXO AUTOMATIZADO.\n`;
    prompt += `- Quando sua tarefa nesta etapa estiver COMPLETA, use finalizar_interacao(resultado) para devolver o controle ao fluxo.\n`;
    prompt += `- NÃO finalize prematuramente. Conclua seu objetivo primeiro.\n`;
    prompt += `- Exemplos de resultado: "qualificado", "desqualificado", "concluido", "precisa_de_humano".\n`;
  }

  // Inject training rules
  const rulesSection = buildTrainingRulesSection(ctx.trainingRules, {
    agentId: ctx.conversation?.ai_agent_id, masterPromptId: ctx.masterPrompt?.id,
    flowId: ctx.resolvedFlowId,
  });
  if (rulesSection) prompt += rulesSection;

  return prompt;
}

// ==================== TRAINING RULES HELPER ====================

function buildTrainingRulesSection(
  allRules: any[],
  filters: { agentId?: string; masterPromptId?: string; flowId?: string; nodeId?: string }
): string {
  if (!allRules || allRules.length === 0) return '';

  // Filter relevant rules for this context — inclusive matching
  const relevant = allRules.filter((r: any) => {
    if (!r.is_active) return false;

    // Agent rules: match if targeting this agent OR if no agent_id specified (applies to all agents)
    if (r.target_type === 'agent') {
      if (!r.agent_id) return true; // Global agent rule — applies to all
      if (filters.agentId && r.agent_id === filters.agentId) return true;
      return false;
    }

    // Master prompt rules: match if targeting this prompt OR no master_prompt_id (global)
    if (r.target_type === 'master_prompt') {
      if (!r.master_prompt_id) return true; // Global master prompt rule
      if (filters.masterPromptId && r.master_prompt_id === filters.masterPromptId) return true;
      return false;
    }

    // Flow node rules: match by flow and optionally node
    if (r.target_type === 'flow_node') {
      if (!r.flow_id) return true; // Global flow rule
      if (filters.flowId && r.flow_id === filters.flowId) {
        if (r.node_id && filters.nodeId) return r.node_id === filters.nodeId;
        return true; // flow-level rule without specific node
      }
      return false;
    }

    // Unknown target_type — include it (safety net)
    return true;
  });

  if (relevant.length === 0) return '';

  let section = `\n## REGRAS APRENDIDAS (${relevant.length}):\n`;
  section += `Estas regras foram definidas pela equipe. Siga-as rigorosamente.\n\n`;

  for (const rule of relevant) {
    section += `- **Situação:** ${rule.situation}\n`;
    section += `  **Regra:** ${rule.rule}\n\n`;
  }

  return section;
}

function buildLegacyTools(ctx?: any) {
  const tools = [
    { type: 'function', function: { name: 'send_reply', description: 'Responder ao cliente', parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } } },
    { type: 'function', function: { name: 'move_pipeline', description: 'Mover pipeline', parameters: { type: 'object', properties: { pipeline_id: { type: 'string' }, column_id: { type: 'string' } }, required: ['pipeline_id', 'column_id'] } } },
    { type: 'function', function: { name: 'add_tag', description: 'Adicionar tag', parameters: { type: 'object', properties: { tag_id: { type: 'string' } }, required: ['tag_id'] } } },
    { type: 'function', function: { name: 'remove_tag', description: 'Remover tag', parameters: { type: 'object', properties: { tag_id: { type: 'string' } }, required: ['tag_id'] } } },
    { type: 'function', function: { name: 'trigger_flow', description: 'Disparar fluxo', parameters: { type: 'object', properties: { flow_id: { type: 'string' } }, required: ['flow_id'] } } },
    { type: 'function', function: { name: 'switch_agent', description: 'Trocar agente', parameters: { type: 'object', properties: { agent_id: { type: 'string' } }, required: ['agent_id'] } } },
  ];

  // Add finalizar_interacao tool when inside a flow execution (ai-handoff context)
  if (ctx?.flowExecutionId) {
    tools.push({
      type: 'function',
      function: {
        name: 'finalizar_interacao',
        description: 'Finalizar a interação do agente de IA e devolver o controle ao fluxo. Use quando seu objetivo nesta etapa estiver concluído. Exemplos de resultado: "qualificado", "desqualificado", "concluido", "precisa_de_humano".',
        parameters: {
          type: 'object',
          properties: {
            resultado: {
              type: 'string',
              description: 'Resultado da interação (ex: qualificado, desqualificado, concluido, precisa_de_humano)'
            }
          },
          required: ['resultado'],
        },
      },
    } as any);
  }

  return tools;
}

// ==================== SHARED HELPERS ====================

async function resolveActiveMasterPrompt(supabase: any, conversation: any) {
  const orgId = conversation.organization_id;

  // 1. Check if conversation is in an active flow execution
  const { data: execution } = await supabase
    .from('flow_executions')
    .select('*, flow:flows(*)')
    .eq('conversation_id', conversation.id)
    .eq('status', 'running')
    .maybeSingle();

  if (execution?.flow?.is_master_active && execution.flow.master_prompt) {
    console.log('Using Flow Master Prompt from flow:', execution.flow.id);
    return {
      id: execution.flow.id,
      flow_id: execution.flow.id,
      name: `Flow Master: ${execution.flow.name}`,
      content: execution.flow.master_prompt,
      is_active: true,
      provider: execution.flow.ai_provider || null,
      model: execution.flow.ai_model || null
    };
  }

  // 2. Fallback to existing logic (workspace config or default active prompt)
  const { data: configs } = await supabase
    .from('workspace_agent_configs')
    .select('*, master_prompt:master_prompts(*)')
    .eq('organization_id', orgId);

  if (configs?.length > 0) {
    for (const config of configs) {
      if (config.master_prompt?.is_active) return config.master_prompt;
    }
  }

  const { data: activePrompt } = await supabase
    .from('master_prompts').select('*')
    .eq('organization_id', orgId).eq('is_active', true)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();

  return activePrompt;
}

async function resolveWorkspaceConfig(supabase: any, conversation: any) {
  const { data } = await supabase
    .from('workspace_agent_configs').select('*')
    .eq('organization_id', conversation.organization_id)
    .limit(1).maybeSingle();
  return data;
}

async function sendReplyViaZAPI(supabase: any, conversation: any, message: string, aiMetadata?: any) {
  const contactPhone = conversation.contact?.phone;
  if (!contactPhone) return;

  let instance = null;
  if (conversation.whatsapp_instance_id) {
    const { data } = await supabase.from('whatsapp_instances').select('*')
      .eq('id', conversation.whatsapp_instance_id).eq('status', 'connected').maybeSingle();
    instance = data;
  }
  if (!instance) {
    const { data } = await supabase.from('whatsapp_instances').select('*')
      .eq('organization_id', conversation.organization_id).eq('status', 'connected')
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    instance = data;
  }
  if (!instance || !instance.zapi_token) return;

  const normalizedPhone = contactPhone.replace(/\D/g, '');
  const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'token': instance.zapi_token
  };

  try {
    // Typing indicator fallback
    await fetch(`${uazapiBaseUrl}/chat/presence`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ number: normalizedPhone, presenceType: 'composing' })
    }).catch(() => { });
    await new Promise(r => setTimeout(r, 1000));
  } catch { }

  const resp = await fetch(`${uazapiBaseUrl}/send/text`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ number: normalizedPhone, text: message }),
  });

  if (!resp.ok) {
    console.error('UAZAPI send error:', await resp.text());
    return;
  }

  const zapiResult = await resp.json();
  const zapiMessageId = zapiResult.messageId || zapiResult.zapiMessageId || zapiResult.id || null;

  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    content: message,
    type: 'text',
    direction: 'outbound',
    is_from_bot: true, // Orchestrator IS an AI agent
    zapi_message_id: zapiMessageId,
    metadata: { 
      zapi_response: zapiResult, 
      ai_generated: true,
      ai_metadata: aiMetadata || {}
    },
  });

  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation.id);
  console.log('Reply sent via UAZAPI');
}

// ==================== INTERNAL THOUGHT FILTER ====================

function isInternalThought(text: string): boolean {
  if (!text || text.length < 5) return true;

  const trimmed = text.trim();

  // Wrapped entirely in parentheses - internal monologue
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) return true;

  // Wrapped in brackets - internal notes
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return true;

  // Tool call annotations leaked as plain text
  if (/finalizar_interacao\s*\(/i.test(trimmed)) return true;
  if (/advance_flow\s*\(/i.test(trimmed)) return true;
  if (/send_reply\s*\(/i.test(trimmed)) return true;

  // Common AI internal patterns (Portuguese)
  const internalPatterns = [
    /^(\(.*aguardando.*\))$/is,
    /^(\(.*enviando.*\))$/is,
    /^(\(.*processando.*\))$/is,
    /^(\(.*analisando.*\))$/is,
    /acabei de enviar a resposta/i,
    /^ok,?\s*(vou|agora|preciso)/i,
    /^certo,?\s*(vou|agora|preciso)/i,
    /^entendido/i,
    /aguardando.*dados/i,
    /aguardando.*resposta/i,
  ];

  return internalPatterns.some(p => p.test(trimmed));
}

// Strip tool call annotations from reply text that might be mixed with real content
function stripInternalAnnotations(text: string): string {
  if (!text) return text;
  // Remove lines containing tool call syntax
  let cleaned = text
    .replace(/finalizar_interacao\s*\([^)]*\)\s*/gi, '')
    .replace(/advance_flow\s*\([^)]*\)\s*/gi, '')
    .trim();
  // If everything was stripped, return empty
  return cleaned.length < 3 ? '' : cleaned;
}

function resolveAgentConfig(ctx: any, agent: any, integrationConfig: any): AIConfigResult {
  if (agent?.provider || agent?.model) {
    const provider = agent.provider || integrationConfig?.ai_provider || 'lovable';
    const model = agent.model || integrationConfig?.default_model || 'google/gemini-3-flash-preview';
    return resolveAIConfig(integrationConfig, 'agents', ctx.LOVABLE_API_KEY, provider, model);
  }
  return { endpoint: ctx.aiEndpoint, apiKey: ctx.aiApiKey, model: ctx.aiModel };
}

// ==================== AI CONFIG RESOLUTION ====================

interface AIConfigResult {
  endpoint: string;
  apiKey: string;
  model: string;
}

async function resolveIntegrationConfig(supabase: any, organizationId: string) {
  const { data } = await supabase
    .from('integration_configs')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();
  return data;
}

function resolveAIConfig(
  integrationConfig: any,
  feature: string,
  lovableApiKey: string,
  overrideProvider?: string,
  overrideModel?: string
): AIConfigResult {
  const LOVABLE_ENDPOINT = 'https://ai.gateway.lovable.dev/v1/chat/completions';
  const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
  const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

  if (!integrationConfig) {
    return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableApiKey, model: 'google/gemini-2.5-flash' };
  }

  // Check feature-specific override first
  const featureProvider = integrationConfig[`${feature}_provider`];
  const featureModel = integrationConfig[`${feature}_model`];
  let provider = overrideProvider || featureProvider || integrationConfig.ai_provider || 'lovable';
  let model = overrideModel || featureModel || integrationConfig.default_model || 'google/gemini-2.5-flash';

  // Ensure format is correct depending on provider
  if (provider === 'gemini') {
    model = model.replace('google/', ''); // Google API doesn't use prefix
  } else if (provider === 'lovable') {
    if (!model.startsWith('google/') && !model.startsWith('openai/')) {
      model = model.includes('gpt') ? `openai/${model}` : `google/${model}`;
    }
  }

  switch (provider) {
    case 'openai':
      if (!integrationConfig.openai_api_key) {
        console.warn('OpenAI selected but no API key, falling back to Lovable');
        return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableApiKey, model: 'google/gemini-2.5-flash' };
      }
      return { endpoint: OPENAI_ENDPOINT, apiKey: integrationConfig.openai_api_key, model };
    case 'gemini':
      if (!integrationConfig.gemini_api_key) {
        console.warn('Gemini selected but no API key, falling back to Lovable');
        return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableApiKey, model: 'google/gemini-2.5-flash' };
      }
      return { endpoint: GEMINI_ENDPOINT, apiKey: integrationConfig.gemini_api_key, model };
    default:
      return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableApiKey, model };
  }
}
