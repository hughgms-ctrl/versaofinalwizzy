import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ensureInstagramContact,
  ensureInstagramConversation,
  reserveInstagramSendSlot,
  sendInstagramButtonMessage,
  sendInstagramMessage,
  sendInstagramQuickReplyMessage,
} from '../_shared/instagramProvider.ts';

// Motor dos fluxos visuais do Instagram.
//
// Espelha a forma do flow-execute do WhatsApp — percorre o grafo nó a nó,
// estaciona no banco quando precisa esperar, retoma pelo cron — mas é uma
// implementação própria: o canal tem regras que o WhatsApp não tem (janela de
// 24h, private reply, cota por conta) e misturá-las no mesmo motor exigiria
// refatorar o que hoje roda a operação de WhatsApp em produção.
//
// Ver docs/WIZZY_ENGAGE_PLANO_PRODUTO.md (decisão C2).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface FlowNode {
  id: string;
  type: string;
  data: Record<string, any>;
  position?: { x: number; y: number };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

interface NodeResult {
  success: boolean;
  error?: string;
  /** Saída escolhida, para grafos com mais de um caminho (condição, espera). */
  outputHandle?: string;
  variables?: Record<string, unknown>;
  /** Para a execução aguardando uma mensagem da pessoa. */
  waitForInput?: boolean;
  /** Para a execução até esta hora; o cron retoma no nó SEGUINTE. */
  resumeAt?: Date;
  /** Desistência da espera por resposta. */
  timeoutAt?: Date;
}

interface ExecutionContext {
  executionId: string;
  organizationId: string;
  account: any;
  contact: any;
  conversationId: string;
  variables: Record<string, any>;
  /**
   * O comentário que originou a execução, quando houver.
   *
   * Enquanto ele não tiver sido gasto, a primeira mensagem do fluxo sai como
   * private reply — a única forma de alcançar quem apenas comentou, já que
   * comentar não abre a janela de 24h. A Meta permite uma por comentário.
   */
  pendingCommentId: string | null;
}

const WAIT_UNIT_MS: Record<string, number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

/** Espera curta roda inline; acima disto a execução é estacionada no banco. */
const INLINE_DELAY_LIMIT_MS = 20_000;

function interpolate(template: string, variables: Record<string, any>): string {
  return String(template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
    const value = variables?.[key];
    return value === undefined || value === null ? match : String(value);
  });
}

