import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resumeFlow } from '../_shared/flowResume.ts';
import { resolveWorkspaceInstanceBinding, sendWhatsAppMessage } from '../_shared/whatsappProvider.ts';
import { resolveCaller, assertCallerCanAccessOrg, AccessError, type CallerAuth } from '../_shared/access.ts';
import { moveConversationToPipeline } from '../_shared/pipelineMove.ts';
import {
  MAX_EVOLUTION_REPLY_BUTTONS,
  evolutionButtonsAccepted,
  evolutionTargetFrom,
  sendEvolutionReplyButtons,
} from '../_shared/evolutionButtons.ts';

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
  saveTranscription?: boolean;
  transcription?: string;
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
type Provider = 'evolution' | 'uazapi';

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

async function loadProviderStrategy(supabase: SupabaseClientType): Promise<{
  primaryProvider: Provider;
  backupProvider: Provider;
  evolutionEnabled: boolean;
  uazapiEnabled: boolean;
}> {
  const { data: row } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'whatsapp_provider_strategy')
    .maybeSingle();
  const value = row?.value || {};
  return {
    primaryProvider: value.primary_provider === 'uazapi' ? 'uazapi' : 'evolution',
    backupProvider: value.backup_provider === 'evolution' ? 'evolution' : 'uazapi',
    evolutionEnabled: value.evolution_enabled ?? true,
    uazapiEnabled: value.uazapi_enabled ?? true,
  };
}

function providerEnabled(provider: Provider, strategy: Awaited<ReturnType<typeof loadProviderStrategy>>) {
  return provider === 'evolution' ? strategy.evolutionEnabled : strategy.uazapiEnabled;
}

