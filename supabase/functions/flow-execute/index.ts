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
  provider: 'evolution' | 'uazapi';
  evolutionBaseUrl?: string;
  evolutionApiKey?: string;
  evolutionInstanceName?: string;
  uazapiBaseUrl?: string;
  isFromOrchestrator?: boolean;
  triggerMessage?: string;
  flowId: string;
}

// deno-lint-ignore no-explicit-any
type SupabaseClientType = any;

function normalizeBaseUrl(value?: string | null): string {
  return (value || '').trim().replace(/\/$/, '');
}

async function loadConnectionSettings(supabase: SupabaseClientType) {
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
    if (lower.includes('.m4a') || lower.includes('.mp4')) return 'audio/mp4';
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { flowId, conversationId, startNodeId, isFromOrchestrator, triggerMessage } = await req.json();
    console.log(`[FLOW EXECUTE] Received request: flowId=${flowId}, conversationId=${conversationId}, startNodeId=${startNodeId}, isFromOrchestrator=${isFromOrchestrator}, triggerMessage=${triggerMessage}`);

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

        // 3. Get WhatsApp instance, preferring the instance attached to the conversation.
        const { data: instances, error: instanceError } = await supabase
          .from('whatsapp_instances')
          .select('*')
          .eq('organization_id', flow.organization_id)
          .eq('status', 'connected')
          .order('created_at', { ascending: false });

        if (instanceError || !instances?.length) {
          console.error(`[FLOW EXECUTE] No connected instance for org ${flow.organization_id}`);
          return;
        }

        const instance = conversation.whatsapp_instance_id
          ? instances.find((item: any) => item.id === conversation.whatsapp_instance_id) || instances[0]
          : instances[0];
        const connectionSettings = await loadConnectionSettings(supabase);
        const provider = instance.provider === 'evolution' ? 'evolution' : 'uazapi';

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
          provider,
          uazapiBaseUrl: connectionSettings.uazapiBaseUrl,
          evolutionBaseUrl: connectionSettings.evolutionBaseUrl,
          evolutionApiKey: instance.evolution_api_key || connectionSettings.evolutionApiKey || instance.zapi_token || '',
          evolutionInstanceName: instance.evolution_instance_name || instance.zapi_instance_id || instance.evolution_instance_id || '',
          isFromOrchestrator: !!isFromOrchestrator,
          triggerMessage: triggerMessage,
          flowId: flowId,
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

async function cleanupFlowEnd(
  supabase: SupabaseClientType,
  conversationId: string,
  executionId: string,
  flow: any
) {
  // Check if there's a PARENT flow execution still active for this conversation
  const { data: otherActiveFlows } = await supabase
    .from('flow_executions')
    .select('id')
    .eq('conversation_id', conversationId)
    .neq('id', executionId)
    .in('status', ['running', 'waiting_input'])
    .limit(1);

  const hasParentFlow = otherActiveFlows && otherActiveFlows.length > 0;

  if (!hasParentFlow) {
    const { data: convData } = await supabase
      .from('conversations')
      .select('metadata')
      .eq('id', conversationId)
      .single();

    const cleanMetadata = { ...(convData?.metadata || {}) };
    delete cleanMetadata.ai_handoff_context;
    cleanMetadata.flow_ended_at = new Date().toISOString();

    await supabase
      .from('conversations')
      .update({
        service_mode: 'humano',
        ai_agent_id: null,
        metadata: cleanMetadata,
      })
      .eq('id', conversationId);

    console.log(`[FLOW EXECUTE] Flow ended — reset service_mode to humano, cleared ai_agent_id`);
  } else {
    const parentExec = otherActiveFlows[0];
    console.log(`[FLOW EXECUTE] Sub-flow ended — parent flow ${parentExec.id} still active. RESUMING parent.`);
    
    // Resume parent flow automatically
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // We fetch without waiting to avoid circular dependency/timeout lag
    fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ 
        conversationId, 
        resumeExecutionId: parentExec.id 
      }),
    }).catch(err => console.error('[FLOW EXECUTE] Error resuming parent flow:', err));
  }

  await supabase
    .from('flows')
    .update({ triggers_count: (flow.triggers_count || 0) + 1 })
    .eq('id', flow.id);
}