function findNextNode(nodeId: string, edges: FlowEdge[], handle?: string): string | null {
  const outgoing = edges.filter((e) => e.source === nodeId);
  if (!outgoing.length) return null;

  if (handle) {
    const matched = outgoing.find((e) => e.sourceHandle === handle);
    if (matched) return matched.target;
    // Sem aresta para a saída escolhida o fluxo termina aqui. Cair na primeira
    // aresta disponível mandaria a pessoa pelo caminho errado — pior do que
    // parar, porque parece que funcionou.
    return null;
  }

  return outgoing[0].target;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENVIO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Envia uma mensagem do fluxo, resolvendo as três regras do canal:
 * endereçamento (private reply x DM comum), cota da conta e janela de 24h.
 */
async function sendFlowMessage(
  supabase: any,
  context: ExecutionContext,
  data: Record<string, any>,
): Promise<NodeResult> {
  const text = interpolate(data.text || '', context.variables).trim();
  if (!text) {
    return { success: true }; // nó vazio não é erro; só não há o que enviar
  }

  // Private reply enquanto o comentário não foi gasto: é o que alcança quem
  // apenas comentou. Depois disso, DM comum — que exige a janela aberta.
  const usePrivateReply = !!context.pendingCommentId;
  const recipient = usePrivateReply
    ? { comment_id: context.pendingCommentId! }
    : { id: context.contact.igsid };

  if (!usePrivateReply) {
    const { data: conversation } = await supabase
      .from('instagram_conversations')
      .select('last_inbound_at')
      .eq('id', context.conversationId)
      .maybeSingle();

    const lastInbound = conversation?.last_inbound_at;
    const windowOpen = lastInbound
      && Date.now() - new Date(lastInbound).getTime() < 24 * 60 * 60 * 1000;

    if (!windowOpen) {
      // Não é falha técnica: a pessoa simplesmente não respondeu. Tratar como
      // erro esconderia as falhas reais no meio das rotineiras.
      return { success: false, error: 'janela_24h_fechada' };
    }
  }

  const hasSlot = await reserveInstagramSendSlot(supabase, context.account.id, 'automation');
  if (!hasSlot) {
    return { success: false, error: 'limite_de_envio_da_conta' };
  }

  const buttonUrl = String(data.buttonUrl || '').trim();
  const quickReplies: string[] = (data.quickReplies || [])
    .map((q: any) => String(q?.label ?? q ?? '').trim())
    .filter(Boolean);

  let result;
  let trackedLinkId: string | null = null;

  if (quickReplies.length) {
    // Quick reply tem precedência: a API não aceita chips junto com o template
    // de botão, e é a chip que faz a pessoa responder — abrindo a janela.
    result = await sendInstagramQuickReplyMessage(
      context.account,
      recipient,
      text,
      quickReplies.map((label) => ({
        title: label,
        payload: JSON.stringify({ k: 'ig_flow', e: context.executionId, v: label }),
      })),
    );
  } else if (buttonUrl) {
    const { data: trackedLink } = await supabase
      .from('instagram_tracked_links')
      .insert({
        organization_id: context.organizationId,
        contact_id: context.contact.id,
        destination_url: buttonUrl,
      })
      .select('id')
      .single();
    trackedLinkId = trackedLink?.id || null;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const redirectUrl = `${supabaseUrl}/functions/v1/instagram-link-redirect?id=${trackedLinkId}`;
    result = await sendInstagramButtonMessage(
      context.account,
      recipient,
      text,
      String(data.buttonLabel || 'Ver mais'),
      redirectUrl,
    );
  } else {
    result = await sendInstagramMessage(context.account, recipient, text);
  }

  if (!result.ok) {
    return { success: false, error: `envio_falhou: ${result.responseText?.slice(0, 200)}` };
  }

  // O comentário rende uma única private reply, para sempre. Gastá-la aqui
  // obriga as mensagens seguintes a passarem pela janela de 24h.
  if (usePrivateReply) context.pendingCommentId = null;

  await supabase.from('instagram_messages').insert({
    conversation_id: context.conversationId,
    direction: 'outbound',
    type: usePrivateReply ? 'comment_reply' : 'text',
    content: text,
    ig_message_id: result.igMessageId,
    is_from_bot: true,
    metadata: { flow_execution_id: context.executionId, tracked_link_id: trackedLinkId },
  });

  await supabase.from('instagram_conversations').update({
    last_message_at: new Date().toISOString(),
    last_message_direction: 'outbound',
  }).eq('id', context.conversationId);

  return { success: true, variables: trackedLinkId ? { ultimo_link_id: trackedLinkId } : undefined };
}

// ═══════════════════════════════════════════════════════════════════════════
// NÓS
// ═══════════════════════════════════════════════════════════════════════════

async function executeTag(supabase: any, context: ExecutionContext, data: Record<string, any>): Promise<NodeResult> {
  const tagName = String(data.tag || '').trim();
  if (!tagName) return { success: true };

  const { data: existing } = await supabase
    .from('tags')
    .select('id')
    .eq('organization_id', context.organizationId)
    .eq('name', tagName)
    .maybeSingle();

  const tagId = existing?.id || (await supabase
    .from('tags')
    .insert({ organization_id: context.organizationId, name: tagName })
    .select('id')
    .single()).data?.id;

  if (!tagId) return { success: false, error: 'nao_foi_possivel_criar_a_etiqueta' };

  await supabase.from('instagram_contact_tags').upsert({
    instagram_contact_id: context.contact.id,
    tag_id: tagId,
    added_by_type: 'automation',
  }, { onConflict: 'instagram_contact_id,tag_id' });

  return { success: true };
}

async function executeCondition(supabase: any, context: ExecutionContext, data: Record<string, any>): Promise<NodeResult> {
  const kind = String(data.conditionType || 'variable');
  let matched = false;

  if (kind === 'has_tag') {
    const tagName = String(data.tag || '').trim();
    const { data: rows } = await supabase
      .from('instagram_contact_tags')
      .select('tags!inner(name)')
      .eq('instagram_contact_id', context.contact.id);
    matched = (rows || []).some((r: any) => r.tags?.name === tagName);
  } else if (kind === 'clicked_link') {
    const linkId = context.variables.ultimo_link_id;
    if (linkId) {
      const { data: link } = await supabase
        .from('instagram_tracked_links')
        .select('clicked_at')
        .eq('id', linkId)
        .maybeSingle();
      matched = !!link?.clicked_at;
    }
  } else {
    // Comparação de variável — inclui a última resposta da pessoa, que o nó de
    // espera grava em `ultima_resposta`.
    const actual = String(context.variables[String(data.variable || '')] ?? '').toLowerCase().trim();
    const expected = String(data.value ?? '').toLowerCase().trim();
    const operator = String(data.operator || 'contains');
    matched = operator === 'equals' ? actual === expected
      : operator === 'not_contains' ? !actual.includes(expected)
      : actual.includes(expected);
  }

  return { success: true, outputHandle: matched ? 'true' : 'false' };
}

async function executeTransfer(supabase: any, context: ExecutionContext, data: Record<string, any>): Promise<NodeResult> {
  const update: Record<string, unknown> = {
    // 'ativo' = humano no comando. O enum service_mode não tem 'humano'.
    service_mode: 'ativo',
  };
  if (data.assigneeId) update.assigned_to = data.assigneeId;
  if (data.departmentId) update.department_id = data.departmentId;

  await supabase.from('instagram_conversations').update(update).eq('id', context.conversationId);
  return { success: true };
}

async function executeWebhook(context: ExecutionContext, data: Record<string, any>): Promise<NodeResult> {
  const url = String(data.url || '').trim();
  if (!url) return { success: true };

  try {
    const response = await fetch(url, {
      method: String(data.method || 'POST'),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact: {
          igsid: context.contact.igsid,
          username: context.contact.username,
        },
        variables: context.variables,
        executionId: context.executionId,
      }),
    });
    // O webhook é de saída: falha dele não deve derrubar a jornada da pessoa.
    if (!response.ok) console.warn('[instagram-flow-execute] webhook respondeu', response.status);
    return { success: true };
  } catch (error) {
    console.error('[instagram-flow-execute] webhook falhou:', error);
    return { success: true };
  }
}

