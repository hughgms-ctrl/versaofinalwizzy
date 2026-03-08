import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FlowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

interface ContentItem {
  id: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'delay';
  content?: string;
  mediaUrl?: string;
  caption?: string;
  delaySeconds?: number;
}

interface ExecutionContext {
  conversationId: string;
  contactPhone: string;
  contactId: string;
  variables: Record<string, unknown>;
  organizationId: string;
  zapiInstanceId: string;
  zapiToken: string;
  isFromOrchestrator?: boolean;
}

// deno-lint-ignore no-explicit-any
type SupabaseClientType = any;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { flowId, conversationId, startNodeId, isFromOrchestrator } = await req.json();
    console.log(`[FLOW EXECUTE] Received request: flowId=${flowId}, conversationId=${conversationId}, startNodeId=${startNodeId}, isFromOrchestrator=${isFromOrchestrator}`);

    if (!flowId || !conversationId) {
      return new Response(
        JSON.stringify({ error: 'flowId and conversationId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Start background execution
    const executionPromise = (async () => {
      try {
        // 1. Get the flow
        const { data: flow, error: flowError } = await supabase
          .from('flows')
          .select('*')
          .eq('id', flowId)
          .single();

        if (flowError || !flow) {
          console.error(`[FLOW EXECUTE] Flow ${flowId} not found:`, flowError);
          return;
        }

        // 2. Get conversation and contact
        const { data: conversation, error: convError } = await supabase
          .from('conversations')
          .select('*, contacts(*)')
          .eq('id', conversationId)
          .single();

        if (convError || !conversation) {
          console.error(`[FLOW EXECUTE] Conversation ${conversationId} not found`);
          return;
        }

        // 3. Get WhatsApp instance
        const { data: instance, error: instanceError } = await supabase
          .from('whatsapp_instances')
          .select('*')
          .eq('organization_id', flow.organization_id)
          .eq('status', 'connected')
          .single();

        if (instanceError || !instance) {
          console.error(`[FLOW EXECUTE] No connected instance for org ${flow.organization_id}`);
          return;
        }

        // 4. Create flow execution record
        const { data: execution, error: execError } = await supabase
          .from('flow_executions')
          .insert({
            flow_id: flowId,
            conversation_id: conversationId,
            organization_id: flow.organization_id,
            status: 'running',
            current_node_id: startNodeId || 'start-1',
            variables: {},
          })
          .select()
          .single();

        if (execError) {
          console.error('[FLOW EXECUTE] Error creating execution:', execError);
          return;
        }

        const nodes = flow.nodes as FlowNode[];
        const edges = flow.edges as FlowEdge[];

        const context: ExecutionContext = {
          conversationId,
          contactPhone: conversation.contacts?.phone || '',
          contactId: conversation.contact_id,
          variables: {},
          organizationId: flow.organization_id,
          zapiInstanceId: instance.zapi_instance_id!,
          zapiToken: instance.zapi_token!,
          isFromOrchestrator: !!isFromOrchestrator,
        };

        await runFlowExecution(execution.id, flow, nodes, edges, context, supabase);
      } catch (err) {
        console.error('[FLOW EXECUTE] Background processing error:', err);
      }
    })();

    // @ts-ignore: EdgeRuntime may not exist in all environments
    if (typeof globalThis.EdgeRuntime !== 'undefined' && globalThis.EdgeRuntime.waitUntil) {
      // @ts-ignore
      globalThis.EdgeRuntime.waitUntil(executionPromise);
    } else {
      executionPromise.catch(err => console.error('[FLOW EXECUTE] Background error:', err));
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Flow queued for background execution'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Flow execution error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function runFlowExecution(
  executionId: string,
  flow: any,
  nodes: FlowNode[],
  edges: FlowEdge[],
  context: ExecutionContext,
  supabase: SupabaseClientType
) {
  let currentNodeId: string | null = (await supabase.from('flow_executions').select('current_node_id').eq('id', executionId).single()).data?.current_node_id || nodes.find(n => n.type === 'start')?.id || null;
  const executionLog: Array<{ nodeId: string; type: string; result: string; timestamp: string; metadata?: any }> = [];

  while (currentNodeId) {
    const currentNode = nodes.find(n => n.id === currentNodeId);
    if (!currentNode) break;

    try {
      const result = await executeNode(currentNode, context, supabase, flow);
      executionLog.push({
        nodeId: currentNode.id,
        type: currentNode.type,
        result: result.success ? 'success' : 'failed',
        metadata: result.metadata, // Include metadata for debugging
        timestamp: new Date().toISOString(),
      });

      if (!result.success) {
        await supabase
          .from('flow_executions')
          .update({
            status: 'failed',
            error_message: result.error,
            execution_log: executionLog,
            completed_at: new Date().toISOString(),
          })
          .eq('id', executionId);
        return;
      }

      if (result.waitForInput) {
        const updateData: Record<string, unknown> = {
          status: 'waiting_input',
          current_node_id: currentNode.id,
          variables: context.variables,
          execution_log: executionLog,
        };

        // Set timeout_at if the node has a timeout configured
        const timeoutMinutes = Number(currentNode.data?.timeoutMinutes || 0);
        if (timeoutMinutes > 0) {
          updateData.timeout_at = new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString();
          console.log(`[FLOW EXECUTE] Setting timeout_at: ${updateData.timeout_at} (${timeoutMinutes} min)`);
        }

        await supabase
          .from('flow_executions')
          .update(updateData)
          .eq('id', executionId);
        return;
      }

      if (result.variables) {
        Object.assign(context.variables, result.variables);
      }

      const nextNodeId = findNextNode(currentNode, edges, result.outputHandle);
      currentNodeId = nextNodeId;

      // Update execution log in building state for real-time UI feel
      await supabase
        .from('flow_executions')
        .update({
          execution_log: executionLog,
          current_node_id: currentNodeId,
          variables: context.variables,
        })
        .eq('id', executionId);

      if (currentNodeId && (currentNode.type.startsWith('message-') || currentNode.type === 'content-block' || currentNode.type === 'action-delay')) {
        // Small delay to prevent race conditions and allow DB to propagate
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`Error executing node ${currentNode.id}:`, error);
      executionLog.push({
        nodeId: currentNode.id,
        type: currentNode.type,
        result: 'error',
        timestamp: new Date().toISOString(),
      });
      break;
    }
  }

  await supabase
    .from('flow_executions')
    .update({
      status: 'completed',
      execution_log: executionLog,
      variables: context.variables,
      completed_at: new Date().toISOString(),
    })
    .eq('id', executionId);

  await supabase
    .from('flows')
    .update({ triggers_count: flow.triggers_count + 1 })
    .eq('id', flow.id);
}

interface NodeResult {
  success: boolean;
  error?: string;
  outputHandle?: string;
  variables?: Record<string, unknown>;
  waitForInput?: boolean;
  metadata?: any;
}

async function executeNode(
  node: FlowNode,
  context: ExecutionContext,
  supabase: SupabaseClientType,
  flow?: any
): Promise<NodeResult> {
  const { type, data } = node;

  switch (type) {
    case 'start':
      return { success: true };

    case 'content-block':
      return await executeContentBlock(data, context, supabase, node);

    case 'message-buttons':
      return await sendButtonsMessage(data, context);

    case 'message-list':
      return await sendListMessage(data, context);

    case 'action-delay':
      return await executeDelay(data);

    case 'action-tag':
      return await executeTagAction(data, context, supabase);

    case 'action-pipeline':
      return await executePipelineAction(data, context, supabase);

    case 'condition':
      return executeCondition(data, context);

    case 'user-input':
      return { success: true, waitForInput: true };

    case 'action-webhook':
      return await executeWebhook(data, context);

    case 'ai-handoff':
      return await executeAIHandoff(data, context, supabase, flow);

    case 'ai-return':
      return { success: true };

    case 'action-flow':
      return await executeSubFlow(data, context, supabase);

    case 'action-transfer':
      return await executeTransfer(data, context, supabase);

    default:
      console.log(`Unknown node type: ${type}`);
      return { success: true };
  }
}

async function executeAIHandoff(
  data: Record<string, unknown>,
  context: ExecutionContext,
  supabase: SupabaseClientType,
  flow?: any
): Promise<NodeResult> {
  try {
    const agentId = String(data.agentId || '');
    // The node stores the prompt as "additionalPrompt", not "contextMessage"
    const additionalPrompt = String(data.additionalPrompt || data.contextMessage || '');
    const expectedOutcomes = String(data.expectedOutcomes || '');

    // Parse outcomes for the prompt
    const outcomes = expectedOutcomes ? expectedOutcomes.split(',').map(s => s.trim()).filter(Boolean) : [];

    // 1. Set the agent on the conversation so orchestrator knows which agent to use
    if (agentId) {
      await supabase.from('conversations').update({
        ai_agent_id: agentId,
        service_mode: 'ia',
      }).eq('id', context.conversationId);
      console.log(`[FLOW EXECUTE] AI Handoff: set agent ${agentId} on conversation`);
    } else {
      await supabase.from('conversations').update({
        service_mode: 'ia',
      }).eq('id', context.conversationId);
    }

    // 2. Store flow context in metadata so the webhook can pass it to the orchestrator
    const flowContext: Record<string, unknown> = {};
    
    // Build the master prompt override from flow master_prompt + node additionalPrompt
    const promptParts: string[] = [];
    if (flow?.master_prompt && flow.master_prompt.trim()) {
      promptParts.push(flow.master_prompt);
    }
    if (additionalPrompt) {
      promptParts.push(`---\nINSTRUÇÕES ESPECÍFICAS DO NÓ:\n${additionalPrompt}`);
    }
    if (expectedOutcomes) {
      promptParts.push(`---\nRESULTADOS ESPERADOS: ${expectedOutcomes}`);
      promptParts.push(`Ao finalizar a interação, use finalizar_interacao(resultado) com um dos seguintes resultados: ${outcomes.join(', ')}. Se nenhum se aplicar, use "default".`);
    }
    
    if (promptParts.length > 0) {
      flowContext.additionalContext = promptParts.join('\n\n');
    }
    if (agentId) {
      flowContext.agentId = agentId;
    }

    // Save flow context to conversation metadata for the webhook to use
    const { data: convData } = await supabase
      .from('conversations').select('metadata').eq('id', context.conversationId).single();
    const metadata = { ...(convData?.metadata || {}), ai_handoff_context: flowContext };
    await supabase.from('conversations').update({ metadata }).eq('id', context.conversationId);

    console.log(`[FLOW EXECUTE] AI Handoff: pausing flow, waiting for user message. Agent: ${agentId || 'default'}`);

    // 3. Return waitForInput — the flow PAUSES here.
    // The webhook will detect this state and route subsequent messages to the orchestrator.
    return { success: true, waitForInput: true };
  } catch (error) {
    console.error('Error in executeAIHandoff:', error);
    return { success: false, error: String(error) };
  }
}

// Execute sub-flow (action-flow node)
async function executeSubFlow(
  data: Record<string, unknown>,
  context: ExecutionContext,
  supabase: SupabaseClientType
): Promise<NodeResult> {
  const flowId = String(data.flowId || '');
  const flowName = String(data.flowName || data.label || 'Sub-fluxo');

  if (!flowId) {
    console.log('[FLOW EXECUTE] action-flow: no flowId configured');
    return { success: true, metadata: { skipped: 'no_flow_id' } };
  }

  console.log(`[FLOW EXECUTE] Triggering sub-flow: ${flowId} (${flowName})`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const response = await fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        flowId,
        conversationId: context.conversationId,
        isFromOrchestrator: context.isFromOrchestrator,
      }),
    });

    const result = await response.json();
    console.log(`[FLOW EXECUTE] Sub-flow ${flowId} result:`, result.success ? 'success' : 'failed');

    // Wait a bit for sub-flow to process before continuing
    await new Promise(resolve => setTimeout(resolve, 2000));

    return { success: true, metadata: { flowId, flowName, triggered: true } };
  } catch (error) {
    console.error(`[FLOW EXECUTE] Sub-flow trigger error:`, error);
    return { success: false, error: `Sub-flow trigger failed: ${error}` };
  }
}