async function runFlowExecution(
  executionId: string,
  flow: any,
  nodes: FlowNode[],
  edges: FlowEdge[],
  context: ExecutionContext,
  supabase: SupabaseClientType
) {
  const conversationId = context.conversationId;
  let currentNodeId: string | null = (await supabase.from('flow_executions').select('current_node_id').eq('id', executionId).single()).data?.current_node_id || nodes.find(n => n.type === 'start')?.id || null;
  const executionLog: Array<{ nodeId: string; type: string; result: string; timestamp: string; metadata?: any }> = [];

  while (currentNodeId) {
    const currentNode = nodes.find(n => n.id === currentNodeId);
    if (!currentNode) {
      console.log(`[FLOW EXECUTE] Node ${currentNodeId} not found — STOPPING flow`);
      break;
    }

    try {
      const result = await executeNode(currentNode, context, supabase, flow, executionId);
      executionLog.push({
        nodeId: currentNode.id,
        type: currentNode.type,
        result: result.success ? 'success' : 'failed',
        metadata: result.metadata,
        timestamp: new Date().toISOString(),
      });

      if (!result.success) {
        console.log(`[FLOW EXECUTE] Node ${currentNode.id} FAILED — stopping flow and cleaning up`);
        await supabase
          .from('flow_executions')
          .update({
            status: 'failed',
            error_message: result.error,
            execution_log: executionLog,
            completed_at: new Date().toISOString(),
          })
          .eq('id', executionId);

        // CRITICAL: Also cleanup on failure
        await cleanupFlowEnd(supabase, conversationId, executionId, flow);
        return;
      }

      if (result.waitForInput) {
        const updateData: Record<string, unknown> = {
          status: 'waiting_input',
          current_node_id: currentNode.id,
          variables: context.variables,
          execution_log: executionLog,
          remarketing_step: 0,
        };

        // Check if this node has ANY outgoing edge — if NOT, the flow ends here
        const hasAnyOutgoingEdge = edges.some(e => e.source === currentNode.id);
        if (!hasAnyOutgoingEdge) {
          console.log(`[FLOW EXECUTE] Node ${currentNode.id} (${currentNode.type}) has NO outgoing edge — flow STOPS here`);
          await supabase
            .from('flow_executions')
            .update({
              status: 'completed',
              execution_log: executionLog,
              variables: context.variables,
              completed_at: new Date().toISOString(),
            })
            .eq('id', executionId);
          await cleanupFlowEnd(supabase, conversationId, executionId, flow);
          return;
        }

        // Check ANY node type for remarketingSteps (content-block, action-flow, etc.)
        const remarketingSteps = (currentNode.data?.remarketingSteps || []) as Array<{ delayMinutes: number; message: string }>;
        if (remarketingSteps.length > 0) {
          const firstStep = remarketingSteps[0];
          const delayMs = (firstStep.delayMinutes || 1) * 60 * 1000;
          updateData.timeout_at = new Date(Date.now() + delayMs).toISOString();
          console.log(`[FLOW EXECUTE] Node ${currentNode.type}: scheduling first follow-up in ${firstStep.delayMinutes}min (${remarketingSteps.length} total steps)`);
        } else {
          const timeoutMinutes = Number(currentNode.data?.timeoutMinutes || 0);
          if (timeoutMinutes > 0) {
            updateData.timeout_at = new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString();
          } else if (currentNode.type === 'action-flow') {
            updateData.timeout_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          }
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

      // CORE FLOW LOGIC: Find next node via EDGE connection
      const nextNodeId = findNextNode(currentNode, edges, result.outputHandle);
      
      if (!nextNodeId) {
        console.log(`[FLOW EXECUTE] Node ${currentNode.id} (${currentNode.type}) has NO connected next node — flow STOPS`);
        currentNodeId = null;
        break;
      }

      currentNodeId = nextNodeId;

      await supabase
        .from('flow_executions')
        .update({
          execution_log: executionLog,
          current_node_id: currentNodeId,
          variables: context.variables,
        })
        .eq('id', executionId);

      if (currentNodeId && (currentNode.type.startsWith('message-') || currentNode.type === 'content-block' || currentNode.type === 'action-delay')) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`[FLOW EXECUTE] Error executing node ${currentNode.id}:`, error);
      executionLog.push({
        nodeId: currentNode.id,
        type: currentNode.type,
        result: 'error',
        timestamp: new Date().toISOString(),
      });
      break;
    }
  }

  // Flow ended (either no more nodes, error, or no edge)
  await supabase
    .from('flow_executions')
    .update({
      status: 'completed',
      execution_log: executionLog,
      variables: context.variables,
      completed_at: new Date().toISOString(),
    })
    .eq('id', executionId);

  await cleanupFlowEnd(supabase, conversationId, executionId, flow);
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
  flow?: any,
  executionId?: string
): Promise<NodeResult> {
  const { type, data } = node;

  // Log node entry for timeline visibility
  await logNodeExecution(supabase, context, node, executionId);

  switch (type) {
    case 'start':
      return { success: true };

    case 'content-block':
      return await executeContentBlock(data, context, supabase, node);

    case 'message-buttons':
      return await sendButtonsMessage(data, context, node.id);

    case 'message-list':
      return await sendListMessage(data, context, node.id);

    case 'action-delay':
      return await executeDelay(data);

    case 'action-tag':
      return await executeTagAction(data, context, supabase);

    case 'action-pipeline':
      return await executePipelineAction(data, context, supabase);

    case 'condition':
      return await executeCondition(data, context, supabase);

    case 'user-input':
      return { success: true, waitForInput: true };

    case 'action-webhook':
      return await executeWebhook(data, context);

    case 'ai-handoff':
      return await executeAIHandoff(data, context, supabase, flow, executionId);

    case 'ai-return':
      return { success: true };

    case 'action-flow':
      return await executeSubFlow(data, context, supabase);

    case 'action-document':
      return await executeDocumentAction(data, context, supabase, flow);

    case 'action-transfer':
    case 'orch-human':
      return await executeTransfer(data, context, supabase);

    case 'action-workspace':
      return await executeWorkspaceAssignment(data, context, supabase);

    default:
      console.log(`Unknown node type: ${type}`);
      return { success: true };
  }
}

async function executeWorkspaceAssignment(
  data: Record<string, unknown>,
  context: ExecutionContext,
  supabase: SupabaseClientType
): Promise<NodeResult> {
  const workspaceId = String(data.workspaceId || '');
  if (!workspaceId) {
    console.log('[FLOW EXECUTE] action-workspace: no workspaceId configured');
    return { success: true, metadata: { skipped: 'no_workspace_id' } };
  }

  try {
    // Update contact workspace
    await supabase.from('contacts').update({ workspace_id: workspaceId }).eq('id', context.contactId);
    // Update conversation workspace
    await supabase.from('conversations').update({ workspace_id: workspaceId }).eq('id', context.conversationId);
    console.log(`[FLOW EXECUTE] Assigned workspace ${workspaceId} to contact ${context.contactId} and conversation ${context.conversationId}`);
    return { success: true, metadata: { workspaceId } };
  } catch (error) {
    console.error('[FLOW EXECUTE] Workspace assignment error:', error);
    return { success: false, error: String(error) };
  }
}

async function executeAIHandoff(
  data: Record<string, unknown>,
  context: ExecutionContext,
  supabase: SupabaseClientType,
  flow?: any,
  executionId?: string
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
    const autoAdvance = data.autoAdvance !== false; // default true
    if (expectedOutcomes) {
      promptParts.push(`---\nRESULTADOS ESPERADOS: ${expectedOutcomes}`);
      promptParts.push(`Ao finalizar a interação, use finalizar_interacao(resultado) com um dos seguintes resultados: ${outcomes.join(', ')}. Se nenhum se aplicar, use "default".`);
      if (autoAdvance) {
        promptParts.push(`REGRA OBRIGATÓRIA: Quando concluir sua tarefa, chame send_reply com sua mensagem final E finalizar_interacao NA MESMA RODADA. NÃO espere o cliente confirmar, dizer "ok" ou responder. O fluxo deve avançar automaticamente assim que você terminar.`);
      } else {
        promptParts.push(`Após concluir sua tarefa, envie sua mensagem final com send_reply. O fluxo só avançará quando o cliente enviar uma nova mensagem.`);
      }
    }
    flowContext.autoAdvance = autoAdvance;
    
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
    
    // 4. NEW: If we have a triggerMessage (from subflow resumption), invoke orchestrator IMMEDIATELY
    if (context.triggerMessage) {
      console.log(`[FLOW EXECUTE] AI Handoff: triggerMessage detected ("${context.triggerMessage}"), invoking orchestrator now.`);
      
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      try {
        const orchestratorBody: Record<string, unknown> = {
          conversationId: context.conversationId,
          messageContent: context.triggerMessage,
          flowExecutionId: executionId,
          agentIdOverride: agentId, // CRITICAL: Pass the specific agent to avoid database lag issues
          forceResponse: true, // NEW: Tell orchestrator to ignore bot-last-speaker check
        };

        if (flowContext.additionalContext) {
          orchestratorBody.additionalContext = flowContext.additionalContext;
        }

        // Call agent-orchestrator (background)
        const orchestratorPromise = fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${serviceRoleKey}` 
          },
          body: JSON.stringify(orchestratorBody),
        })
          .then(res => res.text())
          .then(text => console.log(`[FLOW EXECUTE] Orchestrator background trigger response:`, text))
          .catch(err => console.error('[FLOW EXECUTE] Error invoking orchestrator in handoff:', err));
        
        // Prevent Deno Deploy from killing the background fetch
        if (typeof (globalThis as any).EdgeRuntime !== 'undefined' && (globalThis as any).EdgeRuntime.waitUntil) {
          (globalThis as any).EdgeRuntime.waitUntil(orchestratorPromise);
        }

        console.log(`[FLOW EXECUTE] AI Handoff: orchestrator invoked successfully in background`);
      } catch (e) {
        console.error('[FLOW EXECUTE] Critical error preparing orchestrator call:', e);
      }
    }

    // 5. Return waitForInput — the flow PAUSES here.
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
  const waitForResponse = Boolean(data.waitForResponse);
  const remarketingSteps = (data.remarketingSteps || []) as Array<{ delayMinutes: number; message: string }>;

  if (!flowId) {
    console.log('[FLOW EXECUTE] action-flow: no flowId configured');
    return { success: true, metadata: { skipped: 'no_flow_id' } };
  }

  console.log(`[FLOW EXECUTE] Triggering sub-flow: ${flowId} (${flowName}), waitForResponse=${waitForResponse}, remarketingSteps=${remarketingSteps.length}`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Trigger the sub-flow
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
        triggerMessage: context.triggerMessage, // Propagate the message that resumed the parent flow
      }),
    });

    const result = await response.json();
    console.log(`[FLOW EXECUTE] Sub-flow ${flowId} triggered:`, result.success ? 'success' : 'failed');

    // Wait for sub-flow to start processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // If waitForResponse is enabled OR there are remarketing steps, pause and wait
    if (waitForResponse || remarketingSteps.length > 0) {
      console.log(`[FLOW EXECUTE] action-flow with waitForResponse/remarketing — pausing parent flow`);
      return { 
        success: true, 
        waitForInput: true,
        metadata: { flowId, flowName, triggered: true, waitingForResponse: true, remarketingSteps: remarketingSteps.length } 
      };
    }

    return { success: true, metadata: { flowId, flowName, triggered: true } };
  } catch (error) {
    console.error(`[FLOW EXECUTE] Sub-flow trigger error:`, error);
    return { success: false, error: `Sub-flow trigger failed: ${error}` };
  }
}

// Execute document generation action
async function executeDocumentAction(
  data: Record<string, unknown>,
  context: ExecutionContext,
  supabase: SupabaseClientType,
  flow?: any
): Promise<NodeResult> {
  const documentMode = String(data.documentMode || 'ai_agent');
  const documentSource = String(data.documentSource || 'template');
  const templateId = String(data.templateId || '');
  const templateName = String(data.templateName || '');
  const packId = String(data.packId || '');
  const packName = String(data.packName || '');

  console.log(`[FLOW EXECUTE] action-document: mode=${documentMode}, source=${documentSource}, templateId=${templateId}, packId=${packId}`);

  if (documentSource === 'template' && !templateId) {
    console.log('[FLOW EXECUTE] action-document: no templateId configured');
    return { success: true, metadata: { skipped: 'no_template_id' } };
  }
  if (documentSource === 'pack' && !packId) {
    console.log('[FLOW EXECUTE] action-document: no packId configured');
    return { success: true, metadata: { skipped: 'no_pack_id' } };
  }

  try {
    if (documentMode === 'public_link') {
      // === PUBLIC LINK MODE ===
      // Build the public form URL and send it via WhatsApp
      const appUrl = 'https://wizzyai.lovable.app';
      let formUrl = '';

      if (documentSource === 'pack') {
        // Get pack's public_token
        const { data: pack } = await supabase
          .from('document_packs')
          .select('public_token')
          .eq('id', packId)
          .single();

        if (!pack?.public_token) {
          console.error('[FLOW EXECUTE] Pack has no public_token');
          return { success: false, error: 'Pack não possui token público configurado' };
        }
        formUrl = `${appUrl}/pack-form?token=${pack.public_token}`;
      } else {
        formUrl = `${appUrl}/form?id=${templateId}`;
      }

      // Build message with link
      const publicLinkMessage = String(data.publicLinkMessage || '');
      let message = '';
      if (publicLinkMessage) {
        message = publicLinkMessage.replace(/\{\{link\}\}/g, formUrl);
      } else {
        const docName = documentSource === 'pack' ? packName : templateName;
        message = `📋 Por favor, preencha o formulário para o documento "${docName}":\n\n${formUrl}`;
      }

      // Replace flow variables in message
      message = replaceVariables(message, context.variables);

      // Send via WhatsApp
      await sendPresence('typing', context);
      await new Promise(resolve => setTimeout(resolve, 1500));
      await sendTextMessage(message, context, supabase);

      console.log(`[FLOW EXECUTE] action-document: public link sent: ${formUrl}`);
      return { success: true, metadata: { mode: 'public_link', formUrl, documentSource } };

    } else {
      // === AI AGENT MODE ===
      // Similar to ai-handoff: set agent, store document context, wait for input
      const agentId = String(data.documentAgentId || '');
      const additionalInstructions = String(data.additionalInstructions || '');
      const requireConfirmation = data.requireConfirmation !== false;
      const sendPdfInChat = data.sendPdfInChat !== false;

      // Set agent on conversation
      const updateData: Record<string, unknown> = { service_mode: 'ia' };
      if (agentId) updateData.ai_agent_id = agentId;
      await supabase.from('conversations').update(updateData).eq('id', context.conversationId);

      // Get template/pack details for the AI context
      let templateContent = '';
      let templateFields: any[] = [];
      let docNames: string[] = [];

      if (documentSource === 'pack') {
        const { data: pack } = await supabase
          .from('document_packs')
          .select('*, field_config')
          .eq('id', packId)
          .single();
        if (pack) {
          docNames = [pack.name];
          templateFields = pack.field_config ? (Array.isArray(pack.field_config) ? pack.field_config : []) : [];
          // Get all templates in the pack for field info
          if (pack.template_ids?.length) {
            const { data: templates } = await supabase
              .from('document_templates')
              .select('name, fields')
              .in('id', pack.template_ids);
            if (templates) {
              docNames = templates.map((t: any) => t.name);
              if (templateFields.length === 0) {
                // Merge fields from all templates
                const fieldSet = new Set<string>();
                templates.forEach((t: any) => {
                  const f = t.fields || [];
                  if (Array.isArray(f)) f.forEach((field: any) => {
                    const key = typeof field === 'string' ? field : field.name || field.key;
                    if (key) fieldSet.add(key);
                  });
                });
                templateFields = Array.from(fieldSet).map(name => ({ name, label: name }));
              }
            }
          }
        }
      } else {
        const { data: template } = await supabase
          .from('document_templates')
          .select('name, content, content_html, logo_url, fields')
          .eq('id', templateId)
          .single();
        if (template) {
          docNames = [template.name];
          templateContent = template.content || '';
          templateFields = template.fields ? (Array.isArray(template.fields) ? template.fields : []) : [];
        }
      }

      // Build AI context with document collection instructions
      const fieldNames = templateFields.map((f: any) => typeof f === 'string' ? f : f.label || f.name || f.key).filter(Boolean);
      const promptParts: string[] = [];

      if (flow?.master_prompt?.trim()) {
        promptParts.push(flow.master_prompt);
      }

      promptParts.push(`---\nTAREFA: COLETA DE DADOS PARA DOCUMENTO`);
      promptParts.push(`Você precisa coletar os seguintes dados do contato para gerar o(s) documento(s): ${docNames.join(', ')}`);
      
      if (fieldNames.length > 0) {
        promptParts.push(`\nCampos necessários:\n${fieldNames.map((f: string) => `- ${f}`).join('\n')}`);
      }

      // Include already-collected variables from previous nodes
      const collectedVars = Object.entries(context.variables).filter(([_, v]) => v != null && v !== '');
      if (collectedVars.length > 0) {
        const varSummary = collectedVars.map(([k, v]) => `- ${k}: ${v}`).join('\n');
        promptParts.push(`\nDADOS JÁ COLETADOS EM ETAPAS ANTERIORES:\n${varSummary}\n\nUse estes dados como pré-preenchimento. Confirme com o contato se estão corretos antes de prosseguir.`);
      }

      promptParts.push(`\nInstruções:\n- Pergunte os dados que faltam de forma natural e conversacional\n- Pré-preencha dados que já conhece do contato (nome, telefone, etc.)\n- Valide os dados fornecidos (CPF, datas, etc.)`);


      if (requireConfirmation) {
        promptParts.push(`- Antes de gerar o documento, apresente um resumo dos dados e peça confirmação`);
      }

      promptParts.push(`- Quando todos os campos estiverem preenchidos${requireConfirmation ? ' e confirmados' : ''}, use finalizar_interacao(dados_coletados) passando um JSON com os dados`);

      if (additionalInstructions) {
        promptParts.push(`\nINSTRUÇÕES ADICIONAIS:\n${additionalInstructions}`);
      }

      // Store document context in metadata
      const { data: convData } = await supabase
        .from('conversations').select('metadata').eq('id', context.conversationId).single();
      
      const metadata = {
        ...(convData?.metadata || {}),
        ai_handoff_context: {
          additionalContext: promptParts.join('\n\n'),
          agentId: agentId || undefined,
          documentAction: {
            source: documentSource,
            templateId: documentSource === 'template' ? templateId : undefined,
            packId: documentSource === 'pack' ? packId : undefined,
            sendPdfInChat,
            signingMethod: String(data.signingMethod || 'manual'),
            sendSignatureLink: data.sendSignatureLink !== false,
            sendInternalNote: data.sendInternalNote !== false,
            internalNoteTemplate: String(data.internalNoteTemplate || ''),
            movePipelineAfter: !!data.movePipelineAfter,
            docPipelineId: String(data.docPipelineId || ''),
            docPipelineColumnId: String(data.docPipelineColumnId || ''),
          },
        },
      };

      await supabase.from('conversations').update({ metadata }).eq('id', context.conversationId);

      console.log(`[FLOW EXECUTE] action-document AI mode: agent=${agentId || 'default'}, fields=${fieldNames.length}, waiting for input`);
      return { 
        success: true, 
        waitForInput: true,
        metadata: { mode: 'ai_agent', agentId, documentSource, fieldsCount: fieldNames.length },
      };
    }
  } catch (error) {
    console.error('[FLOW EXECUTE] action-document error:', error);
    return { success: false, error: String(error) };
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
    const assignedUserId = String(data.assignedUserId || '');
    const notifyUserIds = Array.isArray(data.notifyUserIds) ? (data.notifyUserIds as string[]) : [];
    const notifyMessageTemplate = String(data.notifyMessage || '').trim();

    // 1) Update conversation: switch to human mode and apply assignment/department
    const updateData: Record<string, unknown> = { service_mode: 'humano' };
    if (departmentId) updateData.department_id = departmentId;
    if (assignedUserId) updateData.assigned_to = assignedUserId;

    await supabase.from('conversations').update(updateData).eq('id', context.conversationId);
    console.log('[FLOW EXECUTE] Transferred to human', { assignedUserId, departmentId, notifyCount: notifyUserIds.length });

    // 2) Send WhatsApp notifications to selected users (best-effort, non-blocking failures)
    if (notifyUserIds.length > 0) {
      try {
        await notifyHumanEscalation({
          supabase,
          context,
          notifyUserIds,
          assignedUserId,
          messageTemplate: notifyMessageTemplate,
        });
      } catch (notifyError) {
        console.error('[FLOW EXECUTE] Notification error (non-fatal):', notifyError);
      }
    }

    return { success: true, metadata: { transferred: true, departmentId, assignedUserId, notifiedUsers: notifyUserIds.length } };
  } catch (error) {
    console.error('[FLOW EXECUTE] Transfer error:', error);
    return { success: false, error: String(error) };
  }
}

// Send WhatsApp notifications to selected internal users about a human escalation
async function notifyHumanEscalation({
  supabase,
  context,
  notifyUserIds,
  assignedUserId,
  messageTemplate,
}: {
  supabase: SupabaseClientType;
  context: ExecutionContext;
  notifyUserIds: string[];
  assignedUserId: string;
  messageTemplate: string;
}): Promise<void> {
  // Resolve contact info
  const { data: contact } = await supabase
    .from('contacts')
    .select('name, phone')
    .eq('id', context.contactId)
    .maybeSingle();

  const contactName = contact?.name || contact?.phone || context.contactPhone || 'Contato';
  const contactPhone = contact?.phone || context.contactPhone || '';

  // Resolve assignee name (if any)
  let assigneeName = 'Fila';
  if (assignedUserId) {
    const { data: assigneeProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', assignedUserId)
      .maybeSingle();
    if (assigneeProfile?.full_name) assigneeName = assigneeProfile.full_name;
  }

  // Resolve recipient profiles (need phone numbers)
  const { data: recipients } = await supabase
    .from('profiles')
    .select('user_id, full_name, phone')
    .in('user_id', notifyUserIds);

  const validRecipients = (recipients || []).filter((p: { phone: string | null }) => !!p.phone);
  if (validRecipients.length === 0) {
    console.log('[FLOW EXECUTE] No recipients with phone for notification');
    return;
  }

  // Get active WhatsApp instance for this org
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('zapi_token, name')
    .eq('organization_id', context.organizationId)
    .eq('is_active', true)
    .maybeSingle();

  if (!instance?.zapi_token) {
    console.log('[FLOW EXECUTE] No active WhatsApp instance for notifications');
    return;
  }

  const uazapiBase = (Deno.env.get('UAZAPI_BASE_URL') || '').replace(/\/$/, '');
  if (!uazapiBase) {
    console.log('[FLOW EXECUTE] UAZAPI_BASE_URL not configured');
    return;
  }

  const defaultTemplate = '🔔 Novo lead aguardando atendimento humano\n\n👤 *{nome}*\n📱 {telefone}\n👨‍💼 Atendente: {atendente}';
  const template = messageTemplate || defaultTemplate;
  const message = template
    .replaceAll('{nome}', contactName)
    .replaceAll('{telefone}', contactPhone)
    .replaceAll('{atendente}', assigneeName);

  for (const recipient of validRecipients) {
    const normalized = String(recipient.phone || '').replace(/\D/g, '');
    if (!normalized) continue;
    try {
      const res = await fetch(`${uazapiBase}/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: instance.zapi_token },
        body: JSON.stringify({ number: normalized, text: message }),
      });
      console.log('[FLOW EXECUTE] Notification sent to', recipient.full_name, '->', res.status);
    } catch (err) {
      console.error('[FLOW EXECUTE] Notification send failed for', recipient.full_name, err);
    }
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
            await sendTextMessage(item.content, context, supabase, node?.id);
          }
          break;

        case 'image':
          if (item.mediaUrl) {
            await sendPresence('typing', context);
            await new Promise(resolve => setTimeout(resolve, 1500));
            await sendMediaItem('image', item.mediaUrl, item.caption, context, supabase, node?.id);
          }
          break;

        case 'video':
          if (item.mediaUrl) {
            await sendPresence('typing', context);
            await new Promise(resolve => setTimeout(resolve, 1500));
            await sendMediaItem('video', item.mediaUrl, item.caption, context, supabase, node?.id);
          }
          break;

        case 'audio':
          if (item.mediaUrl) {
            // Send RECORDING presence before audio to simulate recording
            await sendPresence('recording', context);
            await new Promise(resolve => setTimeout(resolve, 2000));
            await sendMediaItem('audio', item.mediaUrl, undefined, context, supabase, node?.id);
          }
          break;

        case 'document':
          if (item.mediaUrl) {
            await sendPresence('typing', context);
            await new Promise(resolve => setTimeout(resolve, 1500));
            await sendMediaItem('document', item.mediaUrl, item.caption, context, supabase, node?.id);
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

async function sendTextMessage(content: string, context: ExecutionContext, supabase: SupabaseClientType, nodeId?: string): Promise<void> {
  const message = replaceVariables(content, context.variables);
  if (!message) return;

  const normalizedPhone = context.contactPhone.replace(/\D/g, '');

  console.log(`[FLOW EXECUTE] sendTextMessage: provider=${context.provider}, phone=${normalizedPhone}`);

  let response: Response;
  if (context.provider === 'evolution') {
    if (!context.evolutionBaseUrl || !context.evolutionApiKey || !context.evolutionInstanceName) {
      throw new Error('Evolution API not configured for flow execution');
    }
    response = await fetch(`${context.evolutionBaseUrl}/message/sendText/${context.evolutionInstanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': context.evolutionApiKey,
      },
      body: JSON.stringify({
        number: normalizedPhone,
        text: message,
        delay: 1000,
        linkPreview: true,
      }),
    });
  } else {
    if (!context.uazapiBaseUrl || !context.zapiToken) {
      throw new Error('UAZAPI not configured for flow execution');
    }
    response = await fetch(`${context.uazapiBaseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': context.zapiToken
      },
      body: JSON.stringify({
        number: normalizedPhone,
        text: message,
      }),
    });
  }

  if (!response.ok) {
    const error = await response.text();
    console.error(`[FLOW EXECUTE] Failed to send text message. Status: ${response.status}, Error: ${error}`);
    throw new Error(`Failed to send text message: ${error}`);
  }

  const zapiMessageId = await parseProviderMessageId(response);

  // Save message to database so it appears in the UI immediately
  try {
    await supabase.from('messages').insert({
      conversation_id: context.conversationId,
      content: message,
      type: 'text',
      direction: 'outbound',
      is_from_bot: !!context.isFromOrchestrator,
      zapi_message_id: zapiMessageId,
      metadata: { 
        source: 'flow_execute', 
        provider: context.provider,
        is_from_orchestrator: !!context.isFromOrchestrator,
        node_id: nodeId,
        flow_id: context.flowId
      },
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
  supabase: SupabaseClientType,
  nodeId?: string
): Promise<void> {
  const normalizedPhone = context.contactPhone.replace(/\D/g, '');
  const processedCaption = caption ? replaceVariables(caption, context.variables) : undefined;

  console.log(`[FLOW EXECUTE] sendMediaItem: provider=${context.provider}, type=${mediaType}, file=${mediaUrl?.substring(0, 80)}`);

  let response: Response;
  if (context.provider === 'evolution') {
    if (!context.evolutionBaseUrl || !context.evolutionApiKey || !context.evolutionInstanceName) {
      throw new Error('Evolution API not configured for flow execution');
    }
    const body: Record<string, unknown> = {
      number: normalizedPhone,
      mediatype: mediaType,
      mimetype: guessMimeType(mediaType, mediaUrl),
      caption: mediaType === 'audio' ? undefined : processedCaption,
      media: mediaUrl,
      fileName: fileNameFromUrl(mediaUrl, `${mediaType}-${Date.now()}`),
      delay: 1000,
      linkPreview: true,
    };
    if (mediaType === 'audio') {
      body.ptt = true;
      body.voice = true;
    }
    response = await fetch(`${context.evolutionBaseUrl}/message/sendMedia/${context.evolutionInstanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': context.evolutionApiKey,
      },
      body: JSON.stringify(body),
    });
  } else {
    if (!context.uazapiBaseUrl || !context.zapiToken) {
      throw new Error('UAZAPI not configured for flow execution');
    }
    const body: Record<string, unknown> = {
      number: normalizedPhone,
      file: mediaUrl,
      type: mediaType,
      mimetype: guessMimeType(mediaType, mediaUrl),
      mimeType: guessMimeType(mediaType, mediaUrl),
      fileName: fileNameFromUrl(mediaUrl, `${mediaType}-${Date.now()}`),
    };
    if (processedCaption) body.caption = processedCaption;
    if (mediaType === 'audio') body.ptt = true;

    response = await fetch(`${context.uazapiBaseUrl}/send/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': context.zapiToken
      },
      body: JSON.stringify(body),
    });
  }

  let zapiMessageId: string | null = null;

  if (!response.ok) {
    const error = await response.text();
    console.error(`[FLOW EXECUTE] Failed to send ${mediaType}. Status: ${response.status}, Error: ${error}`);
    // Don't throw — still save to DB so user sees it was attempted
  } else {
    zapiMessageId = await parseProviderMessageId(response);
    console.log(`[FLOW EXECUTE] ${mediaType} sent successfully via ${context.provider} (ID: ${zapiMessageId})`);
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
      metadata: { 
        source: 'flow_execute', 
        provider: context.provider,
        type: mediaType, 
        is_from_orchestrator: !!context.isFromOrchestrator,
        node_id: nodeId,
        flow_id: context.flowId
      },
    });
    console.log(`[FLOW EXECUTE] ${mediaType} message saved to DB`);
  } catch (dbError) {
    console.error(`[FLOW EXECUTE] Failed to save ${mediaType} to DB:`, dbError);
  }

  // Update conversation last_message_at
  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', context.conversationId);
}