async function runNode(
  supabase: any,
  node: FlowNode,
  context: ExecutionContext,
): Promise<NodeResult> {
  const data = node.data || {};

  switch (node.type) {
    case 'start':
      return { success: true };

    case 'ig-message':
      return sendFlowMessage(supabase, context, data);

    case 'ig-delay': {
      const ms = Number(data.waitValue || 0) * (WAIT_UNIT_MS[String(data.waitUnit || 'minutes')] || WAIT_UNIT_MS.minutes);
      if (ms <= 0) return { success: true };
      if (ms <= INLINE_DELAY_LIMIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return { success: true };
      }
      // Espera longa: a edge function morre antes de acordar, então a execução
      // é estacionada e o cron retoma no nó seguinte.
      return { success: true, resumeAt: new Date(Date.now() + ms) };
    }

    case 'ig-user-input': {
      const timeoutMinutes = Number(data.timeoutMinutes || 0);
      return {
        success: true,
        waitForInput: true,
        timeoutAt: timeoutMinutes > 0
          ? new Date(Date.now() + timeoutMinutes * 60_000)
          : undefined,
      };
    }

    case 'ig-action-tag':
      return executeTag(supabase, context, data);

    case 'ig-condition':
      return executeCondition(supabase, context, data);

    case 'ig-action-transfer':
      return executeTransfer(supabase, context, data);

    case 'ig-action-webhook':
      return executeWebhook(context, data);

    default:
      // Nó desconhecido não interrompe a jornada: um fluxo salvo por uma versão
      // mais nova da interface continua rodando o que este motor entende.
      console.warn('[instagram-flow-execute] tipo de nó desconhecido:', node.type);
      return { success: true };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LAÇO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

async function runExecution(
  supabase: any,
  executionId: string,
  flow: any,
  context: ExecutionContext,
  startNodeId: string,
) {
  const nodes: FlowNode[] = flow.nodes || [];
  const edges: FlowEdge[] = flow.edges || [];
  const log: Array<Record<string, unknown>> = [];

  let currentNodeId: string | null = startNodeId;
  // Teto de segurança: um grafo com ciclo (A → B → A) rodaria para sempre,
  // gastando cota de envio da conta do cliente a cada volta.
  let steps = 0;
  const MAX_STEPS = 100;

  while (currentNodeId && steps < MAX_STEPS) {
    steps++;
    const node = nodes.find((n) => n.id === currentNodeId);
    if (!node) break;

    let result: NodeResult;
    try {
      result = await runNode(supabase, node, context);
    } catch (error) {
      result = { success: false, error: String(error).slice(0, 300) };
    }

    log.push({
      nodeId: node.id,
      type: node.type,
      result: result.success ? 'success' : 'failed',
      error: result.error,
      at: new Date().toISOString(),
    });

    if (!result.success) {
      await supabase.from('instagram_flow_executions').update({
        status: 'failed',
        error_message: result.error,
        execution_log: log,
        variables: context.variables,
        completed_at: new Date().toISOString(),
        timeout_at: null,
      }).eq('id', executionId);
      return;
    }

    if (result.variables) Object.assign(context.variables, result.variables);

    const nextNodeId = findNextNode(node.id, edges, result.outputHandle);

    if (result.waitForInput) {
      // Sem saída para continuar, esperar resposta não teria efeito nenhum:
      // encerra em vez de deixar a execução presa ocupando a conversa.
      if (!nextNodeId) break;
      await supabase.from('instagram_flow_executions').update({
        status: 'waiting_input',
        current_node_id: node.id,
        variables: context.variables,
        execution_log: log,
        timeout_at: result.timeoutAt?.toISOString() || null,
      }).eq('id', executionId);
      return;
    }

    if (result.resumeAt) {
      // Estaciona JÁ NO PRÓXIMO nó: guardar o nó de espera faria o cron
      // reexecutá-lo e reagendar de novo, prendendo o contato num laço.
      if (!nextNodeId) break;
      await supabase.from('instagram_flow_executions').update({
        status: 'waiting_delay',
        current_node_id: nextNodeId,
        variables: context.variables,
        execution_log: log,
        timeout_at: result.resumeAt.toISOString(),
      }).eq('id', executionId);
      return;
    }

    if (!nextNodeId) break;
    currentNodeId = nextNodeId;
  }

  if (steps >= MAX_STEPS) {
    console.error('[instagram-flow-execute] teto de passos atingido — possível ciclo no fluxo', flow.id);
  }

  await supabase.from('instagram_flow_executions').update({
    status: 'completed',
    execution_log: log,
    variables: context.variables,
    completed_at: new Date().toISOString(),
    timeout_at: null,
  }).eq('id', executionId);
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRADA
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Endpoint interno: chamado pelo webhook e pelo cron de retomada, nunca pelo
  // navegador.
  const authHeader = req.headers.get('Authorization') || '';
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));

    // ── Retomada de uma execução estacionada ──────────────────────────────
    if (body.resumeExecutionId) {
      const { data: execution } = await supabase
        .from('instagram_flow_executions')
        .select('*, instagram_flows(*), instagram_contacts(*)')
        .eq('id', body.resumeExecutionId)
        .single();

      if (!execution) return jsonResponse({ error: 'Execução não encontrada' }, 404);

      const flow = execution.instagram_flows;
      const { data: account } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('id', flow.instagram_account_id)
        .single();

      const context: ExecutionContext = {
        executionId: execution.id,
        organizationId: execution.organization_id,
        account,
        contact: execution.instagram_contacts,
        conversationId: execution.conversation_id,
        variables: execution.variables || {},
        // A private reply do comentário original, se existiu, já foi gasta na
        // primeira passagem — daqui em diante tudo depende da janela de 24h.
        pendingCommentId: null,
      };

      // Numa retomada por resposta da pessoa, o texto dela vira variável e o
      // fluxo segue pela saída do nó de espera.
      if (body.replyText !== undefined) {
        context.variables.ultima_resposta = body.replyText;
      }

      const nodes: FlowNode[] = flow.nodes || [];
      const edges: FlowEdge[] = flow.edges || [];
      const parkedNode = nodes.find((n) => n.id === execution.current_node_id);

      // Onde retomar depende de como a execução parou, e o TIPO do nó guardado
      // responde isso sem depender do status: numa espera por resposta o nó
      // guardado é o próprio nó de espera (é preciso saber onde a pessoa
      // parou); numa espera por tempo já foi guardado o nó seguinte.
      //
      // Ler o status aqui seria errado: a reserva do cron já o trocou para
      // 'running' antes desta função ser chamada.
      const startNodeId = parkedNode?.type === 'ig-user-input'
        // 'replied' quando a pessoa respondeu, 'timeout' quando o prazo venceu:
        // é o que permite desenhar "se não responder em 1h, mande outra coisa".
        ? findNextNode(parkedNode.id, edges, body.replyText !== undefined ? 'replied' : 'timeout')
        : execution.current_node_id;

      if (!startNodeId) {
        await supabase.from('instagram_flow_executions').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          timeout_at: null,
        }).eq('id', execution.id);
        return jsonResponse({ success: true, finished: true });
      }

      await runExecution(supabase, execution.id, flow, context, startNodeId);
      return jsonResponse({ success: true });
    }

    // ── Início de uma execução nova ───────────────────────────────────────
    const flowId = String(body.flowId || '').trim();
    const event = body.event || {};
    if (!flowId) return jsonResponse({ error: 'flowId é obrigatório' }, 400);

    const { data: flow, error: flowError } = await supabase
      .from('instagram_flows')
      .select('*, instagram_accounts(*)')
      .eq('id', flowId)
      .single();

    if (flowError || !flow || !flow.is_active) {
      return jsonResponse({ error: 'Fluxo não encontrado ou inativo' }, 404);
    }

    const account = flow.instagram_accounts;
    const contact = await ensureInstagramContact(supabase, account, event.fromIgsid, event.fromUsername);
    const conversation = await ensureInstagramConversation(supabase, account, contact);

    const startNode = (flow.nodes || []).find((n: FlowNode) => n.type === 'start');
    if (!startNode) return jsonResponse({ error: 'Fluxo sem nó de início' }, 400);

    const { data: execution, error: executionError } = await supabase
      .from('instagram_flow_executions')
      .insert({
        flow_id: flow.id,
        organization_id: account.organization_id,
        conversation_id: conversation.id,
        contact_id: contact.id,
        current_node_id: startNode.id,
        variables: {
          username: event.fromUsername || '',
          texto_recebido: event.text || '',
        },
        trigger_source: {
          trigger_type: flow.trigger_type,
          comment_id: event.commentId || null,
          message_type: event.messageType || null,
        },
      })
      .select('id')
      .single();

    if (executionError) {
      // O índice único de "uma execução viva por conversa" recusa a entrada
      // duplicada. É o caso de quem comenta três vezes seguidas: a segunda e a
      // terceira não devem criar jornadas paralelas.
      if (executionError.code === '23505') {
        return jsonResponse({ success: true, skipped: 'ja_existe_execucao_viva' });
      }
      throw executionError;
    }

    await supabase
      .from('instagram_flows')
      .update({ triggers_count: (flow.triggers_count || 0) + 1 })
      .eq('id', flow.id);

    const context: ExecutionContext = {
      executionId: execution.id,
      organizationId: account.organization_id,
      account,
      contact,
      conversationId: conversation.id,
      variables: {
        username: event.fromUsername || '',
        texto_recebido: event.text || '',
      },
      pendingCommentId: event.commentId || null,
    };

    await runExecution(supabase, execution.id, flow, context, startNode.id);
    return jsonResponse({ success: true, executionId: execution.id });
  } catch (error) {
    console.error('[instagram-flow-execute] error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
});