// Execute transfer to human
async function executeTransfer(
  data: Record<string, unknown>,
  context: ExecutionContext,
  supabase: SupabaseClientType
): Promise<NodeResult> {
  try {
    const departmentId = String(data.departmentId || '');
    const updateData: Record<string, unknown> = { service_mode: 'humano' };
    if (departmentId) updateData.department_id = departmentId;

    await supabase.from('conversations').update(updateData).eq('id', context.conversationId);
    console.log('[FLOW EXECUTE] Transferred to human');
    return { success: true, metadata: { transferred: true, departmentId } };
  } catch (error) {
    console.error('[FLOW EXECUTE] Transfer error:', error);
    return { success: false, error: String(error) };
  }
}

// Execute Content Block - processes multiple items sequentially
async function executeContentBlock(data: Record<string, unknown>, context: ExecutionContext, supabase: SupabaseClientType, node?: FlowNode): Promise<NodeResult> {
  const items = (data.items as ContentItem[]) || [];

  if (items.length === 0) {
    return { success: true };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      // Look ahead for presence type
      let nextPresenceType: 'typing' | 'recording' | null = null;

      // Find the next non-delay item to determine presence type
      for (let j = i; j < items.length; j++) {
        if (items[j].type === 'audio') {
          nextPresenceType = 'recording';
          break;
        } else if (['text', 'image', 'video', 'document'].includes(items[j].type)) {
          nextPresenceType = 'typing';
          break;
        }
      }

      switch (item.type) {
        case 'text':
          if (item.content) {
            // Send typing presence before text
            await sendPresence('typing', context);
            await new Promise(resolve => setTimeout(resolve, 1500));
            await sendTextMessage(item.content, context, supabase);
          }
          break;

        case 'image':
          if (item.mediaUrl) {
            await sendPresence('typing', context);
            await new Promise(resolve => setTimeout(resolve, 1500));
            await sendMediaItem('image', item.mediaUrl, item.caption, context, supabase);
          }
          break;

        case 'video':
          if (item.mediaUrl) {
            await sendPresence('typing', context);
            await new Promise(resolve => setTimeout(resolve, 1500));
            await sendMediaItem('video', item.mediaUrl, item.caption, context, supabase);
          }
          break;

        case 'audio':
          if (item.mediaUrl) {
            // Send RECORDING presence before audio to simulate recording
            await sendPresence('recording', context);
            await new Promise(resolve => setTimeout(resolve, 2000));
            await sendMediaItem('audio', item.mediaUrl, undefined, context, supabase);
          }
          break;

        case 'document':
          if (item.mediaUrl) {
            await sendPresence('typing', context);
            await new Promise(resolve => setTimeout(resolve, 1500));
            await sendMediaItem('document', item.mediaUrl, item.caption, context, supabase);
          }
          break;

        case 'delay':
          const delaySeconds = item.delaySeconds || 3;
          console.log(`[FLOW EXECUTE] Delay of ${delaySeconds}s with presence: ${nextPresenceType || 'none'}`);
          if (nextPresenceType) {
            await waitForDelayWithPresence(delaySeconds, nextPresenceType, context);
          } else {
            await new Promise(resolve => setTimeout(resolve, Math.min(delaySeconds * 1000, 30000)));
          }
          break;
      }

      // Small delay between items to avoid rate limiting
      if (item.type !== 'delay' && i < items.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    } catch (error) {
      console.error(`[FLOW EXECUTE] Error executing content item ${item.id}:`, error);
      return { success: false, error: `Failed to execute content item: ${error}` };
    }
  }

  // Check if this content block should wait for user response
  const waitForResponse = !!data.waitForResponse;
  if (waitForResponse) {
    console.log(`[FLOW EXECUTE] Content block configured to wait for response. Variable: ${data.saveVariable || 'none'}, Timeout: ${data.timeoutMinutes || 0}min`);
    return { success: true, waitForInput: true };
  }

  return { success: true };
}