async function sendButtonsMessage(data: Record<string, unknown>, context: ExecutionContext, nodeId?: string): Promise<NodeResult> {
  try {
    const content = replaceVariables(String(data.text || data.content || ''), context.variables);
    const buttons = data.buttons as Array<{ id: string; label: string }> || [];

    if (!content || buttons.length === 0) {
      return { success: true };
    }

    const normalizedPhone = context.contactPhone.replace(/\D/g, '');
    
    // Build fallback text (always included in body for devices that don't render buttons)
    const buttonsText = buttons.map((b, i) => `${i + 1}. ${b.label}`).join('\n');
    const fallbackMessage = `${content}\n\n${buttonsText}`;

    if (context.provider === 'evolution') {
      await sendTextMessage(fallbackMessage, context, createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), nodeId);
      return { success: true, waitForInput: true };
    }

    if (!context.uazapiBaseUrl) {
      return { success: false, error: 'UAZAPI not configured for native buttons' };
    }

    let response: Response;
    let sentNativeButtons = false;
    let displayMessage = fallbackMessage;

    // Try native Z-API buttons first (up to 3 buttons supported)
    if (buttons.length <= 3) {
      try {
        const nativeBody = {
          number: normalizedPhone,
          title: '',
          message: content,
          footer: '',
          buttons: buttons.map((b, i) => ({
            id: `btn_${i}`,
            label: b.label,
          })),
        };

        console.log(`[FLOW EXECUTE] Trying native buttons via /send/buttons: ${JSON.stringify(nativeBody)}`);
        
        const nativeResponse = await fetch(`${context.uazapiBaseUrl}/send/buttons`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': context.zapiToken,
          },
          body: JSON.stringify(nativeBody),
        });

        if (nativeResponse.ok) {
          const nativeResult = await nativeResponse.json();
          // Check if the API actually accepted the request (some instances return 200 but with error in body)
          if (!nativeResult?.error) {
            response = nativeResponse;
            sentNativeButtons = true;
            displayMessage = content; // Native buttons show the content separately
            console.log(`[FLOW EXECUTE] Native buttons sent successfully`);
          } else {
            console.log(`[FLOW EXECUTE] Native buttons API returned error: ${JSON.stringify(nativeResult)}, falling back to text`);
            response = await fetch(`${context.uazapiBaseUrl}/send/text`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'token': context.zapiToken },
              body: JSON.stringify({ number: normalizedPhone, text: fallbackMessage }),
            });
          }
        } else {
          const errText = await nativeResponse.text();
          console.log(`[FLOW EXECUTE] Native buttons failed (${nativeResponse.status}): ${errText}, falling back to text`);
          response = await fetch(`${context.uazapiBaseUrl}/send/text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'token': context.zapiToken },
            body: JSON.stringify({ number: normalizedPhone, text: fallbackMessage }),
          });
        }
      } catch (nativeErr) {
        console.log(`[FLOW EXECUTE] Native buttons exception: ${nativeErr}, falling back to text`);
        response = await fetch(`${context.uazapiBaseUrl}/send/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'token': context.zapiToken },
          body: JSON.stringify({ number: normalizedPhone, text: fallbackMessage }),
        });
      }
    } else {
      // More than 3 buttons — always use text fallback
      console.log(`[FLOW EXECUTE] ${buttons.length} buttons > 3, using text fallback`);
      response = await fetch(`${context.uazapiBaseUrl}/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': context.zapiToken },
        body: JSON.stringify({ number: normalizedPhone, text: fallbackMessage }),
      });
    }

    if (!response!.ok) {
      const error = await response!.text();
      console.error(`[FLOW EXECUTE] Failed to send buttons. Status: ${response!.status}, Error: ${error}`);
      return { success: false, error: `Failed to send buttons: ${error}` };
    }

    // Save message to database
    try {
      let zapiMessageId: string | null = null;
      try {
        const result = await response!.clone().json();
        zapiMessageId = result?.messageId || result?.id || result?.ID || result?.key?.id || null;
      } catch { }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase.from('messages').insert({
        conversation_id: context.conversationId,
        content: sentNativeButtons ? content : fallbackMessage,
        type: 'text',
        direction: 'outbound',
        is_from_bot: !!context.isFromOrchestrator,
        zapi_message_id: zapiMessageId,
        metadata: { 
          source: 'flow_execute', 
          provider: context.provider,
          type: 'buttons',
          native_buttons: sentNativeButtons,
          buttons: buttons.map(b => b.label),
          is_from_orchestrator: !!context.isFromOrchestrator,
          node_id: nodeId,
          flow_id: context.flowId
        },
      });
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', context.conversationId);
    } catch (dbError) {
      console.error('[FLOW EXECUTE] Failed to save buttons message to DB:', dbError);
    }

    console.log(`[FLOW EXECUTE] Buttons message sent (native=${sentNativeButtons}) — waiting for user choice`);
    return { success: true, waitForInput: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function sendListMessage(data: Record<string, unknown>, context: ExecutionContext, nodeId?: string): Promise<NodeResult> {
  try {
    const content = replaceVariables(String(data.content || ''), context.variables);

    // Lists are sent as formatted text for both providers.
    const sections = data.sections as Array<{ title: string; rows: Array<{ title: string; description?: string }> }> || [];

    let listText = content;
    for (const section of sections) {
      if (section.title) listText += `\n\n*${section.title}*`;
      for (const row of section.rows || []) {
        listText += `\n• ${row.title}`;
        if (row.description) listText += ` - ${row.description}`;
      }
    }

    const supabaseUrlForList = Deno.env.get('SUPABASE_URL')!;
    const supabaseKeyForList = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseForList = createClient(supabaseUrlForList, supabaseKeyForList);
    await sendTextMessage(listText, context, supabaseForList, nodeId);

    console.log('[FLOW EXECUTE] List message sent as text - waiting for user choice');
    return { success: true, waitForInput: true };

    /*
    const normalizedPhone = context.contactPhone.replace(/\D/g, '');
    const response = await fetch(`${context.uazapiBaseUrl}/send/text`, {
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
        metadata: { 
          source: 'flow_execute', 
          type: 'list', 
          is_from_orchestrator: !!context.isFromOrchestrator,
          node_id: nodeId,
          flow_id: context.flowId
        },
      });
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', context.conversationId);
    } catch (dbError) {
      console.error('[FLOW EXECUTE] Failed to save list message to DB:', dbError);
    }

    console.log('[FLOW EXECUTE] List message sent — waiting for user choice');
    return { success: true, waitForInput: true };
    */
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

    // 2. Get old position for history (unique constraint on conversation_id means only one pipeline at a time)
    let fromColumnId: string | null = null;
    const { data: existingPos } = await supabase
      .from('conversation_pipeline_positions')
      .select('id, column_id, pipeline_id')
      .eq('conversation_id', context.conversationId)
      .maybeSingle();

    if (existingPos) {
      fromColumnId = existingPos.pipeline_id === pipelineId ? existingPos.column_id : null;
      const { error } = await supabase
        .from('conversation_pipeline_positions')
        .update({
          pipeline_id: pipelineId,
          column_id: columnId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPos.id);
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

    // 3. Log stage history
    await supabase
      .from('conversation_stage_history')
      .insert({
        conversation_id: context.conversationId,
        pipeline_id: pipelineId,
        from_column_id: fromColumnId,
        to_column_id: columnId,
        changed_by_type: 'flow',
        changed_by: null,
        organization_id: context.organizationId,
      });

    // 4. Trigger stage notification
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      await fetch(`${supabaseUrl}/functions/v1/stage-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          conversationId: context.conversationId,
          columnId,
          organizationId: context.organizationId,
        }),
      });
      console.log('[FLOW EXECUTE] Stage notification triggered for column', columnId);
    } catch (notifErr) {
      console.error('[FLOW EXECUTE] Stage notification error:', notifErr);
    }

    return { success: true, metadata: { pipelineId, columnId, columnName } };
  } catch (error) {
    console.error('[FLOW EXECUTE] Pipeline move error:', error);
    return { success: false, error: String(error) };
  }
}

