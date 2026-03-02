import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
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
}

// deno-lint-ignore no-explicit-any
type SupabaseClientType = any;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { flowId, conversationId, startNodeId } = await req.json();

    if (!flowId || !conversationId) {
      return new Response(
        JSON.stringify({ error: 'flowId and conversationId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the flow
    const { data: flow, error: flowError } = await supabase
      .from('flows')
      .select('*')
      .eq('id', flowId)
      .single();

    if (flowError || !flow) {
      console.error('Flow not found:', flowError);
      return new Response(
        JSON.stringify({ error: 'Flow not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get conversation and contact
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*, contacts(*)')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('Conversation not found:', convError);
      return new Response(
        JSON.stringify({ error: 'Conversation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get WhatsApp instance
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', flow.organization_id)
      .eq('status', 'connected')
      .single();

    if (instanceError || !instance) {
      console.error('No connected WhatsApp instance:', instanceError);
      return new Response(
        JSON.stringify({ error: 'No connected WhatsApp instance' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create flow execution record
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
      console.error('Error creating execution:', execError);
      return new Response(
        JSON.stringify({ error: 'Error creating execution' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
    };

    // Find start node
    let currentNodeId: string | null = startNodeId || nodes.find(n => n.type === 'start')?.id || null;
    const executionLog: Array<{ nodeId: string; type: string; result: string; timestamp: string }> = [];

    // Execute flow nodes
    while (currentNodeId) {
      const currentNode = nodes.find(n => n.id === currentNodeId);
      if (!currentNode) break;

      console.log(`Executing node: ${currentNode.id} (${currentNode.type})`);

      try {
        const result = await executeNode(currentNode, context, supabase);
        executionLog.push({
          nodeId: currentNode.id,
          type: currentNode.type,
          result: result.success ? 'success' : 'failed',
          timestamp: new Date().toISOString(),
        });

        if (!result.success) {
          // Update execution as failed
          await supabase
            .from('flow_executions')
            .update({
              status: 'failed',
              error_message: result.error,
              execution_log: executionLog,
              completed_at: new Date().toISOString(),
            })
            .eq('id', execution.id);

          return new Response(
            JSON.stringify({ success: false, error: result.error, executionId: execution.id }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Handle special cases
        if (result.waitForInput) {
          await supabase
            .from('flow_executions')
            .update({
              status: 'waiting_input',
              current_node_id: currentNode.id,
              variables: context.variables,
              execution_log: executionLog,
            })
            .eq('id', execution.id);

          return new Response(
            JSON.stringify({ success: true, status: 'waiting_input', executionId: execution.id }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update variables if changed
        if (result.variables) {
          Object.assign(context.variables, result.variables);
        }

        // Find next node
        const nextNodeId = findNextNode(currentNode, edges, result.outputHandle);
        currentNodeId = nextNodeId;

        // Add delay between nodes to avoid rate limiting
        if (currentNodeId && (currentNode.type.startsWith('message-') || currentNode.type === 'content-block')) {
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

    // Update execution as completed
    await supabase
      .from('flow_executions')
      .update({
        status: 'completed',
        execution_log: executionLog,
        variables: context.variables,
        completed_at: new Date().toISOString(),
      })
      .eq('id', execution.id);

    // Increment triggers count
    await supabase
      .from('flows')
      .update({ triggers_count: flow.triggers_count + 1 })
      .eq('id', flowId);

    return new Response(
      JSON.stringify({ success: true, executionId: execution.id, log: executionLog }),
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

interface NodeResult {
  success: boolean;
  error?: string;
  outputHandle?: string;
  variables?: Record<string, unknown>;
  waitForInput?: boolean;
}

async function executeNode(
  node: FlowNode,
  context: ExecutionContext,
  supabase: SupabaseClientType
): Promise<NodeResult> {
  const { type, data } = node;

  switch (type) {
    case 'start':
      return { success: true };

    case 'content-block':
      return await executeContentBlock(data, context);

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
      return await executeAIHandoff(data, context, supabase);

    case 'ai-return':
      return { success: true };

    default:
      console.log(`Unknown node type: ${type}`);
      return { success: true };
  }
}

async function executeAIHandoff(
  data: Record<string, unknown>,
  context: ExecutionContext,
  supabase: SupabaseClientType
): Promise<NodeResult> {
  try {
    // 1. Get last message from contact to use as input
    const { data: lastMessage } = await supabase
      .from('messages')
      .select('content')
      .eq('conversation_id', context.conversationId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const inputContent = lastMessage?.content || 'Olá';

    // 2. Call agent-orchestrator with specialized instructions override
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const response = await fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        conversationId: context.conversationId,
        messageContent: inputContent,
        masterPromptOverride: data.contextMessage || null // This is the "Extra Prompt" from the node
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Agent Orchestrator call failed:', errorText);
      return { success: false, error: `Orchestrator error: ${errorText}` };
    }

    const result = await response.json();
    return { success: result.success };
  } catch (error) {
    console.error('Error in executeAIHandoff:', error);
    return { success: false, error: String(error) };
  }
}

// Execute Content Block - processes multiple items sequentially
async function executeContentBlock(data: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> {
  const items = (data.items as ContentItem[]) || [];

  if (items.length === 0) {
    return { success: true };
  }

  for (const item of items) {
    try {
      switch (item.type) {
        case 'text':
          if (item.content) {
            // Send typing presence before text
            await sendPresence('typing', context);
            await new Promise(resolve => setTimeout(resolve, 1500));
            await sendTextMessage(item.content, context);
          }
          break;

        case 'image':
          if (item.mediaUrl) {
            await sendPresence('typing', context);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await sendMediaItem('image', item.mediaUrl, item.caption, context);
          }
          break;

        case 'video':
          if (item.mediaUrl) {
            await sendPresence('typing', context);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await sendMediaItem('video', item.mediaUrl, item.caption, context);
          }
          break;

        case 'audio':
          if (item.mediaUrl) {
            // Send RECORDING presence before audio to simulate recording
            await sendPresence('recording', context);
            await new Promise(resolve => setTimeout(resolve, 2000));
            await sendMediaItem('audio', item.mediaUrl, undefined, context);
          }
          break;

        case 'document':
          if (item.mediaUrl) {
            await sendPresence('typing', context);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await sendMediaItem('document', item.mediaUrl, item.caption, context);
          }
          break;

        case 'delay':
          const delayMs = (item.delaySeconds || 3) * 1000;
          await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 30000)));
          break;
      }

      // Small delay between items to avoid rate limiting
      if (item.type !== 'delay') {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`Error executing content item ${item.id}:`, error);
      return { success: false, error: `Failed to execute content item: ${error}` };
    }
  }

  return { success: true };
}

async function sendTextMessage(content: string, context: ExecutionContext): Promise<void> {
  const message = replaceVariables(content, context.variables);
  if (!message) return;

  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (clientToken) {
    headers['Client-Token'] = clientToken;
  }

  const response = await fetch(
    `https://api.z-api.io/instances/${context.zapiInstanceId}/token/${context.zapiToken}/send-text`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: context.contactPhone,
        message,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send text message: ${error}`);
  }
}

async function sendMediaItem(
  mediaType: 'image' | 'video' | 'audio' | 'document',
  mediaUrl: string,
  caption: string | undefined,
  context: ExecutionContext
): Promise<void> {
  const endpoint = mediaType === 'document' ? 'send-document' : `send-${mediaType}`;
  const processedCaption = caption ? replaceVariables(caption, context.variables) : undefined;

  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (clientToken) {
    headers['Client-Token'] = clientToken;
  }

  const body: Record<string, unknown> = {
    phone: context.contactPhone,
  };

  // Different payload structure based on media type
  if (mediaType === 'image') {
    body.image = mediaUrl;
    if (processedCaption) body.caption = processedCaption;
  } else if (mediaType === 'video') {
    body.video = mediaUrl;
    if (processedCaption) body.caption = processedCaption;
  } else if (mediaType === 'audio') {
    body.audio = mediaUrl;
    // Only send as voice message (PTT/waveform) if the file is OGG format
    // MP3 files should NOT use waveform as it causes audio quality issues
    const urlLower = mediaUrl.toLowerCase();
    const isOggFormat = urlLower.includes('.ogg') || urlLower.includes('ogg');
    if (isOggFormat) {
      body.waveform = true;
    }
    // MP3, WAV, and other formats will be sent as regular audio (no waveform)
  } else if (mediaType === 'document') {
    body.document = mediaUrl;
    if (processedCaption) body.caption = processedCaption;
  }

  const response = await fetch(
    `https://api.z-api.io/instances/${context.zapiInstanceId}/token/${context.zapiToken}/${endpoint}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send ${mediaType}: ${error}`);
  }
}

async function sendButtonsMessage(data: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> {
  try {
    const content = replaceVariables(String(data.text || data.content || ''), context.variables);
    const buttons = data.buttons as Array<{ id: string; label: string }> || [];

    if (!content || buttons.length === 0) {
      return { success: true };
    }

    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (clientToken) {
      headers['Client-Token'] = clientToken;
    }

    const response = await fetch(
      `https://api.z-api.io/instances/${context.zapiInstanceId}/token/${context.zapiToken}/send-button-list`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: context.contactPhone,
          message: content,
          buttonList: {
            buttons: buttons.map(b => ({ id: b.id, label: b.label })),
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Failed to send buttons: ${error}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function sendListMessage(data: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> {
  try {
    const content = replaceVariables(String(data.content || ''), context.variables);

    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (clientToken) {
      headers['Client-Token'] = clientToken;
    }

    const response = await fetch(
      `https://api.z-api.io/instances/${context.zapiInstanceId}/token/${context.zapiToken}/send-option-list`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: context.contactPhone,
          message: content,
          optionList: data.sections || [],
          buttonLabel: data.buttonText || 'Ver opções',
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Failed to send list: ${error}` };
    }

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
    const tagId = String(data.tagId || '');
    const action = String(data.action) || 'add';

    if (!tagId) {
      return { success: true };
    }

    if (action === 'add') {
      // Add tag to contact
      await supabase
        .from('contact_tags')
        .upsert({
          contact_id: context.contactId,
          tag_id: tagId,
          added_by_type: 'flow',
        }, {
          onConflict: 'contact_id,tag_id',
          ignoreDuplicates: true,
        });
    } else if (action === 'remove') {
      // Remove tag from contact
      await supabase
        .from('contact_tags')
        .delete()
        .eq('contact_id', context.contactId)
        .eq('tag_id', tagId);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function executePipelineAction(
  data: Record<string, unknown>,
  context: ExecutionContext,
  supabase: SupabaseClientType
): Promise<NodeResult> {
  try {
    const status = String(data.pipelineColumn);

    await supabase
      .from('conversations')
      .update({ status })
      .eq('id', context.conversationId);

    return { success: true };
  } catch (error) {
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
  context: ExecutionContext
): Promise<void> {
  try {
    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (clientToken) {
      headers['Client-Token'] = clientToken;
    }

    await fetch(
      `https://api.z-api.io/instances/${context.zapiInstanceId}/token/${context.zapiToken}/send-presence`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: context.contactPhone,
          presence: presenceType,
        }),
      }
    );
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