// Helper to maintain presence during a delay
async function waitForDelayWithPresence(seconds: number, type: 'typing' | 'recording', context: ExecutionContext) {
  const totalMs = Math.min(seconds * 1000, 45000); // Cap at 45s
  const intervalMs = 8000; // Refresh every 8s
  let elapsedMs = 0;

  while (elapsedMs < totalMs) {
    const remainingMs = totalMs - elapsedMs;
    const currentWait = Math.min(remainingMs, intervalMs);

    // Send presence
    await sendPresence(type, context, currentWait);

    // Wait
    await new Promise(resolve => setTimeout(resolve, currentWait));
    elapsedMs += currentWait;
  }
}

async function sendTextMessage(content: string, context: ExecutionContext, supabase: SupabaseClientType): Promise<void> {
  const message = replaceVariables(content, context.variables);
  if (!message) return;

  const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
  const normalizedPhone = context.contactPhone.replace(/\D/g, '');

  console.log(`[FLOW EXECUTE] sendTextMessage: phone=${normalizedPhone}`);

  const response = await fetch(
    `${uazapiBaseUrl}/send/text`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': context.zapiToken
      },
      body: JSON.stringify({
        number: normalizedPhone,
        text: message,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`[FLOW EXECUTE] Failed to send text message. Status: ${response.status}, Error: ${error}`);
    throw new Error(`Failed to send text message: ${error}`);
  }

  // Parse UAZAPI response to get message ID
  let zapiMessageId: string | null = null;
  try {
    const result = await response.clone().json();
    zapiMessageId = result?.messageId || result?.id || result?.ID || result?.key?.id || null;
  } catch { /* ignore parse errors */ }

  // Save message to database so it appears in the UI immediately
  try {
    await supabase.from('messages').insert({
      conversation_id: context.conversationId,
      content: message,
      type: 'text',
      direction: 'outbound',
      is_from_bot: !!context.isFromOrchestrator,
      zapi_message_id: zapiMessageId,
      metadata: { source: 'flow_execute', is_from_orchestrator: !!context.isFromOrchestrator },
    });
    console.log('[FLOW EXECUTE] Text message saved to DB');
  } catch (dbError) {
    console.error('[FLOW EXECUTE] Failed to save text to DB:', dbError);
  }

  // Update conversation last_message_at
  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', context.conversationId);
}