async function executeCondition(data: Record<string, unknown>, context: ExecutionContext, supabase: SupabaseClientType): Promise<NodeResult> {
  // Support rules-based conditions (tag checks, pipeline checks, etc.)
  const rules = data.rules as Array<{ id: string; type: string; tagId?: string; negate?: boolean; pipelineColumnId?: string; variable?: string; operator?: string; value?: string }> | undefined;
  const matchType = String(data.matchType || 'all'); // 'all' or 'any'

  if (rules && rules.length > 0) {
    console.log(`[FLOW EXECUTE] Condition with ${rules.length} rules, matchType=${matchType}`);
    const results: boolean[] = [];

    for (const rule of rules) {
      let ruleResult = false;

      if (rule.type === 'tag' && rule.tagId) {
        // Check if contact has the tag
        const { data: existingTag } = await supabase
          .from('contact_tags')
          .select('id')
          .eq('contact_id', context.contactId)
          .eq('tag_id', rule.tagId)
          .maybeSingle();

        ruleResult = !!existingTag;
        console.log(`[FLOW EXECUTE] Tag rule: tagId=${rule.tagId}, exists=${ruleResult}, negate=${rule.negate}`);
      } else if (rule.type === 'pipeline' && rule.pipelineColumnId) {
        // Check if conversation is in a specific pipeline column
        const { data: position } = await supabase
          .from('conversation_pipeline_positions')
          .select('id')
          .eq('conversation_id', context.conversationId)
          .eq('column_id', rule.pipelineColumnId)
          .maybeSingle();

        ruleResult = !!position;
        console.log(`[FLOW EXECUTE] Pipeline rule: columnId=${rule.pipelineColumnId}, match=${ruleResult}`);
      } else if (rule.type === 'variable') {
        // Variable comparison
        const actualValue = String(context.variables[rule.variable || ''] || '');
        const compareValue = String(rule.value || '');
        const operator = rule.operator || 'equals';

        switch (operator) {
          case 'equals': ruleResult = actualValue === compareValue; break;
          case 'not_equals': ruleResult = actualValue !== compareValue; break;
          case 'contains': ruleResult = actualValue.includes(compareValue); break;
          case 'greater_than': ruleResult = Number(actualValue) > Number(compareValue); break;
          case 'less_than': ruleResult = Number(actualValue) < Number(compareValue); break;
        }
        console.log(`[FLOW EXECUTE] Variable rule: ${rule.variable} ${operator} ${compareValue} => ${ruleResult}`);
      }

      // Apply negate
      if (rule.negate) ruleResult = !ruleResult;
      results.push(ruleResult);
    }

    const finalResult = matchType === 'any'
      ? results.some(r => r)
      : results.every(r => r);

    console.log(`[FLOW EXECUTE] Condition final result: ${finalResult} (rules: ${results.join(', ')})`);
    return { success: true, outputHandle: finalResult ? 'true' : 'false' };
  }

  // Fallback: legacy variable-based condition
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

  console.log(`[FLOW EXECUTE] Legacy condition: ${variable} ${operator} ${compareValue} => ${result}`);
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
    const normalizedPhone = context.contactPhone.replace(/\D/g, '');
    const presenceState = presenceType === 'typing' ? 'composing' : 'recording';

    if (context.provider === 'evolution') {
      if (!context.evolutionBaseUrl || !context.evolutionApiKey || !context.evolutionInstanceName) return;
      await fetch(`${context.evolutionBaseUrl}/chat/sendPresence/${context.evolutionInstanceName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': context.evolutionApiKey,
        },
        body: JSON.stringify({
          number: normalizedPhone,
          presence: presenceState,
          delay: durationMs,
        }),
      }).catch(() => null);
      return;
    }

    if (!context.uazapiBaseUrl || !context.zapiToken) return;

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
        const response = await fetch(`${context.uazapiBaseUrl}${ep.path}`, {
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
async function logNodeExecution(
  supabase: SupabaseClientType,
  context: ExecutionContext,
  node: any,
  executionId?: string
) {
  try {
    const { id: nodeId, type: nodeType, data } = node;
    const nodeName = data?.label || data?.name || nodeType;

    await supabase.from('flow_node_logs').insert({
      organization_id: context.organizationId,
      conversation_id: context.conversationId,
      flow_execution_id: executionId,
      node_id: nodeId,
      node_name: nodeName,
      node_type: nodeType,
      input_data: data,
    });
  } catch (err) {
    console.error('[FLOW EXECUTE] Error logging node execution:', err);
  }
}