async function resolveWhatsAppInstance(
  supabase: SupabaseClientType,
  organizationId: string,
  conversationInstanceId?: string | null,
) {
  const strategy = await loadProviderStrategy(supabase);
  const preferredProviders: Provider[] = [];
  if (providerEnabled(strategy.primaryProvider, strategy)) preferredProviders.push(strategy.primaryProvider);
  if (strategy.backupProvider !== strategy.primaryProvider && providerEnabled(strategy.backupProvider, strategy)) {
    preferredProviders.push(strategy.backupProvider);
  }

  const { data: instances, error } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'connected')
    .order('created_at', { ascending: false });

  if (error || !instances?.length) return { instance: null, error };

  const conversationInstance = conversationInstanceId
    ? instances.find((item: any) => item.id === conversationInstanceId)
    : null;
  if (conversationInstance) return { instance: conversationInstance, error: null };

  for (const provider of preferredProviders) {
    const instance = instances.find((item: any) => (item.provider || 'uazapi') === provider);
    if (instance) return { instance, error: null };
  }

  return { instance: null, error: null };
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

    // resumedFromExecutionId: mandado pelo cron ao acordar um atraso. Um atraso
    // não pausa a execução — ela é fechada e outra nasce no nó de retomada. Sem
    // esse elo, a passagem do contato pelo fluxo fica quebrada em N linhas soltas
    // e o histórico não consegue remontar a jornada.
    const { flowId, conversationId, startNodeId, isFromOrchestrator, triggerMessage: triggerMessageBody, variables: initialVariables, resumedFromExecutionId } = await req.json();

    // Disparo por webhook/campanha nao tem mensagem do contato: quem escreve e o
    // sistema. Sem triggerMessage, um no de IA no meio do fluxo apenas PAUSA e
    // fica esperando o contato falar — e num relatorio interno ninguem vai falar,
    // entao o agente nunca roda. A variavel trigger_message do payload serve como
    // essa primeira fala, e vale para qualquer campanha de webhook com no de IA.
    const triggerMessage: string | undefined =
      (typeof triggerMessageBody === 'string' && triggerMessageBody.trim() ? triggerMessageBody : undefined)
      ?? (() => {
        const fromVars = (initialVariables as Record<string, unknown> | undefined)?.trigger_message;
        return typeof fromVars === 'string' && fromVars.trim() ? fromVars : undefined;
      })();
    console.log(`[FLOW EXECUTE] Received request: flowId=${flowId}, conversationId=${conversationId}, startNodeId=${startNodeId}, isFromOrchestrator=${isFromOrchestrator}, triggerMessage=${triggerMessage}, resumedFrom=${resumedFromExecutionId || '-'}`);

    if (!flowId || !conversationId) {
      return new Response(
        JSON.stringify({ error: 'flowId and conversationId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SEGURANÇA: flow-execute roda com service_role e envia WhatsApp/dispara IA.
    // Com verify_jwt=false, qualquer um podia disparar fluxos (spam + custo).
    // Chamadas internas (service_role) passam; um usuário autenticado só dispara
    // fluxo da própria org, e o fluxo e a conversa têm de ser da MESMA org (impede
    // rodar o fluxo da org do atacante sobre a conversa de outra org).
    let caller: CallerAuth;
    try {
      caller = await resolveCaller(req);
    } catch (authErr) {
      const status = authErr instanceof AccessError ? authErr.status : 401;
      return new Response(JSON.stringify({ error: authErr instanceof Error ? authErr.message : 'Unauthorized' }), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (caller.mode !== 'service') {
      try {
        const [{ data: flowOrg }, { data: convOrg }] = await Promise.all([
          supabase.from('flows').select('organization_id').eq('id', flowId).maybeSingle(),
          supabase.from('conversations').select('organization_id').eq('id', conversationId).maybeSingle(),
        ]);
        await assertCallerCanAccessOrg(supabase, caller, flowOrg?.organization_id);
        if (convOrg?.organization_id && convOrg.organization_id !== flowOrg?.organization_id) {
          throw new AccessError('Forbidden', 403);
        }
      } catch (authErr) {
        const status = authErr instanceof AccessError ? authErr.status : 403;
        return new Response(JSON.stringify({ error: authErr instanceof Error ? authErr.message : 'Forbidden' }), {
          status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // PRÉ-VOO (síncrono, antes de responder). Estas quatro checagens rodavam
    // dentro do promise de background: quando falhavam, a função já tinha
    // respondido 200 e o fluxo simplesmente não acontecia, sem registro em
    // flow_executions e sem nada visível para quem chamou. Agora o chamador
    // (campaign-webhook, process-campaign-queue, zapi-webhook) recebe o motivo.
    // fnVersion serve só para saber, pela resposta, se o deploy desta função subiu.
    const fail = (reason: string, detail: string, status = 422) => {
      console.error(`[FLOW EXECUTE] ${detail}`);
      return new Response(JSON.stringify({ error: detail, reason, fnVersion: 'fe-v2' }), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    };

    // 1. Get the flow
    const { data: flow, error: flowError } = await supabase
      .from('flows')
      .select('*')
      .eq('id', flowId)
      .single();

    if (flowError || !flow) {
      return fail('flow_not_found', `Flow ${flowId} not found: ${flowError?.message || 'sem registro'}`, 404);
    }

    // 2. Get conversation and contact
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*, contacts(*)')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return fail('conversation_not_found', `Conversation ${conversationId} not found`, 404);
    }

    // A org de ENVIO é a da conversa, não a do fluxo: o workspace, o número e o
    // contato pertencem à conversa. Usar flow.organization_id aqui fazia o SELECT
    // do workspace não achar linha nenhuma quando as duas orgs divergiam, e o
    // resultado aparecia como "workspace sem número" — mesmo com número vinculado.
    // Todos os outros caminhos de envio (zapi-send-message, agent-orchestrator,
    // process-scheduled-messages) já usam a org da conversa.
    const sendOrganizationId = conversation.organization_id || flow.organization_id;

    // Fluxo de uma org rodando sobre conversa de outra é sempre erro de dados —
    // e antes ficava mascarado como workspace sem número. Falha explícita.
    if (
      flow.organization_id && conversation.organization_id &&
      flow.organization_id !== conversation.organization_id
    ) {
      return fail(
        'org_mismatch',
        `Fluxo ${flowId} (org ${flow.organization_id}) não pertence à org da conversa ${conversationId} (org ${conversation.organization_id}).`,
      );
    }

    // REGRA: um fluxo de um workspace NUNCA envia pelo número de outro workspace.
    // Cada fluxo tem UM workspace. A coluna workspace_ids é legado (pastas
    // multi-workspace escreviam nela); só a usamos como fallback para linhas
    // antigas em que workspace_id ficou nulo — sempre a primeira posição.
    const flowWorkspaceId: string | null = flow.workspace_id
      || (Array.isArray(flow.workspace_ids) ? flow.workspace_ids[0] : null)
      || null;

    if (
      conversation.workspace_id &&
      flowWorkspaceId &&
      conversation.workspace_id !== flowWorkspaceId
    ) {
      return fail(
        'workspace_mismatch',
        `Fluxo ${flowId} é do workspace ${flowWorkspaceId} e não pode enviar na conversa ` +
        `${conversationId}, que está no workspace ${conversation.workspace_id}.`,
      );
    }

    // Conversa sem workspace: envia pelo número do workspace DO FLUXO, em vez de
    // cair no fallback da org (que poderia ser o número de outro workspace —
    // exatamente o que a regra proíbe).
    const effectiveWorkspaceId = conversation.workspace_id || flowWorkspaceId;

    // Regra de negócio: conversa dentro de um workspace só envia pelo número
    // do workspace. Se o workspace não tem número associado, abortamos — sem
    // fallback por organização.
    const workspaceBinding = await resolveWorkspaceInstanceBinding(
      supabase,
      sendOrganizationId,
      effectiveWorkspaceId,
    );
    if (workspaceBinding.blocked) {
      return fail(
        'workspace_without_number',
        `Workspace ${effectiveWorkspaceId} (org ${sendOrganizationId}) sem número associado; abortando envio.`,
      );
    }

    // 3. Get WhatsApp instance according to the admin provider strategy.
    const { instance, error: instanceError } = await resolveWhatsAppInstance(
      supabase,
      sendOrganizationId,
      workspaceBinding.workspaceInstanceId || conversation.whatsapp_instance_id,
    );

    if (instanceError || !instance) {
      return fail('no_connected_instance', `No connected instance for org ${sendOrganizationId}`);
    }
    const connectionSettings = await loadConnectionSettings(supabase);
    const provider = instance.provider === 'evolution' ? 'evolution' : 'uazapi';

    // Semeia name/phone a partir do contato da conversa. Cada chamador semeava
    // (ou esquecia de semear) essas variáveis por conta própria: disparo manual
    // pela conversa e zapi-webhook não mandavam nada, e a mensagem saía com
    // {{name}} cru. O contato já está carregado aqui, então o motor resolve para
    // TODO caminho de entrada. O que o chamador manda continua tendo prioridade.
    const contactSeed: Record<string, unknown> = {};
    const contactName = conversation.contacts?.name?.trim();
    const contactPhone = conversation.contacts?.phone;
    if (contactName) contactSeed.name = contactName;
    if (contactPhone) contactSeed.phone = contactPhone;

    // Campos customizados do contato (metadata.custom_fields), gravados pela
    // importação por planilha. É o que permite mandar uma mensagem diferente
    // para cada contato: a coluna da planilha vira {{minha_coluna}} no fluxo.
    // Semeados ANTES do merge de initialVariables, então uma variável de mesmo
    // nome vinda da campanha continua tendo prioridade.
    // metadata é jsonb: quase sempre chega como objeto, mas se algum caminho
    // gravou uma string JSON o acesso direto devolveria undefined e os campos
    // sumiriam sem erro nenhum. Faz o parse defensivo antes de ler.
    let contactMetadata = conversation.contacts?.metadata;
    if (typeof contactMetadata === 'string') {
      try {
        contactMetadata = JSON.parse(contactMetadata);
      } catch {
        contactMetadata = null;
      }
    }

    const customFields = contactMetadata?.custom_fields;
    if (customFields && typeof customFields === 'object' && !Array.isArray(customFields)) {
      for (const [key, value] of Object.entries(customFields)) {
        if (value === undefined || value === null || value === '') continue;
        contactSeed[key] = value;
      }
    }

    const seededVariables: Record<string, unknown> = { ...contactSeed };
    if (initialVariables && typeof initialVariables === 'object') {
      // Só sobrescreve o seed com valor de verdade: process-scheduled-messages e
      // trigger-campaign-on-tag mandam name: contact?.name, que vem null quando o
      // contato não tem nome salvo — e um null do chamador não pode apagar o seed.
      for (const [key, value] of Object.entries(initialVariables)) {
        if (value === undefined || value === null || value === '') continue;
        seededVariables[key] = value;
      }
    }

    // Start background execution
    const executionPromise = (async () => {
      try {
        // Retomada de atraso: herda a raiz da execução anterior para que todos os
        // trechos continuem sendo a MESMA passagem no histórico. Se a anterior
        // sumiu (retenção/exclusão), esta vira raiz de si mesma — jornada mais
        // curta é melhor do que jornada órfã.
        let rootExecutionId: string | null = null;
        if (resumedFromExecutionId) {
          const { data: previous } = await supabase
            .from('flow_executions')
            .select('root_execution_id')
            .eq('id', resumedFromExecutionId)
            .maybeSingle();
          rootExecutionId = previous?.root_execution_id || resumedFromExecutionId;
        }

        // 4. Create flow execution record
        const { data: execution, error: execError } = await supabase
          .from('flow_executions')
          .insert({
            flow_id: flowId,
            conversation_id: conversationId,
            organization_id: sendOrganizationId,
            status: 'running',
            current_node_id: startNodeId || 'start-1',
            variables: seededVariables,
            resumed_from_execution_id: resumedFromExecutionId || null,
            // Insert sem raiz é preenchido pelo trigger do banco com o próprio id.
            ...(rootExecutionId ? { root_execution_id: rootExecutionId } : {}),
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
          variables: { ...seededVariables },
          organizationId: sendOrganizationId,
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
    .select('id, flow_id, current_node_id, status, variables')
    .eq('conversation_id', conversationId)
    .neq('id', executionId)
    // waiting_delay também é fluxo vivo (pai parado num atraso inteligente):
    // sem isso, o fim de um sub-fluxo jogaria a conversa para 'humano' e
    // mataria o pai que só estava esperando a hora de continuar.
    .in('status', ['running', 'waiting_input', 'waiting_delay'])
    // Entre vários fluxos vivos, o mais recente é o candidato a pai — um fluxo
    // antigo esquecido não pode sequestrar a volta do sub-fluxo.
    .order('started_at', { ascending: false })
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
        service_mode: 'ativo',
        ai_agent_id: null,
        metadata: cleanMetadata,
      })
      .eq('id', conversationId);

    console.log(`[FLOW EXECUTE] Flow ended — reset service_mode to ativo, cleared ai_agent_id`);
  } else {
    await resumeParentFlow(supabase, conversationId, executionId, otherActiveFlows[0] as ParentExecution);
  }

  await supabase
    .from('flows')
    .update({ triggers_count: (flow.triggers_count || 0) + 1 })
    .eq('id', flow.id);
}

interface ParentExecution {
  id: string;
  flow_id: string;
  current_node_id: string | null;
  status: string;
  variables: Record<string, unknown> | null;
}

/**
 * Sub-fluxo terminou e o fluxo pai está parado esperando por ele. Este é o
 * caminho de volta — o nó "Disparar fluxo" com "Aguardar resposta" ligado diz,
 * na própria tela, "Pausa o orquestrador até o fluxo terminar".
 *
 * Nunca funcionou. O corpo antigo mandava `resumeExecutionId`, chave que o
 * flow-execute não lê, e omitia `flowId` — a chamada batia no 400 logo na
 * entrada do handler e morria calada, sem erro em log nenhum. Na prática o pai
 * ficava pendurado até o timeout de 24h, ou até o contato mandar outra mensagem
 * por conta própria: aí o zapi-webhook o destravava pela aresta 'responded', e
 * foi isso que mascarou o bug esse tempo todo.
 */
async function resumeParentFlow(
  supabase: SupabaseClientType,
  conversationId: string,
  subExecutionId: string,
  parentExec: ParentExecution,
) {
  // Sem "Aguardar resposta" o pai não parou: seguiu sozinho logo depois de
  // disparar o sub-fluxo. Retomar aqui reexecutaria o trecho inteiro.
  if (parentExec.status !== 'waiting_input') {
    console.log(`[FLOW EXECUTE] Pai ${parentExec.id} não está pausado (status=${parentExec.status}) — nada a retomar.`);
    return;
  }

  const { data: parentFlow } = await supabase
    .from('flows')
    .select('nodes, edges')
    .eq('id', parentExec.flow_id)
    .maybeSingle();

  const parentNodes = (parentFlow?.nodes || []) as FlowNode[];
  const parentEdges = (parentFlow?.edges || []) as FlowEdge[];
  const parkedNode = parentNodes.find(n => n.id === parentExec.current_node_id);

  // Só o nó de sub-fluxo devolve o controle assim. Um pai parado num
  // content-block ou num ai-handoff espera o CONTATO, não o sub-fluxo — e
  // acordá-lo aqui atropelaria a resposta que ainda vai chegar.
  if (parkedNode?.type !== 'action-flow' && parkedNode?.type !== 'orch-flow') {
    console.log(`[FLOW EXECUTE] Pai ${parentExec.id} parado num ${parkedNode?.type || 'nó desconhecido'} — não é espera de sub-fluxo.`);
    return;
  }

  const nextEdge =
    parentEdges.find(e => e.source === parkedNode.id && e.sourceHandle === 'responded') ||
    parentEdges.find(e => e.source === parkedNode.id && !e.sourceHandle) ||
    parentEdges.find(e => e.source === parkedNode.id);

  // O que o sub-fluxo coletou volta para o pai. É o que faz um sub-fluxo de
  // triagem compartilhado valer a pena: ele pergunta, o pai usa a resposta.
  const { data: subExec } = await supabase
    .from('flow_executions')
    .select('variables')
    .eq('id', subExecutionId)
    .maybeSingle();

  // Fecha a execução do pai: o flow-execute não continua uma execução, ele cria
  // outra. resumedFromExecutionId mantém as duas na mesma passagem do contato.
  await supabase.from('flow_executions').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    timeout_at: null,
    remarketing_step: 0,
  }).eq('id', parentExec.id);

  if (!nextEdge?.target) {
    console.log(`[FLOW EXECUTE] Nó ${parkedNode.id} não tem saída ligada — o fluxo pai termina aqui.`);
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
      .update({ service_mode: 'ativo', ai_agent_id: null, metadata: cleanMetadata })
      .eq('id', conversationId);
    return;
  }

  await resumeFlow({
    flowId: parentExec.flow_id,
    conversationId,
    startNodeId: nextEdge.target,
    variables: parentExec.variables || {},
    extraVariables: (subExec?.variables || {}) as Record<string, unknown>,
    resumedFromExecutionId: parentExec.id,
    reason: 'sub-fluxo terminou, retomando o pai',
  });
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

      // ESPERA LONGA (atraso inteligente, ou atraso comum acima de 30s): para a
      // execução e agenda a retomada JÁ NO PRÓXIMO NÓ. Guardar o nó de atraso
      // faria o cron reexecutá-lo e reagendar de novo, prendendo o contato num
      // laço infinito de espera.
      if (result.resumeAt) {
        if (!nextNodeId) {
          console.log(`[FLOW EXECUTE] Node ${currentNode.id} (${currentNode.type}) has NO connected next node — flow STOPS`);
          currentNodeId = null;
          break;
        }

        console.log(`[FLOW EXECUTE] Delay: parking execution until ${result.resumeAt.toISOString()}, resuming at node ${nextNodeId}`);

        await supabase
          .from('flow_executions')
          .update({
            status: 'waiting_delay',
            current_node_id: nextNodeId,
            timeout_at: result.resumeAt.toISOString(),
            variables: context.variables,
            execution_log: executionLog,
            remarketing_step: 0,
          })
          .eq('id', executionId);
        return;
      }
      
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
  // Espera longa (atraso inteligente): a execução para aqui e o cron
  // process-flow-timeouts retoma no nó seguinte quando a hora chegar.
  // Não dá para usar setTimeout: a edge function morre antes.
  resumeAt?: Date;
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
  const logId = await logNodeExecution(supabase, context, node, executionId);
  const nodeStartedAt = Date.now();

  try {
    const result = await runNodeByType(type, data, node, context, supabase, flow, executionId);
    await finishNodeLog(
      supabase,
      logId,
      result.success ? 'success' : 'failed',
      nodeStartedAt,
      result.error,
    );
    return result;
  } catch (err) {
    // Exceção crua do nó: marca no log e repassa para runFlowExecution, que já
    // sabe encerrar a execução.
    await finishNodeLog(supabase, logId, 'error', nodeStartedAt, String(err));
    throw err;
  }
}

async function runNodeByType(
  type: string,
  data: Record<string, unknown>,
  node: FlowNode,
  context: ExecutionContext,
  supabase: SupabaseClientType,
  flow?: any,
  executionId?: string
): Promise<NodeResult> {
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

    case 'smart-delay':
      return executeSmartDelay(data, context);

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
      return await executeAIReturn(context, supabase);

    case 'action-flow':
      return await executeSubFlow(data, context, supabase);

    case 'action-document':
      return await executeDocumentAction(data, context, supabase, flow);

    case 'action-transfer':
    case 'orch-human':
      return await executeTransfer(data, context, supabase);

    case 'action-contact-field':
      return await executeContactFieldAction(data, context, supabase);

    case 'action-generate-pdf':
      return await executeGeneratePdfAction(data, context);

    case 'action-workspace':
      return await executeWorkspaceAssignment(data, context, supabase);

    case 'action-whatsapp-group':
      return await executeWhatsAppGroupMessage(data, context, supabase);

    default:
      console.log(`Unknown node type: ${type}`);
      return { success: true };
  }
}

// Grava respostas do fluxo nos campos personalizados do contato.
//
// O contrario ja existia desde sempre: o inicio da execucao SEMEIA as
// variaveis a partir de contacts.metadata.custom_fields. Faltava o caminho de
// volta — sem ele, tudo o que o cliente respondia ficava preso em
// flow_executions.variables e sumia para o resto do sistema.
async function executeContactFieldAction(
  data: Record<string, unknown>,
  context: ExecutionContext,
  supabase: SupabaseClientType
): Promise<NodeResult> {
  const assignments = Array.isArray(data.assignments) ? data.assignments : [];
  if (assignments.length === 0) {
    return { success: true, metadata: { skipped: 'no_assignments' } };
  }
  if (!context.contactId) {
    return { success: true, metadata: { skipped: 'no_contact' } };
  }

  const values: Record<string, string> = {};
  for (const raw of assignments) {
    const item = (raw || {}) as Record<string, unknown>;
    const key = String(item.fieldKey || '').trim();
    // Mesma regra do CHECK de contact_custom_fields.key. Chave fora do formato
    // seria gravada mas nunca voltaria como {{chave}}, porque o replace so casa
    // \w+ — melhor ignorar do que sujar o metadata em silencio.
    if (!key || !/^[a-z][a-z0-9_]*$/.test(key)) continue;

    const value = replaceVariables(String(item.value ?? ''), context.variables).trim();
    // Variavel nao preenchida vira string vazia depois do replace. Gravar isso
    // APAGARIA o que o contato ja tinha (importacao de planilha, fluxo
    // anterior), entao vazio nao escreve.
    if (!value) continue;

    values[key] = value;
  }

  if (Object.keys(values).length === 0) {
    return { success: true, metadata: { skipped: 'no_values' } };
  }

  try {
    // RPC em vez de ler-mesclar-regravar aqui: metadata guarda tambem note e
    // phone_aliases, e a mescla no cliente perde escrita concorrente.
    const { error } = await supabase.rpc('merge_contact_custom_fields', {
      _contact_id: context.contactId,
      _values: values,
    });

    if (error) {
      console.error('[FLOW EXECUTE] action-contact-field error:', error.message);
      return { success: false, error: error.message };
    }

    console.log(`[FLOW EXECUTE] Saved ${Object.keys(values).join(', ')} on contact ${context.contactId}`);

    // Devolvido como variaveis tambem: os nos seguintes desta mesma passagem
    // passam a ver {{chave}} com o valor recem-gravado.
    return { success: true, variables: values, metadata: { savedFields: Object.keys(values) } };
  } catch (error) {
    console.error('[FLOW EXECUTE] action-contact-field error:', error);
    return { success: false, error: String(error) };
  }
}

// Pega um texto que ja esta numa variavel do fluxo e devolve um PDF.
//
// O motor (generate-document-pdf) sempre existiu, mas so o no action-document
// falava com ele — e action-document e outra coisa: coleta campos do lead e
// preenche um template cadastrado. Aqui a entrada e texto solto, tipicamente o
// que a IA escreveu e gravou com save_contact_field antes de devolver o fluxo.
//
// Sai em bucket PUBLICO (visibility: 'public'): o destino natural do PDF e ser
// enviado no WhatsApp, e quem baixa a URL e a Evolution/UAZAPI, sem credencial
// nenhuma. contact-files virou privado em 20260715120000 e daria 403 la.
async function executeGeneratePdfAction(
  data: Record<string, unknown>,
  context: ExecutionContext
): Promise<NodeResult> {
  const content = replaceVariables(String(data.content ?? ''), context.variables).trim();

  // Vazio nao gera. Mesma regra do action-contact-field: variavel nao
  // preenchida vira string vazia depois do replace, e um PDF de uma pagina em
  // branco e pior do que PDF nenhum — o no seguinte mandaria o anexo do mesmo
  // jeito, e o destinatario abriria o nada.
  if (!content) {
    console.log('[FLOW EXECUTE] action-generate-pdf: content vazio apos interpolacao, nada gerado');
    return { success: true, metadata: { skipped: 'empty_content' } };
  }

  const documentName =
    replaceVariables(String(data.documentName ?? ''), context.variables).trim() || 'documento';
  const logoUrl = replaceVariables(String(data.logoUrl ?? ''), context.variables).trim();

  // A variavel volta para o fluxo como {{nome}}, e o replace so casa \w+.
  // Nome fora disso seria gravado e nunca mais lido — melhor cair no padrao.
  const rawVariable = String(data.saveUrlToVariable ?? '').trim();
  const targetVariable = /^\w+$/.test(rawVariable) ? rawVariable : 'pdf_url';

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const response = await fetch(`${supabaseUrl}/functions/v1/generate-document-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
      body: JSON.stringify({
        template_content: content,
        document_name: documentName,
        logo_url: logoUrl || null,
        // Sem campos: o gerador roda fillTemplate sobre o conteudo, e uma lista
        // vazia deixa {{...}} que tenha sobrado no texto exatamente como esta,
        // em vez de apagar.
        fields: [],
        filled_data: {},
        visibility: 'public',
        organization_id: context.organizationId,
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.pdf_url) {
      const message = result?.error || `generate-document-pdf respondeu ${response.status}`;
      console.error('[FLOW EXECUTE] action-generate-pdf error:', message);
      // Ao contrario do action-webhook, aqui falhar PARA o fluxo. Seguir faria o
      // content-block seguinte enviar um documento com mediaUrl vazia: o cliente
      // receberia uma mensagem quebrada em vez de nao receber nada, e ninguem
      // ficaria sabendo. O executor marca a execucao como failed e chama
      // cleanupFlowEnd, entao a conversa nao fica presa.
      return { success: false, error: `Falha ao gerar PDF: ${message}` };
    }

    console.log(`[FLOW EXECUTE] action-generate-pdf: "${documentName}" gerado em {{${targetVariable}}}`);

    return {
      success: true,
      variables: { [targetVariable]: result.pdf_url },
      metadata: { documentName, variable: targetVariable },
    };
  } catch (error) {
    console.error('[FLOW EXECUTE] action-generate-pdf error:', error);
    return { success: false, error: String(error) };
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
    //
    // Interpolado como qualquer no de mensagem. Ia cru para o prompt do agente,
    // entao uma instrucao do tipo "confirme a inscricao para {{evento_cidade}}"
    // chegava com as chaves literais e a IA nao tinha como saber de que edicao
    // estava falando — justamente o dado que o fluxo acabou de coletar.
    const additionalPrompt = replaceVariables(
      String(data.additionalPrompt || data.contextMessage || ''),
      context.variables,
    );
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

/**
 * "Retorna ao Fluxo" (ai-return): encerra o turno da IA e devolve o controle
 * para o grafo, que continua nos nós seguintes.
 *
 * Antes era um no-op (`return { success: true }`), o que enganava: o fluxo
 * seguia, mas a conversa continuava com `ai_agent_id` e `ai_handoff_context`
 * gravados. Uma mensagem que chegasse com o fluxo parado fora de um nó de
 * handoff ainda achava o agente no lugar e voltava para o orquestrador.
 *
 * Não mexe em `ai_paused_until`: aqui a IA sai de cena por decisão do fluxo,
 * e um `ai-handoff` mais à frente pode legitimamente reassumir. Quem quer
 * silenciar a IA de vez usa o "Encerrar a IA" do nó de Escalação Humana.
 */
async function executeAIReturn(
  context: ExecutionContext,
  supabase: SupabaseClientType
): Promise<NodeResult> {
  try {
    const { data: convData } = await supabase
      .from('conversations')
      .select('metadata')
      .eq('id', context.conversationId)
      .single();

    const cleanMetadata = { ...((convData?.metadata as Record<string, unknown>) || {}) };
    delete cleanMetadata.ai_handoff_context;

    await supabase.from('conversations').update({
      service_mode: 'ativo',
      ai_agent_id: null,
      metadata: cleanMetadata,
    }).eq('id', context.conversationId);

    console.log('[FLOW EXECUTE] AI Return: handoff encerrado, fluxo continua nos nós seguintes');
    return { success: true, metadata: { aiReturned: true } };
  } catch (error) {
    console.error('[FLOW EXECUTE] AI Return error:', error);
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
  // Herda por padrão: fluxo já desenhado não tem a chave e precisa passar a herdar.
  const inheritVariables = data.inheritVariables !== false;
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
        // O sub-fluxo é a MESMA conversa com o MESMO lead: as variáveis são sobre
        // a pessoa, não sobre o fluxo. Sem herdar, um sub-fluxo de triagem começa
        // cego e quem desenhou o fluxo passa a tarde atrás de {{variavel}} vazia.
        // O risco é colisão de nome (o pai atropelando um nome igual no filho) —
        // para isso existe o desligador no nó.
        ...(inheritVariables ? { variables: context.variables } : {}),
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
    // Desligado por padrão: fluxo já desenhado não tem a chave e não pode
    // mudar de comportamento sozinho.
    const stopAI = data.stopAI === true;

    // 1) Update conversation: switch to human mode and apply assignment/department
    const updateData: Record<string, unknown> = { service_mode: 'ativo' };
    if (departmentId) updateData.department_id = departmentId;
    if (assignedUserId) updateData.assigned_to = assignedUserId;

    // 1b) "Encerrar a IA": service_mode='ativo' sozinho NÃO cala a IA.
    // checkMasterPromptTriggers (zapi-webhook) volta o modo para 'ia' na
    // primeira mensagem que bater numa keyword/tag de master prompt — o
    // cliente é transferido, responde "orçamento", e a IA reassume por cima
    // do atendente. O único freio que o webhook respeita antes disso é
    // ai_paused_until (isAIPaused), então é ele que precisa ser gravado.
    if (stopAI) {
      const { data: convData } = await supabase
        .from('conversations')
        .select('metadata')
        .eq('id', context.conversationId)
        .single();

      const metadata = { ...((convData?.metadata as Record<string, unknown>) || {}) };
      delete metadata.ai_handoff_context;
      metadata.ai_paused_until = 'permanent';

      updateData.ai_agent_id = null;
      updateData.metadata = metadata;
    }

    await supabase.from('conversations').update(updateData).eq('id', context.conversationId);
    console.log('[FLOW EXECUTE] Transferred to human', { assignedUserId, departmentId, notifyCount: notifyUserIds.length, stopAI });

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

    return { success: true, metadata: { transferred: true, departmentId, assignedUserId, notifiedUsers: notifyUserIds.length, stopAI } };
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

  if (context.provider === 'evolution' && (!context.evolutionBaseUrl || !context.evolutionApiKey || !context.evolutionInstanceName)) {
    console.log('[FLOW EXECUTE] Evolution not configured for handoff notifications');
    return;
  }

  if (context.provider === 'uazapi' && (!context.uazapiBaseUrl || !context.zapiToken)) {
    console.log('[FLOW EXECUTE] UAZAPI not configured for handoff notifications');
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
      const res = context.provider === 'evolution'
        ? await fetch(`${context.evolutionBaseUrl}/message/sendText/${context.evolutionInstanceName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: context.evolutionApiKey! },
          body: JSON.stringify({ number: normalized, text: message, delay: 1000, linkPreview: false }),
        })
        : await fetch(`${context.uazapiBaseUrl}/send/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', token: context.zapiToken },
          body: JSON.stringify({ number: normalized, text: message }),
        });
      console.log('[FLOW EXECUTE] Notification sent to', recipient.full_name, '->', res.status);
    } catch (err) {
      console.error('[FLOW EXECUTE] Notification send failed for', recipient.full_name, err);
    }
  }
}

// Execute Content Block - processes multiple items sequentially
// Sends one or more content items to a WhatsApp group JID (e.g. 120363...@g.us).
// Uses the shared provider sender with isGroup:true so the JID is preserved.
async function executeWhatsAppGroupMessage(
  data: Record<string, unknown>,
  context: ExecutionContext,
  supabase: SupabaseClientType,
): Promise<NodeResult> {
  const groupJid = String(data.groupJid || '');
  if (!groupJid) {
    console.log('[FLOW EXECUTE] action-whatsapp-group: no groupJid configured');
    return { success: true, metadata: { skipped: 'no_group_jid' } };
  }

  const items = (data.items as ContentItem[]) || [];
  if (items.length === 0) return { success: true };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      if (item.type === 'delay') {
        const delaySeconds = item.delaySeconds || 3;
        await new Promise(resolve => setTimeout(resolve, Math.min(delaySeconds * 1000, 30000)));
        continue;
      }

      let text: string | null = null;
      let mediaUrl: string | null = null;
      let caption: string | null = null;
      let type: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';

      if (item.type === 'text') {
        if (!item.content) continue;
        text = replaceVariables(item.content, context.variables);
        type = 'text';
      } else if (['image', 'video', 'audio', 'document'].includes(item.type)) {
        // Interpolado como o texto e a legenda. Sem isso, um {{pdf_url}} vindo do
        // no de gerar PDF sairia literal para o provedor.
        const resolvedUrl = item.mediaUrl ? replaceVariables(item.mediaUrl, context.variables).trim() : '';
        if (!resolvedUrl) {
          if (item.mediaUrl) {
            console.log(`[FLOW EXECUTE] group ${item.type}: mediaUrl "${item.mediaUrl}" ficou vazia apos interpolacao, item ignorado`);
          }
          continue;
        }
        type = item.type as typeof type;
        mediaUrl = resolvedUrl;
        caption = item.caption ? replaceVariables(item.caption, context.variables) : null;
      } else {
        continue;
      }

      const result = await sendWhatsAppMessage(supabase, {
        organizationId: context.organizationId,
        phone: groupJid,
        isGroup: true,
        text,
        type,
        mediaUrl,
        caption,
      });

      if (!result.ok) {
        return {
          success: false,
          error: `Falha ao enviar para grupo (${result.provider} ${result.status}): ${result.responseText.slice(0, 200)}`,
        };
      }

      // Small delay between items to avoid rate limiting
      if (i < items.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    } catch (error) {
      console.error('[FLOW EXECUTE] Error sending group content item:', error);
      return { success: false, error: `Failed to send group item: ${error}` };
    }
  }

  return { success: true };
}

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

      // A legenda e o texto sempre passaram pelo replaceVariables, a URL nao:
      // um {{pdf_url}} configurado no bloco de Documento ia LITERAL para o
      // provedor. Interpolado aqui, antes da guarda, para que variavel sem valor
      // (URL vazia) pule o item em vez de mandar um anexo quebrado.
      const rawMediaUrl = item.mediaUrl;
      const mediaUrl = rawMediaUrl ? replaceVariables(rawMediaUrl, context.variables).trim() : '';
      if (rawMediaUrl && !mediaUrl) {
        console.log(`[FLOW EXECUTE] content ${item.type}: mediaUrl "${rawMediaUrl}" ficou vazia apos interpolacao, item ignorado`);
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
          if (mediaUrl) {
            await sendPresence('typing', context);
            await new Promise(resolve => setTimeout(resolve, 1500));
            await sendMediaItem('image', mediaUrl, item.caption, context, supabase, node?.id);
          }
          break;

        case 'video':
          if (mediaUrl) {
            await sendPresence('typing', context);
            await new Promise(resolve => setTimeout(resolve, 1500));
            await sendMediaItem('video', mediaUrl, item.caption, context, supabase, node?.id);
          }
          break;

        case 'audio':
          if (mediaUrl) {
            // Send RECORDING presence before audio to simulate recording
            await sendPresence('recording', context);
            await new Promise(resolve => setTimeout(resolve, 2000));
            await sendMediaItem(
              'audio',
              mediaUrl,
              undefined,
              context,
              supabase,
              node?.id,
              item.saveTranscription ? item.transcription : undefined
            );
          }
          break;

        case 'document':
          if (mediaUrl) {
            await sendPresence('typing', context);
            await new Promise(resolve => setTimeout(resolve, 1500));
            await sendMediaItem('document', mediaUrl, item.caption, context, supabase, node?.id);
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
  nodeId?: string,
  savedTranscription?: string
): Promise<void> {
  const normalizedPhone = context.contactPhone.replace(/\D/g, '');
  const processedCaption = caption ? replaceVariables(caption, context.variables) : undefined;
  const processedTranscription = savedTranscription ? replaceVariables(savedTranscription, context.variables).trim() : '';

  console.log(`[FLOW EXECUTE] sendMediaItem: provider=${context.provider}, type=${mediaType}, file=${mediaUrl?.substring(0, 80)}`);

  let response: Response;
  if (context.provider === 'evolution') {
    if (!context.evolutionBaseUrl || !context.evolutionApiKey || !context.evolutionInstanceName) {
      throw new Error('Evolution API not configured for flow execution');
    }
    const body: Record<string, unknown> = mediaType === 'audio'
      ? {
        number: normalizedPhone,
        audio: mediaUrl,
        delay: 1000,
        linkPreview: true,
      }
      : {
        number: normalizedPhone,
        mediatype: mediaType,
        mimetype: guessMimeType(mediaType, mediaUrl),
        caption: processedCaption,
        media: mediaUrl,
        fileName: fileNameFromUrl(mediaUrl, `${mediaType}-${Date.now()}`),
        delay: 1000,
        linkPreview: true,
      };
    const endpoint = mediaType === 'audio'
      ? `${context.evolutionBaseUrl}/message/sendWhatsAppAudio/${context.evolutionInstanceName}`
      : `${context.evolutionBaseUrl}/message/sendMedia/${context.evolutionInstanceName}`;
    response = await fetch(endpoint, {
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
  let sendError: string | null = null;

  if (!response.ok) {
    const error = await response.text();
    console.error(`[FLOW EXECUTE] Failed to send ${mediaType}. Status: ${response.status}, Error: ${error}`);
    // Don't throw — still save to DB, but marked as failed so the UI shows it
    sendError = (error || `Provider returned ${response.status}`).slice(0, 500);
  } else {
    zapiMessageId = await parseProviderMessageId(response);
    console.log(`[FLOW EXECUTE] ${mediaType} sent successfully via ${context.provider} (ID: ${zapiMessageId})`);
  }

  // Save media message to database so it appears in the UI immediately
  try {
    const { data: savedMessage, error: messageError } = await supabase.from('messages').insert({
      conversation_id: context.conversationId,
      content: processedCaption || null,
      type: mediaType,
      direction: 'outbound',
      is_from_bot: !!context.isFromOrchestrator,
      media_url: mediaUrl,
      zapi_message_id: zapiMessageId,
      ...(sendError ? { failed_at: new Date().toISOString(), error_message: sendError } : {}),
      metadata: {
        source: 'flow_execute',
        provider: context.provider,
        type: mediaType,
        is_from_orchestrator: !!context.isFromOrchestrator,
        node_id: nodeId,
        flow_id: context.flowId,
        has_fixed_transcription: mediaType === 'audio' && !!processedTranscription,
        ...(sendError ? { send_error: sendError } : {})
      },
    }).select('id').single();

    if (messageError) throw messageError;

    if (mediaType === 'audio' && processedTranscription && savedMessage?.id) {
      const { error: transcriptionError } = await supabase.from('media_transcriptions').upsert({
        message_id: savedMessage.id,
        media_url: mediaUrl,
        media_type: mediaType,
        transcription: processedTranscription,
      });
      if (transcriptionError) {
        console.error('[FLOW EXECUTE] Failed to save audio transcription:', transcriptionError);
      } else {
        console.log('[FLOW EXECUTE] Saved fixed audio transcription from flow node');
      }
    }
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
    const title = replaceVariables(String(data.title || ''), context.variables).trim();
    const footer = replaceVariables(String(data.footer || ''), context.variables).trim();

    if (!content || buttons.length === 0) {
      return { success: true };
    }

    const normalizedPhone = context.contactPhone.replace(/\D/g, '');

    // Só a Evolution tem campo próprio de título/rodapé; nos outros caminhos eles
    // entram no corpo do texto para não sumirem.
    const composedContent = [title ? `*${title}*` : '', content, footer].filter(Boolean).join('\n\n');

    // Build fallback text (always included in body for devices that don't render buttons)
    const buttonsText = buttons.map((b, i) => `${i + 1}. ${b.label}`).join('\n');
    const fallbackMessage = `${composedContent}\n\n${buttonsText}`;

    let response: Response;
    let sentNativeButtons = false;

    if (context.provider === 'evolution') {
      // Botão nativo via /message/sendButtons. A Evolution monta o corpo como
      // "*título*\n\ndescrição", então a primeira linha do texto do nó vira o
      // título quando não há um título próprio configurado.
      const target = evolutionTargetFrom(context.evolutionBaseUrl, context.evolutionApiKey, context.evolutionInstanceName);

      if (target && buttons.length <= MAX_EVOLUTION_REPLY_BUTTONS) {
        try {
          const nativeResponse = await sendEvolutionReplyButtons(target, {
            phone: normalizedPhone,
            text: content,
            title,
            footer,
            buttons,
          });

          const accepted = await evolutionButtonsAccepted(nativeResponse);
          if (accepted.ok) {
            response = nativeResponse;
            sentNativeButtons = true;
            console.log('[FLOW EXECUTE] Native Evolution buttons sent successfully');
          } else {
            console.log(`[FLOW EXECUTE] Native Evolution buttons failed (${accepted.detail}), falling back to text`);
          }
        } catch (nativeErr) {
          console.log(`[FLOW EXECUTE] Native Evolution buttons exception: ${nativeErr}, falling back to text`);
        }
      } else if (!target) {
        return { success: false, error: 'Evolution API not configured for native buttons' };
      } else {
        console.log(`[FLOW EXECUTE] ${buttons.length} buttons > ${MAX_EVOLUTION_REPLY_BUTTONS}, using text fallback`);
      }

      if (!sentNativeButtons) {
        // Fallback: a lista numerada no corpo do texto, que o casamento da
        // resposta no webhook também aceita.
        await sendTextMessage(fallbackMessage, context, createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), nodeId);
        return { success: true, waitForInput: true };
      }
    } else if (!context.uazapiBaseUrl) {
      return { success: false, error: 'UAZAPI not configured for native buttons' };
    } else if (buttons.length <= 3) {
      // Try native UAZAPI buttons first (WhatsApp renders at most 3 reply buttons)
      try {
        // /send/menu é o endpoint unificado (button/list/poll). Cada opção vai como
        // "rótulo|id" — o pipe é o separador, então some com ele no rótulo.
        const nativeBody = {
          number: normalizedPhone,
          type: 'button',
          text: composedContent,
          choices: buttons.map((b, i) => `${String(b.label || '').replace(/\|/g, '/')}|btn_${i}`),
        };

        console.log(`[FLOW EXECUTE] Trying native buttons via /send/menu: ${JSON.stringify(nativeBody)}`);

        const nativeResponse = await fetch(`${context.uazapiBaseUrl}/send/menu`, {
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
        content: sentNativeButtons ? composedContent : fallbackMessage,
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
    // (Na Evolution, /message/sendList continua estourando 400
    // "this.isZero is not a function" — só os botões têm caminho nativo.)
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

// Teto do que dá para esperar bloqueando dentro da edge function. Acima disso a
// espera precisa ser parqueada no banco, senão a função morre antes da hora.
const INLINE_DELAY_MAX_MS = 30000;

async function executeDelay(data: Record<string, unknown>): Promise<NodeResult> {
  const duration = Number(data.duration) || 3;
  const unit = String(data.unit) || 'seconds';

  let ms = duration * 1000;
  if (unit === 'minutes') ms = duration * 60 * 1000;
  if (unit === 'hours') ms = duration * 60 * 60 * 1000;

  // ESPERA LONGA: antes isto era `ms = Math.min(ms, 30000)` — quem configurava
  // 2 horas recebia 30 segundos, sem aviso nenhum. O atraso simplesmente não
  // acontecia e o fluxo seguia direto. Agora a espera longa é parqueada no banco
  // e o cron retoma na hora certa, igual ao Atraso Inteligente.
  if (ms > INLINE_DELAY_MAX_MS) {
    const resumeAt = new Date(Date.now() + ms);
    console.log(`[FLOW EXECUTE] Delay of ${duration} ${unit} exceeds inline limit — parking until ${resumeAt.toISOString()}`);
    return { success: true, resumeAt };
  }

  // Espera curta continua bloqueando: é o que dá o ritmo natural entre mensagens
  // e não vale o custo de uma volta pelo cron.
  await new Promise(resolve => setTimeout(resolve, ms));
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// ATRASO INTELIGENTE (smart-delay)
// Diferente do action-delay (que espera uma duração fixa), aqui a espera é
// calculada a partir de horário comercial / hora do dia. Nos dois casos a
// espera longa não bloqueia: devolvemos o instante da retomada e o motor
// parqueia a execução para o cron acordar.
// Todo o cálculo de horário é feito no fuso de São Paulo, que é o que o
// usuário vê e configura no editor do fluxo.
// ═══════════════════════════════════════════════════════════════════════════

const FLOW_TIMEZONE = 'America/Sao_Paulo';

// Partes da data/hora local de São Paulo para um instante UTC qualquer.
function getSaoPauloParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: FLOW_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
    hour12: false,
  }).formatToParts(date);

  const get = (t: string) => parts.find(p => p.type === t)?.value || '0';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    // Intl devolve "24" para meia-noite em hourCycle h23/h24; normalizamos.
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: weekdayMap[get('weekday')] ?? 0,
  };
}

// Offset do fuso (em minutos) vigente naquele instante — respeita horário de verão.
function getSaoPauloOffsetMinutes(date: Date): number {
  const p = getSaoPauloParts(date);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  // Zera segundos/ms para não introduzir ruído no arredondamento.
  const base = Math.floor(date.getTime() / 60000) * 60000;
  return (asUTC - base) / 60000;
}

// Converte uma data/hora "de parede" de São Paulo para o instante UTC correto.
function saoPauloWallClockToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Primeira estimativa com o offset vigente na data alvo, depois refina uma vez
  // (cobre a virada de horário de verão perto do instante calculado).
  let offset = getSaoPauloOffsetMinutes(new Date(naiveUtc));
  let result = new Date(naiveUtc - offset * 60000);
  const refined = getSaoPauloOffsetMinutes(result);
  if (refined !== offset) {
    offset = refined;
    result = new Date(naiveUtc - offset * 60000);
  }
  return result;
}

function parseHHMM(value: unknown, fallback: string): { hour: number; minute: number } {
  const [fh, fm] = fallback.split(':').map(Number);
  const [h, m] = String(value || fallback).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return { hour: fh, minute: fm };
  }
  return { hour: h, minute: m };
}

// Sem hora no texto, 09:00: a espera existe para disparar mensagem, e meia-noite
// seria a hora errada de chegar no WhatsApp de alguém.
const DATE_ONLY_FALLBACK_HOUR = 9;

// Monta o instante a partir de uma data de PAREDE de São Paulo, recusando o que
// não existe no calendário.
function buildSaoPauloTarget(
  year: number,
  month: number,
  day: number,
  hourText: string | undefined,
  minuteText: string | undefined,
): Date | null {
  const hour = hourText === undefined ? DATE_ONLY_FALLBACK_HOUR : Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const target = saoPauloWallClockToUtc(year, month, day, hour, minute);
  if (Number.isNaN(target.getTime())) return null;

  // Date.UTC transborda em silêncio: 31/02 vira 03/03. Melhor recusar do que
  // parar o contato até uma data que ninguém escreveu.
  const back = getSaoPauloParts(target);
  if (back.year !== year || back.month !== month || back.day !== day) return null;

  return target;
}

// Aceita o que o input datetime-local manda ("YYYY-MM-DDTHH:mm") e também o que
// costuma vir por variável — planilha, formulário, campo do contato —, onde o
// valor chega em formato brasileiro ou sem hora nenhuma. Formato irreconhecível
// devolve null, e quem chama decide o que fazer.
function parseFlowDate(raw: string): Date | null {
  const value = raw.trim();
  if (!value) return null;

  // Fuso escrito no texto (Z ou ±HH:MM) já diz o instante exato: converter como
  // hora de parede aplicaria o offset duas vezes.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const withZone = new Date(value);
    return Number.isNaN(withZone.getTime()) ? null : withZone;
  }

  // Os dois formatos são ancorados no fim de propósito. Casando só o começo,
  // "20/09/2026 as 19h" casaria a data, a hora escaparia do grupo e o contato
  // esperaria até as 9h sem ninguém entender por quê. Sobrando texto que o
  // parser não entende, é melhor recusar e logar.

  // ISO "AAAA-MM-DD", hora opcional (segundos e milissegundos ignorados).
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?)?$/);
  if (iso) return buildSaoPauloTarget(Number(iso[1]), Number(iso[2]), Number(iso[3]), iso[4], iso[5]);

  // Brasileiro "DD/MM/AAAA", hora opcional. Aceita como as pessoas escrevem:
  // "20/09/2026 19:00", "20/09/2026 às 19h", "20/09/2026, 19h30".
  const br = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\s,]+(?:[aà]s\s+)?(\d{1,2})(?::|h)(\d{2})?(?::\d{2})?h?)?$/i,
  );
  if (br) return buildSaoPauloTarget(Number(br[3]), Number(br[2]), Number(br[1]), br[4], br[5]);

  return null;
}

function executeSmartDelay(data: Record<string, unknown>, context: ExecutionContext): NodeResult {
  const delayType = String(data.delayType || 'fixed');
  const now = new Date();

  try {
    if (delayType === 'fixed') {
      const minutes = Number(data.fixedMinutes);
      const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
      return { success: true, resumeAt: new Date(now.getTime() + safeMinutes * 60 * 1000) };
    }

    if (delayType === 'until_time') {
      const { hour, minute } = parseHHMM(data.time, '09:00');
      const p = getSaoPauloParts(now);
      let target = saoPauloWallClockToUtc(p.year, p.month, p.day, hour, minute);
      // Horário já passou hoje → mesma hora amanhã.
      if (target.getTime() <= now.getTime()) {
        const t = getSaoPauloParts(new Date(now.getTime() + 24 * 60 * 60 * 1000));
        target = saoPauloWallClockToUtc(t.year, t.month, t.day, hour, minute);
      }
      return { success: true, resumeAt: target };
    }

    if (delayType === 'until_business_hours') {
      const start = parseHHMM(data.businessHoursStart, '08:00');
      const end = parseHHMM(data.businessHoursEnd, '18:00');
      const weekdaysOnly = data.weekdaysOnly !== false;

      const startMin = start.hour * 60 + start.minute;
      const endMin = end.hour * 60 + end.minute;

      // Procura o próximo instante dentro da janela comercial. O laço anda no
      // máximo 8 dias, o que cobre feriado prolongado + fim de semana.
      for (let i = 0; i <= 8; i++) {
        const probe = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
        const p = getSaoPauloParts(probe);
        const isWeekend = p.weekday === 0 || p.weekday === 6;
        if (weekdaysOnly && isWeekend) continue;

        const nowMin = p.hour * 60 + p.minute;
        // Hoje, já dentro do expediente → segue imediatamente.
        if (i === 0 && nowMin >= startMin && nowMin < endMin) {
          return { success: true, resumeAt: new Date(now.getTime() + 1000) };
        }
        // Ainda vai abrir neste dia → espera a abertura.
        if (i > 0 || nowMin < startMin) {
          return { success: true, resumeAt: saoPauloWallClockToUtc(p.year, p.month, p.day, start.hour, start.minute) };
        }
        // Passou do fechamento: cai para o próximo dia candidato.
      }

      // Configuração impossível (ex.: só dias úteis com janela inválida).
      console.log('[FLOW EXECUTE] smart-delay: no business-hours slot found in 8 days, continuing immediately');
      return { success: true, resumeAt: new Date(now.getTime() + 1000) };
    }

    if (delayType === 'until_date') {
      // Interpolado como qualquer campo de mensagem. Ia cru, entao {{data_evento}}
      // nao casava com formato nenhum, virava Invalid Date e o no seguia na hora:
      // a espera sumia em silencio. Com a interpolacao, um unico fluxo serve
      // varias datas — a data vem de campo do contato, nao do desenho do fluxo.
      const raw = replaceVariables(String(data.date || ''), context.variables).trim();
      if (!raw) {
        console.log('[FLOW EXECUTE] smart-delay: until_date without a date, continuing immediately');
        return { success: true };
      }
      // O input datetime-local manda "YYYY-MM-DDTHH:mm" sem fuso: é hora de
      // parede de São Paulo, não UTC. Interpretar como UTC adiantaria 3h.
      const target = parseFlowDate(raw);

      if (!target) {
        console.log(`[FLOW EXECUTE] smart-delay: invalid date "${raw}", continuing immediately`);
        return { success: true };
      }
      // Data no passado não trava o fluxo — segue em frente.
      if (target.getTime() <= now.getTime()) {
        console.log(`[FLOW EXECUTE] smart-delay: date ${raw} already passed, continuing immediately`);
        return { success: true };
      }
      return { success: true, resumeAt: target };
    }

    console.log(`[FLOW EXECUTE] smart-delay: unknown delayType "${delayType}", continuing immediately`);
    return { success: true };
  } catch (error) {
    // Um atraso mal configurado não deve matar o fluxo do contato.
    console.error('[FLOW EXECUTE] smart-delay error, continuing immediately:', error);
    return { success: true };
  }
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
    const columnId = String(data.pipelineColumnId || data.columnId || '');
    const pipelineId = String(data.pipelineId || '');
    const columnName = String(data.pipelineColumnName || 'Etapa');
    // 'add' inscreve a conversa neste funil sem tirar dos outros (funil por
    // evento). 'move' (padrao) mantem o comportamento historico do no.
    const placementMode = String(data.pipelineAction || 'move') === 'add' ? 'add' : 'move';

    if (!columnId || !pipelineId) {
      return { success: false, error: 'Pipeline ID or Column ID missing in node data' };
    }

    // 1. Update the status in conversations for legacy/display compatibility
    await supabase
      .from('conversations')
      .update({ status: 'open' }) // Ensure it's open if moved in pipeline
      .eq('id', context.conversationId);

    // 2. Coloca a conversa no funil. No modo 'move' o card sai do funil de
    //    origem; no modo 'add' os outros funis ficam como estao.
    const { fromColumnId, error: moveError } = await moveConversationToPipeline(
      supabase, context.conversationId, pipelineId, columnId, { mode: placementMode },
    );
    if (moveError) throw new Error(moveError);

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

    return { success: true, metadata: { pipelineId, columnId, columnName, mode: placementMode } };
  } catch (error) {
    console.error('[FLOW EXECUTE] Pipeline move error:', error);
    return { success: false, error: String(error) };
  }
}

// Operadores do nó de condição. A tela sempre ofereceu oito; o motor
// implementava cinco, e os três que faltavam (not_contains, exists,
// not_exists) caíam fora do switch e viravam FALSO em silêncio — o fluxo
// pegava o ramo errado sem sinal nenhum de erro. Centralizado aqui para que
// regra de variável, campo do contato e a condição legada usem a mesma tabela.
//
// `exists` é sobre valor PREENCHIDO, não sobre a chave existir: variável
// gravada como "" é, para quem monta o fluxo, o mesmo que não ter resposta.
// is_empty/is_not_empty entram como apelido porque é o nome que o editor de
// quiz usa, e fluxo montado a partir de lá não pode chegar aqui e morrer.
function compareWithOperator(actual: string, operator: string, compareValue: string): boolean {
  const a = actual ?? '';
  const b = compareValue ?? '';

  switch (operator) {
    case 'equals': return a === b;
    case 'not_equals': return a !== b;
    case 'contains': return a.includes(b);
    case 'not_contains': return !a.includes(b);
    case 'greater_than': return Number(a) > Number(b);
    case 'less_than': return Number(a) < Number(b);
    case 'exists':
    case 'is_set':
    case 'is_not_empty': return a.trim() !== '';
    case 'not_exists':
    case 'is_empty': return a.trim() === '';
    default:
      // Operador que o motor não conhece cai em equals, não em false. Um falso
      // silencioso é justamente o que essa função existe para acabar.
      console.warn(`[FLOW EXECUTE] Operador desconhecido "${operator}" na condição — tratando como equals`);
      return a === b;
  }
}

// A tela grava pending|bot|human; o enum service_mode do banco é
// ia|ativo|pendente|arquivado. Nunca bateu — a regra só podia dar falso.
// Aceita os dois lados para não depender de migrar fluxo já salvo.
const SERVICE_MODE_ALIASES: Record<string, string> = {
  pending: 'pendente',
  pendente: 'pendente',
  bot: 'ia',
  ia: 'ia',
  human: 'ativo',
  ativo: 'ativo',
  archived: 'arquivado',
  arquivado: 'arquivado',
};

// Lê um campo do contato pelo nome usado na regra. name/email/phone são colunas
// da tabela; qualquer outra chave é campo personalizado e mora em
// contacts.metadata.custom_fields — o mesmo lugar que save_contact_field grava
// e que o seed de variáveis lê no início da execução. metadata é jsonb, mas
// algum caminho antigo pode ter gravado string JSON, então parseia defensivo
// (mesma defesa do seed lá em cima e da merge_contact_custom_fields).
function readContactFieldValue(contact: Record<string, unknown> | null, field: string): string {
  if (!contact) return '';

  if (field === 'name' || field === 'email' || field === 'phone') {
    const value = contact[field];
    return value === undefined || value === null ? '' : String(value);
  }

  let metadata = contact.metadata as unknown;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = null;
    }
  }

  const custom = (metadata as Record<string, unknown> | null)?.custom_fields;
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return '';

  const value = (custom as Record<string, unknown>)[field];
  return value === undefined || value === null ? '' : String(value);
}

interface ConditionRuleData {
  id: string;
  type: string;
  negate?: boolean;
  tagId?: string;
  pipelineId?: string;
  // A tela grava `columnId`; versões antigas do nó gravavam
  // `pipelineColumnId`. O motor lia SÓ a antiga, então regra de pipeline
  // montada pela tela atual nunca casava. Mesmo fallback que executePipeline
  // já fazia logo acima.
  columnId?: string;
  pipelineColumnId?: string;
  userId?: string;
  variable?: string;
  operator?: string;
  value?: string;
  contactField?: string;
  serviceMode?: string;
}

async function executeCondition(data: Record<string, unknown>, context: ExecutionContext, supabase: SupabaseClientType): Promise<NodeResult> {
  // Support rules-based conditions (tag checks, pipeline checks, etc.)
  const rules = data.rules as ConditionRuleData[] | undefined;
  const matchType = String(data.matchType || 'all'); // 'all' or 'any'

  if (rules && rules.length > 0) {
    console.log(`[FLOW EXECUTE] Condition with ${rules.length} rules, matchType=${matchType}`);

    // Regras de conversa e de contato precisam das linhas inteiras. Carrega uma
    // vez por nó, e só se alguma regra pedir: condição só de tag/variável
    // continua sem query extra nenhuma.
    const needsConversation = rules.some((r) => r.type === 'assigned' || r.type === 'service_mode');
    const needsContact = rules.some((r) => r.type === 'contact_field');

    let conversationRow: Record<string, unknown> | null = null;
    let contactRow: Record<string, unknown> | null = null;

    if (needsConversation) {
      const { data: row } = await supabase
        .from('conversations')
        .select('assigned_to, service_mode')
        .eq('id', context.conversationId)
        .maybeSingle();
      conversationRow = row ?? null;
    }

    if (needsContact) {
      const { data: row } = await supabase
        .from('contacts')
        .select('name, email, phone, metadata')
        .eq('id', context.contactId)
        .maybeSingle();
      contactRow = row ?? null;
    }

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
      } else if (rule.type === 'pipeline') {
        const columnId = rule.columnId || rule.pipelineColumnId || '';

        if (columnId) {
          const { data: position } = await supabase
            .from('conversation_pipeline_positions')
            .select('id')
            .eq('conversation_id', context.conversationId)
            .eq('column_id', columnId)
            .maybeSingle();

          ruleResult = !!position;
          console.log(`[FLOW EXECUTE] Pipeline rule: columnId=${columnId}, match=${ruleResult}`);
        } else if (rule.pipelineId) {
          // "Qualquer etapa" na tela: basta a conversa estar no funil, em
          // qualquer coluna. Não existia no motor — sem coluna escolhida a
          // regra caía fora e dava falso.
          const { data: position } = await supabase
            .from('conversation_pipeline_positions')
            .select('id')
            .eq('conversation_id', context.conversationId)
            .eq('pipeline_id', rule.pipelineId)
            .limit(1)
            .maybeSingle();

          ruleResult = !!position;
          console.log(`[FLOW EXECUTE] Pipeline rule: pipelineId=${rule.pipelineId} (qualquer etapa), match=${ruleResult}`);
        } else {
          console.warn('[FLOW EXECUTE] Pipeline rule sem pipeline nem coluna — ignorada (falso)');
        }
      } else if (rule.type === 'assigned') {
        const assignedTo = (conversationRow?.assigned_to as string | null) ?? null;

        // Sempre avalia na forma POSITIVA ("tem responsável" / "é fulano") e
        // deixa o negate lá embaixo inverter — senão a inversão aconteceria
        // duas vezes. Quando negate está ligado a tela esconde o seletor de
        // usuário e promete "sem responsável", então aqui o userId guardado de
        // uma edição anterior é ignorado de propósito.
        if (rule.negate || !rule.userId) {
          ruleResult = assignedTo !== null;
        } else {
          ruleResult = assignedTo === rule.userId;
        }
        console.log(`[FLOW EXECUTE] Assigned rule: userId=${rule.userId}, assigned_to=${assignedTo}, match=${ruleResult}, negate=${rule.negate}`);
      } else if (rule.type === 'service_mode') {
        const expected = SERVICE_MODE_ALIASES[String(rule.serviceMode || '').toLowerCase()] || '';
        const actual = String(conversationRow?.service_mode ?? '');

        ruleResult = !!expected && actual === expected;
        console.log(`[FLOW EXECUTE] Service mode rule: expected=${expected}, actual=${actual}, match=${ruleResult}, negate=${rule.negate}`);
      } else if (rule.type === 'contact_field') {
        const field = String(rule.contactField || '');
        const actualValue = readContactFieldValue(contactRow, field);
        const operator = rule.operator || 'equals';

        ruleResult = compareWithOperator(actualValue, operator, String(rule.value || ''));
        console.log(`[FLOW EXECUTE] Contact field rule: ${field} ${operator} ${rule.value} (atual="${actualValue}") => ${ruleResult}`);
      } else if (rule.type === 'variable') {
        // Variable comparison
        const actualValue = String(context.variables[rule.variable || ''] ?? '');
        const compareValue = String(rule.value || '');
        const operator = rule.operator || 'equals';

        ruleResult = compareWithOperator(actualValue, operator, compareValue);
        console.log(`[FLOW EXECUTE] Variable rule: ${rule.variable} ${operator} ${compareValue} => ${ruleResult}`);
      } else {
        // Tipo de regra que o motor não conhece. Antes caía aqui em silêncio
        // junto com assigned/contact_field/service_mode; agora pelo menos
        // aparece no log em vez de virar um ramo falso inexplicável.
        console.warn(`[FLOW EXECUTE] Tipo de regra desconhecido "${rule.type}" — avaliada como falso`);
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

  const actualValue = String(context.variables[variable] ?? '');
  const result = compareWithOperator(actualValue, operator, compareValue);

  console.log(`[FLOW EXECUTE] Legacy condition: ${variable} ${operator} ${compareValue} => ${result}`);
  return { success: true, outputHandle: result ? 'true' : 'false' };
}

// Troca {{variavel}} dentro de um JSON escrito à mão no painel. O
// replaceVariables normal não serve aqui: um lead chamado Ze "Grande" Silva
// viraria {"nome": "Ze "Grande" Silva"} e o JSON morre antes de sair. O
// JSON.stringify escapa aspas, barra invertida e quebra de linha; o slice tira
// as aspas que ele põe em volta, porque elas já estão escritas no template.
// Vale só para o body do webhook — mensagem continua com replaceVariables.
function replaceVariablesInJson(text: string, variables: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
    const value = lookupVariable(variables, varName);
    if (value === undefined) return '';
    return JSON.stringify(String(value)).slice(1, -1);
  });
}

// Headers extras do nó: aceita objeto ou JSON em texto. Valor passa pelo
// replaceVariables comum (header não é JSON, não precisa de escape).
function buildWebhookHeaders(raw: unknown, variables: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return headers;
    try {
      parsed = JSON.parse(replaceVariablesInJson(trimmed, variables));
    } catch {
      console.error('[FLOW EXECUTE] Webhook headers inválidos, ignorando:', trimmed);
      return headers;
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return headers;

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!key || value === null || value === undefined) continue;
    headers[key] = replaceVariables(String(value), variables);
  }
  return headers;
}

async function executeWebhook(data: Record<string, unknown>, context: ExecutionContext): Promise<NodeResult> {
  const responsePrefix = String(data.responsePrefix || '');
  const prefixed = (values: Record<string, unknown>): Record<string, unknown> => {
    if (!responsePrefix) return values;
    return Object.fromEntries(Object.entries(values).map(([k, v]) => [`${responsePrefix}${k}`, v]));
  };

  try {
    const url = String(data.webhookUrl || data.url || '');
    const method = String(data.method || 'POST');

    if (!url) {
      return { success: true };
    }

    // Body do nó tem prioridade; vazio mantém o corpo padrão de sempre, para
    // nenhum fluxo que já roda mudar de comportamento.
    const rawBody = typeof data.body === 'string' ? data.body.trim() : '';
    let payload: unknown;

    if (rawBody) {
      const rendered = replaceVariablesInJson(rawBody, context.variables);
      try {
        payload = JSON.parse(rendered);
      } catch (parseError) {
        // Rede de segurança para JSON escrito errado no painel: não manda nada.
        console.error('[FLOW EXECUTE] Webhook body inválido depois das variáveis:', rendered, parseError);
        return { success: true, variables: { webhook_status: '0', webhook_error: 'body inválido' } };
      }
    } else {
      payload = {
        conversationId: context.conversationId,
        contactPhone: context.contactPhone,
        contactId: context.contactId,
        variables: context.variables,
        timestamp: new Date().toISOString(),
      };
    }

    const response = await fetch(url, {
      method,
      headers: buildWebhookHeaders(data.headers, context.variables),
      body: method !== 'GET' ? JSON.stringify(payload) : undefined,
    });

    if (!response.ok) {
      console.error('Webhook failed:', response.status);
    }

    // webhook_status sempre volta: é por ele que o fluxo ramifica quando dá erro.
    const statusVars: Record<string, unknown> = { webhook_status: String(response.status) };

    try {
      const responseData = await response.json();
      if (responseData && typeof responseData === 'object' && !Array.isArray(responseData)) {
        return { success: true, variables: { ...prefixed(responseData as Record<string, unknown>), ...statusVars } };
      }
    } catch {
      // Response is not JSON
    }

    return { success: true, variables: statusVars };
  } catch (error) {
    console.error('Webhook error:', error);
    return { success: true, variables: { webhook_status: '0', webhook_error: String(error) } };
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

// Nomes alternativos aceitos para a mesma variável. A UI anuncia {{name}}, mas
// {{nome}} é o que todo mundo escreve por reflexo — sem isso a mensagem sairia
// com a chave crua para o cliente.
const VARIABLE_ALIASES: Record<string, string[]> = {
  name: ['nome'],
  nome: ['name'],
  phone: ['telefone'],
  telefone: ['phone'],
};

function lookupVariable(variables: Record<string, unknown>, varName: string): unknown {
  const direct = variables[varName];
  if (direct !== undefined && direct !== null && direct !== '') return direct;

  for (const alias of VARIABLE_ALIASES[varName] || []) {
    const value = variables[alias];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

// "Olá {{name}}, tudo bem?" sem nome viraria "Olá , tudo bem?" — costura a
// pontuação órfã deixada pelo buraco. Só roda em linha que perdeu variável,
// para nunca reformatar texto que o usuário escreveu de propósito.
function tidyLineAfterEmptyVariable(line: string): string {
  return line
    .replace(/[ \t]+([,;:!?.])/g, '$1')       // espaço antes de pontuação
    .replace(/([,;:])\s*(?=[,;:])/g, '')      // pontuação duplicada consecutiva
    .replace(/[ \t]{2,}/g, ' ')               // espaços duplos no meio da frase
    .replace(/^[ \t]*[,;:][ \t]*/, '')        // linha começando com pontuação
    .replace(/[ \t]+$/, '')                   // espaço sobrando no fim da linha
    // "{{name}}, bom dia." vira "bom dia." — recupera a maiúscula inicial.
    .replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}

function replaceVariables(text: string, variables: Record<string, unknown>): string {
  // Variável sem valor vira string vazia, NUNCA o {{placeholder}} literal:
  // o cliente não pode receber "Olá {{name}}," numa mensagem do WhatsApp.
  return text.split('\n').map((line) => {
    let hasEmptyVariable = false;
    const replaced = line.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
      const value = lookupVariable(variables, varName);
      if (value === undefined) {
        hasEmptyVariable = true;
        return '';
      }
      return String(value);
    });

    return hasEmptyVariable ? tidyLineAfterEmptyVariable(replaced) : replaced;
  }).join('\n');
}
// Grava a ENTRADA no nó e devolve o id da linha, para que o resultado possa ser
// carimbado quando o nó terminar (ver finishNodeLog).
//
// O insert continua acontecendo ANTES da execução de propósito: se o nó travar
// ou a edge function morrer no meio, a passagem do contato por ele fica
// registrada do mesmo jeito. O que faltava era o desfecho.
async function logNodeExecution(
  supabase: SupabaseClientType,
  context: ExecutionContext,
  node: any,
  executionId?: string
): Promise<string | null> {
  try {
    const { id: nodeId, type: nodeType, data } = node;
    const nodeName = data?.label || data?.name || nodeType;

    const { data: logRow } = await supabase.from('flow_node_logs').insert({
      organization_id: context.organizationId,
      conversation_id: context.conversationId,
      flow_execution_id: executionId,
      node_id: nodeId,
      node_name: nodeName,
      node_type: nodeType,
      input_data: data,
    }).select('id').single();

    return logRow?.id || null;
  } catch (err) {
    console.error('[FLOW EXECUTE] Error logging node execution:', err);
    return null;
  }
}

// Carimba o desfecho do nó no log da entrada. Nunca lança: o histórico é
// observabilidade, e falhar aqui não pode derrubar a execução do fluxo.
async function finishNodeLog(
  supabase: SupabaseClientType,
  logId: string | null,
  status: 'success' | 'failed' | 'error',
  startedAt: number,
  errorMessage?: string,
) {
  if (!logId) return;
  try {
    await supabase.from('flow_node_logs').update({
      status,
      duration_ms: Date.now() - startedAt,
      error_message: errorMessage ? String(errorMessage).slice(0, 500) : null,
    }).eq('id', logId);
  } catch (err) {
    console.error('[FLOW EXECUTE] Error finishing node log:', err);
  }
}