async function sendMediaItem(
  mediaType: 'image' | 'video' | 'audio' | 'document',
  mediaUrl: string,
  caption: string | undefined,
  context: ExecutionContext,
  supabase: SupabaseClientType
): Promise<void> {
  const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
  const normalizedPhone = context.contactPhone.replace(/\D/g, '');
  const processedCaption = caption ? replaceVariables(caption, context.variables) : undefined;

  // UAZAPI uses unified /send/media endpoint for all media types
  const body: Record<string, unknown> = {
    number: normalizedPhone,
    file: mediaUrl,
    type: mediaType
  };

  if (processedCaption) body.caption = processedCaption;

  const endpoint = `${uazapiBaseUrl}/send/media`;
  console.log(`[FLOW EXECUTE] sendMediaItem: type=${mediaType}, file=${mediaUrl?.substring(0, 80)}`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'token': context.zapiToken
    },
    body: JSON.stringify(body),
  });

  let zapiMessageId: string | null = null;

  if (!response.ok) {
    const error = await response.text();
    console.error(`[FLOW EXECUTE] Failed to send ${mediaType}. Status: ${response.status}, Error: ${error}`);
    // Don't throw — still save to DB so user sees it was attempted
  } else {
    // Parse UAZAPI response to get message ID
    try {
      const result = await response.clone().json();
      zapiMessageId = result?.messageId || result?.id || result?.ID || result?.key?.id || null;
    } catch { /* ignore parse errors */ }
    console.log(`[FLOW EXECUTE] ${mediaType} sent successfully via UAZAPI (ID: ${zapiMessageId})`);
  }

  // Save media message to database so it appears in the UI immediately
  try {
    await supabase.from('messages').insert({
      conversation_id: context.conversationId,
      content: processedCaption || null,
      type: mediaType,
      direction: 'outbound',
      is_from_bot: !!context.isFromOrchestrator,
      media_url: mediaUrl,
      zapi_message_id: zapiMessageId,
      metadata: { source: 'flow_execute', is_from_orchestrator: !!context.isFromOrchestrator },
    });
    console.log(`[FLOW EXECUTE] ${mediaType} message saved to DB`);
  } catch (dbError) {
    console.error(`[FLOW EXECUTE] Failed to save ${mediaType} to DB:`, dbError);
  }

  // Update conversation last_message_at
  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', context.conversationId);
}

async function sendButtonsMessage(data: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> {
  try {
    const content = replaceVariables(String(data.text || data.content || ''), context.variables);
    const buttons = data.buttons as Array<{ id: string; label: string }> || [];

    if (!content || buttons.length === 0) {
      return { success: true };
    }

    // UAZAPI: send buttons as formatted text since native buttons may not be supported
    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
    const normalizedPhone = context.contactPhone.replace(/\D/g, '');
    const buttonsText = buttons.map((b, i) => `${i + 1}. ${b.label}`).join('\n');
    const fullMessage = `${content}\n\n${buttonsText}`;

    const response = await fetch(`${uazapiBaseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': context.zapiToken
      },
      body: JSON.stringify({
        number: normalizedPhone,
        text: fullMessage,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[FLOW EXECUTE] Failed to send buttons. Status: ${response.status}, Error: ${error}`);
      return { success: false, error: `Failed to send buttons: ${error}` };
    }

    // Save message to database
    try {
      let zapiMessageId: string | null = null;
      try {
        const result = await response.clone().json();
        zapiMessageId = result?.messageId || result?.id || result?.ID || result?.key?.id || null;
      } catch { }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase.from('messages').insert({
        conversation_id: context.conversationId,
        content: fullMessage,
        type: 'text',
        direction: 'outbound',
        is_from_bot: !!context.isFromOrchestrator,
        zapi_message_id: zapiMessageId,
        metadata: { source: 'flow_execute', type: 'buttons', is_from_orchestrator: !!context.isFromOrchestrator },
      });
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', context.conversationId);
    } catch (dbError) {
      console.error('[FLOW EXECUTE] Failed to save buttons message to DB:', dbError);
    }

    console.log('[FLOW EXECUTE] Buttons message sent successfully');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function sendListMessage(data: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> {
  try {
    const content = replaceVariables(String(data.content || ''), context.variables);

    // UAZAPI: send list as formatted text since native lists may not be supported
    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
    const normalizedPhone = context.contactPhone.replace(/\D/g, '');
    const sections = data.sections as Array<{ title: string; rows: Array<{ title: string; description?: string }> }> || [];

    let listText = content;
    for (const section of sections) {
      if (section.title) listText += `\n\n*${section.title}*`;
      for (const row of section.rows || []) {
        listText += `\n• ${row.title}`;
        if (row.description) listText += ` - ${row.description}`;
      }
    }

    const response = await fetch(`${uazapiBaseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': context.zapiToken
      },
      body: JSON.stringify({
        number: normalizedPhone,
        text: listText,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[FLOW EXECUTE] Failed to send list. Status: ${response.status}, Error: ${error}`);
      return { success: false, error: `Failed to send list: ${error}` };
    }

    // Save message to database
    try {
      let zapiMessageId: string | null = null;
      try {
        const result = await response.clone().json();
        zapiMessageId = result?.messageId || result?.key?.id || result?.id || null;
      } catch { }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase.from('messages').insert({
        conversation_id: context.conversationId,
        content: listText,
        type: 'text',
        direction: 'outbound',
        is_from_bot: !!context.isFromOrchestrator,
        zapi_message_id: zapiMessageId,
        metadata: { source: 'flow_execute', type: 'list', is_from_orchestrator: !!context.isFromOrchestrator },
      });
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', context.conversationId);
    } catch (dbError) {
      console.error('[FLOW EXECUTE] Failed to save list message to DB:', dbError);
    }

    console.log('[FLOW EXECUTE] List message sent successfully');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function executeDelay(data: Record<string, unknown>): Promise<NodeResult> {
  const duration = Number(data.duration) || 3;
  const unit = String(data.unit) || 'seconds';

  let ms = duration * 1000;
  if (unit === 'minutes') ms = duration * 60 * 1000;
  if (unit === 'hours') ms = duration * 60 * 60 * 1000;

  ms = Math.min(ms, 30000);

  await new Promise(resolve => setTimeout(resolve, ms));
  return { success: true };
}

async function executeTagAction(
  data: Record<string, unknown>,
  context: ExecutionContext,
  supabase: SupabaseClientType
): Promise<NodeResult> {
  try {
    const action = (data.action as string) || 'add';
    let tagId = String(data.tagId || '');
    const tagName = String(data.tagName || '');

    console.log(`[FLOW EXECUTE] executeTagAction: action=${action}, tagId=${tagId}, tagName=${tagName}, contactId=${context.contactId}`);

    if (!tagId && !tagName) {
      console.log('[FLOW EXECUTE] Tag action skipped: no tagId or tagName');
      return { success: true, metadata: { skipped: 'no_data' } };
    }

    // Resolve tagId by name if ID is missing (robust fallback)
    if (!tagId && tagName) {
      console.log(`[FLOW EXECUTE] Resolving tag by name: ${tagName}`);
      const { data: tag, error: fetchError } = await supabase
        .from('tags')
        .select('id')
        .eq('organization_id', context.organizationId)
        .eq('name', tagName)
        .maybeSingle();

      if (fetchError) {
        console.error('[FLOW EXECUTE] Tag fetch error:', fetchError);
      }

      if (tag) {
        tagId = tag.id;
        console.log(`[FLOW EXECUTE] Resolved tag ${tagName} to ${tagId}`);
      }
    }

    if (!tagId) {
      console.warn(`[FLOW EXECUTE] Could not resolve tag: ${tagName || tagId}`);
      return { success: true, metadata: { skipped: 'not_resolved', tagName } };
    }

    if (action === 'add') {
      console.log(`[FLOW EXECUTE] Attempting add tag ${tagId} for contact ${context.contactId}`);
      // Check if already exists first (avoids needing unique constraint)
      const { data: existing } = await supabase
        .from('contact_tags')
        .select('id')
        .eq('contact_id', context.contactId)
        .eq('tag_id', tagId)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase
          .from('contact_tags')
          .insert({
            contact_id: context.contactId,
            tag_id: tagId,
            added_by_type: 'flow',
          });

        if (error) {
          console.error('[FLOW EXECUTE] Tag insert error:', error);
          return { success: false, error: `Tag add failed: ${error.message}` };
        }
      }
      console.log(`[FLOW EXECUTE] Tag ${tagId} (${tagName}) added/verified for contact ${context.contactId}`);
      return { success: true, metadata: { tagId, tagName, action: 'add' } };
    }
    else if (action === 'remove') {
      const { error } = await supabase
        .from('contact_tags')
        .delete()
        .eq('contact_id', context.contactId)
        .eq('tag_id', tagId);

      if (error) {
        console.error('[FLOW EXECUTE] Tag delete error:', error);
        return { success: false, error: `Tag remove failed: ${error.message}` };
      }
      console.log(`[FLOW EXECUTE] Tag ${tagId} removed from contact ${context.contactId}`);
      return { success: true, metadata: { tagId, tagName, action: 'remove' } };
    }

    return { success: true, metadata: { action: 'none' } };
  } catch (error) {
    console.error('[FLOW EXECUTE] executeTagAction catch:', error);
    return { success: false, error: `Tag action exception: ${error}` };
  }
}

async function executePipelineAction(
  data: Record<string, unknown>,
  context: ExecutionContext,
  supabase: SupabaseClientType
): Promise<NodeResult> {
  try {
    const columnId = String(data.pipelineColumnId || '');
    const pipelineId = String(data.pipelineId || '');
    const columnName = String(data.pipelineColumnName || 'Etapa');

    if (!columnId || !pipelineId) {
      return { success: false, error: 'Pipeline ID or Column ID missing in node data' };
    }

    // 1. Update the status in conversations for legacy/display compatibility
    await supabase
      .from('conversations')
      .update({ status: 'open' }) // Ensure it's open if moved in pipeline
      .eq('id', context.conversationId);

    // 2. Update/Upsert the position in conversation_pipeline_positions (The Kanban state)
    const { data: existing } = await supabase
      .from('conversation_pipeline_positions')
      .select('id')
      .eq('conversation_id', context.conversationId)
      .eq('pipeline_id', pipelineId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('conversation_pipeline_positions')
        .update({
          column_id: columnId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('conversation_pipeline_positions')
        .insert({
          conversation_id: context.conversationId,
          pipeline_id: pipelineId,
          column_id: columnId,
          order: 0,
        });
      if (error) throw error;
    }

    return { success: true, metadata: { pipelineId, columnId, columnName } };
  } catch (error) {
    console.error('[FLOW EXECUTE] Pipeline move error:', error);
    return { success: false, error: String(error) };
  }
}

function executeCondition(data: Record<string, unknown>, context: ExecutionContext): NodeResult {
  const variable = String(data.variable || '');
  const operator = String(data.operator || 'equals');
  const compareValue = String(data.value || '');

  const actualValue = String(context.variables[variable] || '');
  let result = false;

  switch (operator) {
    case 'equals':
      result = actualValue === compareValue;
      break;
    case 'not_equals':
      result = actualValue !== compareValue;
      break;
    case 'contains':
      result = actualValue.includes(compareValue);
      break;
    case 'greater_than':
      result = Number(actualValue) > Number(compareValue);
      break;
    case 'less_than':
      result = Number(actualValue) < Number(compareValue);
      break;
  }

  return { success: true, outputHandle: result ? 'true' : 'false' };
}

async function executeWebhook(data: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> {
  try {
    const url = String(data.webhookUrl || data.url || '');
    const method = String(data.method || 'POST');

    if (!url) {
      return { success: true };
    }

    const body = {
      conversationId: context.conversationId,
      contactPhone: context.contactPhone,
      contactId: context.contactId,
      variables: context.variables,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      console.error('Webhook failed:', response.status);
    }

    try {
      const responseData = await response.json();
      if (responseData && typeof responseData === 'object') {
        return { success: true, variables: responseData };
      }
    } catch {
      // Response is not JSON
    }

    return { success: true };
  } catch (error) {
    console.error('Webhook error:', error);
    return { success: true };
  }
}

// Send presence to WhatsApp (typing or recording)
async function sendPresence(
  presenceType: 'typing' | 'recording',
  context: ExecutionContext,
  durationMs: number = 5000
): Promise<void> {
  try {
    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
    const normalizedPhone = context.contactPhone.replace(/\D/g, '');
    const presenceState = presenceType === 'typing' ? 'composing' : 'recording';

    // Try multiple UAZAPI presence endpoints (varies by server version)
    const presenceEndpoints = [
      { path: '/chat/presence', body: { phone: normalizedPhone, state: presenceState, duration: Math.floor(durationMs / 1000) } },
      { path: '/send/presence', body: { phone: normalizedPhone, presence: presenceState, duration: durationMs } },
      { path: '/send/typing', body: { number: normalizedPhone, duration: durationMs } },
      // V2 Webhook style
      { path: '/message/presence', body: { number: normalizedPhone, presence: presenceState, delay: durationMs } },
    ];

    for (const ep of presenceEndpoints) {
      try {
        const response = await fetch(`${uazapiBaseUrl}${ep.path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': context.zapiToken
          },
          body: JSON.stringify(ep.body),
        });
        if (response.ok) return; // Success, stop trying
        if (response.status === 404 || response.status === 405) continue; // Try next
        return; // Other error, stop trying
      } catch {
        continue; // Network error, try next
      }
    }
  } catch (error) {
    // Presence is optional, don't fail the flow
    console.log('Presence send failed (non-critical):', error);
  }
}

function findNextNode(currentNode: FlowNode, edges: FlowEdge[], outputHandle?: string): string | null {
  const edge = edges.find(e => {
    if (e.source !== currentNode.id) return false;
    if (outputHandle && e.sourceHandle) {
      return e.sourceHandle === outputHandle;
    }
    return true;
  });

  return edge?.target || null;
}

function replaceVariables(text: string, variables: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return String(variables[varName] || match);
  });
}
