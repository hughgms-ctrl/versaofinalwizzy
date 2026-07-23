import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  authenticateUser,
  createServiceClient,
  parseJsonBody,
  AuthError,
} from "../_shared/middleware.ts";

// Wizard de aplicar template (Etapa 5 da spec SPEC_TEMPLATES_TESTADOR.md v2).
// Roda com service_role (a inserção em ai_agents exige role owner/admin via RLS —
// isso deixaria qualquer outro membro do time sem poder aplicar um template; aqui
// a autorização é feita pela leitura do template via client RLS do usuário, e as
// escritas em flows/ai_agents/campaigns/agent_instances usam service_role depois
// de confirmado que o usuário pertence à org e pode ver o template).
//
// NÃO reaproveita o checkCampaignTriggers de zapi-webhook (por precaução -- esse é
// o arquivo mais sensível do sistema, campanhas/conversas em produção dependem
// dele, e o formato da checagem aqui é diferente: comparar gatilho candidato
// contra gatilhos já em uso, não "essa mensagem bate em algum gatilho"). Reimplementa
// a mesma normalização (acento/maiúscula) localmente, isolado, sem tocar em
// zapi-webhook de novo.

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

interface CollidingCampaign {
  id: string;
  name: string;
  trigger_keyword: string;
}

async function checkKeywordCollision(
  service: any,
  organizationId: string,
  candidateKeyword: string,
  excludeCampaignId?: string,
): Promise<CollidingCampaign[]> {
  if (!candidateKeyword) return [];
  const candidateWords = candidateKeyword.split(",").map((k) => normalizeText(k.trim())).filter(Boolean);
  if (candidateWords.length === 0) return [];

  let query = service
    .from("campaigns")
    .select("id, name, trigger_keyword")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  if (excludeCampaignId) query = query.neq("id", excludeCampaignId);
  const { data: campaigns } = await query;

  const colliding: CollidingCampaign[] = [];
  for (const campaign of (campaigns as any[]) || []) {
    if (!campaign.trigger_keyword) continue;
    const existingWords = String(campaign.trigger_keyword).split(",").map((k: string) => normalizeText(k.trim())).filter(Boolean);
    const overlaps = candidateWords.some((cw) => existingWords.some((ew: string) => cw === ew || cw.includes(ew) || ew.includes(cw)));
    if (overlaps) colliding.push({ id: campaign.id, name: campaign.name, trigger_keyword: campaign.trigger_keyword });
  }
  return colliding;
}

interface TagRef { id: string; name: string; }
interface PipelineRef { id: string; name: string; columnId: string; columnName: string; }
interface OutcomeRouting {
  continue?: boolean; // default true -- se false, esse resultado encerra a cadeia ali
  tag?: TagRef;
  pipeline?: PipelineRef;
}
interface RemarketingStepInput { message: string; delayMinutes: number; }

// Uma orquestração "do zero" é uma LISTA de etapas -- não mais um formato fixo
// (tag→pipeline→agente→ação). Cada etapa mapeia 1:1 num tipo de node real do
// Flow Builder (não inventa tipo novo), e pode repetir 'agent' quantas vezes
// quiser -- é assim que "Agente 1 qualifica → Agente 2 verifica relatório →
// decide avançar" fica possível (ver conversa com o usuário: "o agente é uma
// orquestração de agentes, não um agente separado").
//
// 'flow' reproduz o node 'action-flow' EXATAMENTE como usado na produção real
// do usuário ("Agente Master - AR", workspace Previdenciário 1): disparar o
// fluxo é fire-and-forget, mas quando waitForResponse=true o node vira um
// portão com DUAS saídas fixas -- "responded" (cliente respondeu) e "timeout"
// (não respondeu) -- com uma régua de follow-ups (mensagem+atraso) cutucando
// o cliente enquanto espera. Sem waitForResponse, é um passo linear simples.
type StepInput =
  | { type: "tag"; tag: TagRef }
  | { type: "pipeline"; pipeline: PipelineRef }
  | { type: "transfer" }
  | { type: "delay"; delaySeconds?: number }
  | {
      type: "flow";
      flowId: string;
      flowName?: string;
      waitForResponse?: boolean;
      remarketingSteps?: RemarketingStepInput[];
      remarketingContext?: string;
      remarketingQuietHours?: boolean;
      remarketingQuietStart?: string;
      routing?: { responded?: OutcomeRouting; timeout?: OutcomeRouting };
    }
  | {
      type: "agent";
      agentId?: string; // usa um agente JÁ existente (reuso entre orquestrações)
      agentName?: string;
      newAgent?: {
        name: string;
        functionRole?: string;
        promptBase?: string;
        // Personalidade estruturada (ver src/lib/agentPersonality.ts) -- null/undefined
        // = sem seleção, sem efeito extra no prompt.
        behaviorStyle?: string | null;
        responseLength?: string | null;
        toneStyle?: string | null;
        emojiUsage?: string | null;
      }; // OU cria um novo agora
      additionalPrompt?: string; // prompt específico deste passo -- SOMA ao prompt_base do agente, não substitui
      outcomes?: string[];
      outcomeRouting?: Record<string, OutcomeRouting>;
      // resultado "não identificado" (a IA respondeu algo fora dos resultados
      // configurados) -- espelha node_3→outcome-default→Transferir no exemplo real.
      outcomeDefaultTransfer?: boolean;
    };

interface ApplyBody {
  action: "apply" | "activate" | "check_keyword" | "save_as_template" | "update_orchestration" | "set_goal_tag";
  templateId?: string; // 'apply': se ausente, cria do zero (sem template)
  name?: string; // 'apply'/'update_orchestration': nome da orquestração; 'save_as_template': nome do template
  workspaceId?: string | null;
  triggerKeyword?: string;
  instanceId?: string; // pra action:'activate'/'check_keyword'/'save_as_template'/'update_orchestration'/'set_goal_tag'
  steps?: StepInput[]; // orquestração do zero (sem templateId), ou reconstruída pra 'update_orchestration'
  // 'save_as_template' (só admin de plataforma, sempre vai pra galeria global)
  description?: string;
  category?: string;
  suggestedTriggerKeyword?: string;
  // 'set_goal_tag': tag que, aplicada num contato que passou por essa
  // orquestração, marca conversão (ver get_agent_instance_conversion). null
  // remove o objetivo (volta a não mostrar conversão nenhuma).
  goalTagId?: string | null;
}

function suggestKeywordFromName(name: string): string {
  return normalizeText(name).replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "");
}

// Fluxos/campanhas criados por uma orquestração entram numa pasta fixa,
// separada do que o usuário monta manualmente em Fluxos/Campanhas (ver
// conversa com o usuário). Uma pasta só por organização (sem workspace_id --
// visível em todos), reaproveitada entre orquestrações; não move nada que já
// tenha sido movido de pasta manualmente (só usada na criação).
const ORCHESTRATION_FOLDER_NAME = "Criados por Agentes";

async function getOrCreateOrchestrationFolder(
  service: any,
  table: "flow_folders" | "campaign_folders",
  organizationId: string,
): Promise<string | null> {
  const { data: existing } = await service
    .from(table)
    .select("id")
    .eq("organization_id", organizationId)
    .is("parent_id", null)
    .eq("name", ORCHESTRATION_FOLDER_NAME)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await service
    .from(table)
    .insert({ organization_id: organizationId, name: ORCHESTRATION_FOLDER_NAME })
    .select("id")
    .single();
  if (error) return null; // pasta é conveniência, não bloqueia a criação da orquestração
  return created.id;
}

// Fallback pra template sem flow_snapshot desenhado (caso do único template
// semeado até agora): um único nó de agente, sem passos antes/depois.
function buildSingleAgentGraph(agentId: string, agentName: string) {
  const nodes: any[] = [
    { id: "start-1", type: "start", position: { x: 50, y: 200 }, data: { label: "Início" } },
    { id: "agent-1", type: "ai-handoff", position: { x: 330, y: 200 }, data: { label: agentName, agentId, agentName, autoAdvance: true } },
  ];
  const edges: any[] = [{ id: "e-start-1-agent-1", source: "start-1", target: "agent-1" }];
  return { nodes, edges };
}

// Monta um grafo de fluxo REAL a partir da lista de etapas -- reproduz os
// mesmos tipos/campos de node que o Flow Builder e o flow-execute já sabem
// rodar (não inventa node type novo): 'action-tag' { action, tagId, tagName },
// 'action-pipeline' { pipelineId, pipelineColumnId, pipelineName,
// pipelineColumnName } (confirmado em flow-execute/index.ts:executePipelineMove
// -- NÃO é "columnId", esse era um bug; e o atalho "outcomePipelines" direto no
// node do agente também não existe em lugar nenhum do backend, por isso
// "mover pipeline" por resultado agora sempre gera um node action-pipeline de
// verdade, igual as outras ações), 'action-transfer' { label }, 'action-delay'
// { delaySeconds }, 'ai-handoff' { agentId, agentName, additionalPrompt,
// expectedOutcomes: "a, b" }. Edges do agente usam sourceHandle
// "outcome-<texto exato>".
//
// Precisa de acesso ao DB (service role) porque uma etapa de agente pode
// pedir pra CRIAR um agente novo ali mesmo (newAgent) -- por isso não é uma
// função pura; roda dentro da mesma requisição de 'apply', antes do fluxo
// existir, e devolve quais agentIds foram criados agora (pra rollback manual
// se alguma etapa seguinte falhar).
async function buildStepsGraph(
  service: any,
  organizationId: string,
  workspaceId: string | null,
  steps: StepInput[],
): Promise<{ nodes: any[]; edges: any[]; primaryAgentId: string | null; createdAgentIds: string[] }> {
  const nodes: any[] = [{ id: "start-1", type: "start", position: { x: 50, y: 200 }, data: { label: "Início" } }];
  const edges: any[] = [];
  const createdAgentIds: string[] = [];
  let primaryAgentId: string | null = null;
  // Pontos "em aberto" que ainda precisam ser ligados na PRÓXIMA etapa -- normalmente
  // só 1 (a etapa anterior), mas um nó de agente com vários resultados que "continuam"
  // gera vários pontos em aberto simultâneos, todos alimentando o mesmo próximo passo.
  let pending: { source: string; sourceHandle?: string }[] = [{ source: "start-1" }];
  const connectPending = (targetId: string) => {
    for (const p of pending) {
      edges.push({
        id: `e-${p.source}-${targetId}${p.sourceHandle ? "-" + p.sourceHandle : ""}`,
        source: p.source,
        target: targetId,
        ...(p.sourceHandle ? { sourceHandle: p.sourceHandle } : {}),
      });
    }
  };

  let x = 330;
  let counter = 0;
  for (const step of steps) {
    counter++;
    if (step.type === "tag") {
      const id = `tag-${counter}`;
      nodes.push({ id, type: "action-tag", position: { x, y: 200 }, data: { label: "Adicionar tag", action: "add", tagId: step.tag.id, tagName: step.tag.name } });
      connectPending(id);
      pending = [{ source: id }];
      x += 280;
    } else if (step.type === "pipeline") {
      const id = `pipeline-${counter}`;
      nodes.push({
        id, type: "action-pipeline", position: { x, y: 200 },
        data: { label: "Mover pipeline", pipelineId: step.pipeline.id, pipelineColumnId: step.pipeline.columnId, pipelineName: step.pipeline.name, pipelineColumnName: step.pipeline.columnName },
      });
      connectPending(id);
      pending = [{ source: id }];
      x += 280;
    } else if (step.type === "transfer") {
      const id = `transfer-${counter}`;
      nodes.push({ id, type: "action-transfer", position: { x, y: 200 }, data: { label: "Transferir para atendimento humano" } });
      connectPending(id);
      pending = [{ source: id }];
      x += 280;
    } else if (step.type === "delay") {
      const id = `delay-${counter}`;
      nodes.push({ id, type: "action-delay", position: { x, y: 200 }, data: { label: "Aguardar", delaySeconds: step.delaySeconds || 60 } });
      connectPending(id);
      pending = [{ source: id }];
      x += 280;
    } else if (step.type === "flow") {
      const id = `flow-${counter}`;
      nodes.push({
        id, type: "action-flow", position: { x, y: 200 },
        data: {
          label: "Iniciar Fluxo",
          flowId: step.flowId,
          flowName: step.flowName || "",
          waitForResponse: !!step.waitForResponse,
          ...(step.waitForResponse ? {
            remarketingSteps: step.remarketingSteps || [],
            remarketingContext: step.remarketingContext || "",
            remarketingQuietHours: !!step.remarketingQuietHours,
            ...(step.remarketingQuietStart ? { remarketingQuietStart: step.remarketingQuietStart } : {}),
          } : {}),
        },
      });
      connectPending(id);
      x += 280;

      if (!step.waitForResponse) {
        // Passo simples (fire-and-forget): sem ramificação, segue linear.
        pending = [{ source: id }];
      } else {
        // waitForResponse=true -- DUAS saídas fixas, iguais ao exemplo real
        // (Agente Master - AR): "responded" (cliente respondeu) e "timeout"
        // (não respondeu, mesmo com os follow-ups). Cada uma pode opcionalmente
        // marcar tag/mover pipeline (nós extras -- action-flow não tem o atalho
        // outcomePipelines que o ai-handoff tem) antes de continuar ou encerrar.
        const nextPending: typeof pending = [];
        (["responded", "timeout"] as const).forEach((branch, i) => {
          const routing = step.routing?.[branch];
          const shouldContinue = routing?.continue !== false;
          let fromSource = id;
          let fromHandle: string | undefined = branch;
          if (routing?.tag) {
            const tagNodeId = `flow-${counter}-tag-${branch}`;
            nodes.push({ id: tagNodeId, type: "action-tag", position: { x, y: 80 + i * 160 }, data: { label: `Tag: ${branch}`, action: "add", tagId: routing.tag.id, tagName: routing.tag.name } });
            edges.push({ id: `e-${fromSource}-${tagNodeId}`, source: fromSource, target: tagNodeId, sourceHandle: fromHandle });
            fromSource = tagNodeId;
            fromHandle = undefined;
          }
          if (routing?.pipeline) {
            const pipelineNodeId = `flow-${counter}-pipeline-${branch}`;
            nodes.push({
              id: pipelineNodeId, type: "action-pipeline", position: { x: x + (routing.tag ? 280 : 0), y: 80 + i * 160 },
              data: { label: "Mover pipeline", pipelineId: routing.pipeline.id, pipelineColumnId: routing.pipeline.columnId, pipelineName: routing.pipeline.name, pipelineColumnName: routing.pipeline.columnName },
            });
            edges.push({ id: `e-${fromSource}-${pipelineNodeId}`, source: fromSource, target: pipelineNodeId, ...(fromHandle ? { sourceHandle: fromHandle } : {}) });
            fromSource = pipelineNodeId;
            fromHandle = undefined;
          }
          if (shouldContinue) nextPending.push({ source: fromSource, sourceHandle: fromHandle });
        });
        pending = nextPending;
        x += 560;
      }
    } else if (step.type === "agent") {
      let agentId = step.agentId || null;
      let agentName = step.agentName || "Agente";
      if (!agentId && step.newAgent?.name) {
        const { data: newAgent, error: newAgentError } = await service
          .from("ai_agents")
          .insert({
            organization_id: organizationId,
            name: step.newAgent.name,
            function_role: step.newAgent.functionRole || "recepcao",
            prompt_base: step.newAgent.promptBase || "",
            behavior_style: step.newAgent.behaviorStyle || null,
            response_length: step.newAgent.responseLength || null,
            tone_style: step.newAgent.toneStyle || null,
            emoji_usage: step.newAgent.emojiUsage || null,
            flow_ids: [],
            workspace_id: workspaceId,
          })
          .select("*")
          .single();
        if (newAgentError) throw new Error(`Erro ao criar agente "${step.newAgent.name}": ${newAgentError.message}`);
        agentId = newAgent.id;
        agentName = newAgent.name;
        createdAgentIds.push(agentId);
      }
      if (!agentId) throw new Error("Etapa de agente sem agentId nem newAgent.name");
      if (!primaryAgentId) primaryAgentId = agentId;

      const outcomes = (step.outcomes || []).map((o) => o.trim()).filter(Boolean);

      const id = `agent-${counter}`;
      nodes.push({
        id, type: "ai-handoff", position: { x, y: 200 },
        data: {
          label: agentName,
          agentId,
          agentName,
          ...(step.additionalPrompt ? { additionalPrompt: step.additionalPrompt } : {}),
          expectedOutcomes: outcomes.join(", "),
          autoAdvance: true,
        },
      });
      connectPending(id);
      x += 280;

      if (outcomes.length === 0 && !step.outcomeDefaultTransfer) {
        pending = [{ source: id }];
      } else {
        const nextPending: typeof pending = [];
        outcomes.forEach((o, i) => {
          const routing = step.outcomeRouting?.[o];
          const shouldContinue = routing?.continue !== false;
          let fromSource = id;
          let fromHandle: string | undefined = `outcome-${o}`;
          if (routing?.tag) {
            const tagNodeId = `tag-out-${counter}-${i}`;
            nodes.push({ id: tagNodeId, type: "action-tag", position: { x, y: 80 + i * 160 }, data: { label: `Tag: ${o}`, action: "add", tagId: routing.tag.id, tagName: routing.tag.name } });
            edges.push({ id: `e-${fromSource}-${tagNodeId}`, source: fromSource, target: tagNodeId, sourceHandle: fromHandle });
            fromSource = tagNodeId;
            fromHandle = undefined;
          }
          // "Mover pipeline" por resultado -- node real (não existe atalho tipo
          // outcomePipelines no motor de execução pra nó de agente; confirmado
          // que o único lugar que lia esse campo era este arquivo).
          if (routing?.pipeline) {
            const pipelineNodeId = `pipeline-out-${counter}-${i}`;
            nodes.push({
              id: pipelineNodeId, type: "action-pipeline", position: { x: x + (routing.tag ? 280 : 0), y: 80 + i * 160 },
              data: { label: "Mover pipeline", pipelineId: routing.pipeline.id, pipelineColumnId: routing.pipeline.columnId, pipelineName: routing.pipeline.name, pipelineColumnName: routing.pipeline.columnName },
            });
            edges.push({ id: `e-${fromSource}-${pipelineNodeId}`, source: fromSource, target: pipelineNodeId, ...(fromHandle ? { sourceHandle: fromHandle } : {}) });
            fromSource = pipelineNodeId;
            fromHandle = undefined;
          }
          if (shouldContinue) nextPending.push({ source: fromSource, sourceHandle: fromHandle });
          // shouldContinue===false sem tag/pipeline: nenhuma edge sai daquele resultado -- fim natural da cadeia ali.
        });
        // Resultado "não identificado" -- espelha node_3→outcome-default→Transferir
        // no exemplo real: rede de segurança quando a IA foge do script. Sempre
        // termina em transferência (não continua a cadeia, igual à produção).
        if (step.outcomeDefaultTransfer) {
          const transferId = `agent-${counter}-default-transfer`;
          nodes.push({ id: transferId, type: "action-transfer", position: { x, y: 80 + outcomes.length * 160 }, data: { label: "Transferir (resultado não identificado)" } });
          edges.push({ id: `e-${id}-${transferId}`, source: id, target: transferId, sourceHandle: "outcome-default" });
        }
        pending = nextPending;
        x += 280;
      }
    }
  }

  return { nodes, edges, primaryAgentId, createdAgentIds };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await parseJsonBody<ApplyBody>(req);
    const auth = await authenticateUser(req);
    const rls = auth.supabase;
    const service = createServiceClient();
    const organizationId = auth.organizationId;

    if (body.action === "check_keyword") {
      if (!body.instanceId || !body.triggerKeyword) return errorResponse("instanceId e triggerKeyword são obrigatórios", 400);

      const { data: instance, error: instanceError } = await rls
        .from("agent_instances")
        .select("id, campaign_id")
        .eq("id", body.instanceId)
        .maybeSingle();
      if (instanceError || !instance) return errorResponse("Instância não encontrada ou sem permissão", 404);
      if (!instance.campaign_id) return errorResponse("Instância sem campanha associada", 400);

      const trimmedKeyword = body.triggerKeyword.trim();
      await service.from("campaigns").update({ trigger_keyword: trimmedKeyword }).eq("id", instance.campaign_id);
      const collidingCampaigns = await checkKeywordCollision(service, organizationId, trimmedKeyword, instance.campaign_id);
      return jsonResponse({ triggerKeyword: trimmedKeyword, collidingCampaigns });
    }

    if (body.action === "activate") {
      if (!body.instanceId) return errorResponse("instanceId é obrigatório", 400);

      const { data: instance, error: instanceError } = await rls
        .from("agent_instances")
        .select("id, campaign_id")
        .eq("id", body.instanceId)
        .maybeSingle();
      if (instanceError || !instance) return errorResponse("Instância não encontrada ou sem permissão", 404);
      if (!instance.campaign_id) return errorResponse("Instância sem campanha associada", 400);

      const { data: campaign } = await service
        .from("campaigns")
        .select("id, trigger_keyword")
        .eq("id", instance.campaign_id)
        .maybeSingle();

      const colliding = campaign
        ? await checkKeywordCollision(service, organizationId, campaign.trigger_keyword, campaign.id)
        : [];

      // Não bloqueia -- o aviso já devia ter sido mostrado no "apply"; aqui só
      // reconfirma (o cenário pode ter mudado) e retorna junto da ativação, pra o
      // front decidir se avisa de novo antes de comemorar.
      await service.from("campaigns").update({ is_active: true }).eq("id", instance.campaign_id);
      await service.from("agent_instances").update({ status: "active" }).eq("id", instance.id);

      return jsonResponse({ activated: true, collidingCampaigns: colliding });
    }

    if (body.action === "update_orchestration") {
      if (!body.instanceId) return errorResponse("instanceId é obrigatório", 400);
      if (!(body.steps || []).some((s) => s.type === "agent")) {
        return errorResponse("A orquestração precisa de ao menos uma etapa de agente", 400);
      }

      const { data: instance, error: instanceError } = await rls
        .from("agent_instances")
        .select("id, flow_id, campaign_id, ai_agent_id")
        .eq("id", body.instanceId)
        .maybeSingle();
      if (instanceError || !instance) return errorResponse("Instância não encontrada ou sem permissão", 404);

      const workspaceId = body.workspaceId || null;
      const entityName = body.name?.trim() || undefined;

      // Reaproveita EXATAMENTE a mesma montagem de grafo do 'apply' -- uma
      // etapa de agente pode continuar referenciando um agentId já existente
      // (nada muda nele) ou pedir newAgent (cria um agente novo agora, do
      // mesmo jeito que na criação original). Agentes que saíram da lista
      // durante a edição simplesmente ficam órfãos do fluxo, sem serem apagados
      // -- podem estar em uso em outra orquestração.
      let builtNodes: any[];
      let builtEdges: any[];
      let primaryAgentId: string | null;
      let createdAgentIds: string[];
      try {
        const built = await buildStepsGraph(service, organizationId, workspaceId, body.steps || []);
        builtNodes = built.nodes;
        builtEdges = built.edges;
        primaryAgentId = built.primaryAgentId;
        createdAgentIds = built.createdAgentIds;
      } catch (stepsError: any) {
        return errorResponse(stepsError?.message || "Erro ao montar as etapas da orquestração", 500);
      }

      const { error: flowUpdateError } = await service
        .from("flows")
        .update({
          ...(entityName ? { name: entityName } : {}),
          workspace_id: workspaceId,
          workspace_ids: workspaceId ? [workspaceId] : [],
          nodes: builtNodes,
          edges: builtEdges,
        })
        .eq("id", instance.flow_id);
      if (flowUpdateError) {
        for (const id of createdAgentIds) await service.from("ai_agents").delete().eq("id", id);
        return errorResponse(`Erro ao atualizar fluxo: ${flowUpdateError.message}`, 500);
      }

      for (const id of createdAgentIds) {
        await service.from("ai_agents").update({ flow_ids: [instance.flow_id] }).eq("id", id);
      }

      if (instance.campaign_id) {
        await service
          .from("campaigns")
          .update({
            ...(entityName ? { name: entityName } : {}),
            workspace_id: workspaceId,
            ...(body.triggerKeyword?.trim() ? { trigger_keyword: body.triggerKeyword.trim() } : {}),
          })
          .eq("id", instance.campaign_id);
      }

      if (primaryAgentId && primaryAgentId !== instance.ai_agent_id) {
        await service.from("agent_instances").update({ ai_agent_id: primaryAgentId }).eq("id", instance.id);
      }

      const collidingCampaigns = instance.campaign_id && body.triggerKeyword?.trim()
        ? await checkKeywordCollision(service, organizationId, body.triggerKeyword.trim(), instance.campaign_id)
        : [];

      return jsonResponse({ updated: true, flowId: instance.flow_id, collidingCampaigns });
    }

    if (body.action === "set_goal_tag") {
      if (!body.instanceId) return errorResponse("instanceId é obrigatório", 400);

      const { data: instance, error: instanceError } = await rls
        .from("agent_instances")
        .select("id")
        .eq("id", body.instanceId)
        .maybeSingle();
      if (instanceError || !instance) return errorResponse("Instância não encontrada ou sem permissão", 404);

      const { error: updateError } = await service
        .from("agent_instances")
        .update({ goal_tag_id: body.goalTagId || null })
        .eq("id", body.instanceId);
      if (updateError) return errorResponse(`Erro ao salvar objetivo: ${updateError.message}`, 500);

      return jsonResponse({ updated: true });
    }

    if (body.action === "save_as_template") {
      if (!body.instanceId || !body.name?.trim()) return errorResponse("instanceId e name são obrigatórios", 400);

      // Leitura via `rls` (não `service`) -- é o que garante que só quem já tem
      // acesso a essa instância (via RLS de agent_instances) pode tirar uma foto
      // dela como template. Não reaproveita snapshots de outro template mesmo
      // que a instância tenha vindo de um -- sempre lê o estado ATUAL do fluxo
      // e do agente (podem ter sido editados depois de aplicados).
      const { data: instance, error: instanceError } = await rls
        .from("agent_instances")
        .select("id, flow_id, ai_agent_id")
        .eq("id", body.instanceId)
        .maybeSingle();
      if (instanceError || !instance) return errorResponse("Instância não encontrada ou sem permissão", 404);

      const { data: flow, error: flowError } = await rls
        .from("flows")
        .select("nodes, edges, variables")
        .eq("id", instance.flow_id)
        .maybeSingle();
      if (flowError || !flow) return errorResponse("Fluxo da instância não encontrado", 404);

      const { data: agent, error: agentError } = await rls
        .from("ai_agents")
        .select("function_role, prompt_base, persona, knowledge_base")
        .eq("id", instance.ai_agent_id)
        .maybeSingle();
      if (agentError || !agent) return errorResponse("Agente principal da instância não encontrado", 404);

      // Galeria de templates é curadoria -- só admin de plataforma cria (ver
      // conversa com o usuário: quem cria a própria orquestração só usa,
      // não precisa que ela vire template pra ninguém). Sempre global.
      const { data: isAdmin } = await rls.rpc("is_platform_admin", { _user_id: auth.userId });
      if (!isAdmin) return errorResponse("Só administradores de plataforma podem criar templates", 403);

      const { data: template, error: templateError } = await service
        .from("agent_templates")
        .insert({
          organization_id: null,
          name: body.name.trim(),
          description: body.description || null,
          category: body.category || null,
          suggested_trigger_keyword: body.suggestedTriggerKeyword || null,
          flow_snapshot: { nodes: flow.nodes, edges: flow.edges, variables: flow.variables || {} },
          agent_snapshot: {
            function_role: agent.function_role,
            prompt_base: agent.prompt_base,
            persona: agent.persona,
            knowledge_base: agent.knowledge_base,
          },
          status: "published",
          created_by: auth.userId,
        })
        .select("*")
        .single();
      if (templateError) return errorResponse(`Erro ao salvar template: ${templateError.message}`, 500);

      return jsonResponse({ template });
    }

    // action: 'apply' -- com templateId, aplica um template; sem templateId, cria uma
    // orquestração do zero (fluxo+agente(s)+campanha+instância juntos, já linkados,
    // com o mesmo aviso de colisão) -- unifica o que hoje é feito manualmente em 3
    // telas soltas (Agentes IA / Fluxos / Campanhas) quando não vem de template.
    let template: any = null;
    if (body.templateId) {
      const { data, error: templateError } = await rls
        .from("agent_templates")
        .select("*")
        .eq("id", body.templateId)
        .maybeSingle();
      if (templateError || !data) return errorResponse("Template não encontrado ou sem permissão", 404);
      template = data;
    } else if (!body.name?.trim()) {
      return errorResponse("name é obrigatório quando não há templateId", 400);
    } else if (!(body.steps || []).some((s) => s.type === "agent")) {
      return errorResponse("A orquestração precisa de ao menos uma etapa de agente", 400);
    }

    const flowSnapshot = (template?.flow_snapshot || {}) as any;
    const agentSnapshot = (template?.agent_snapshot || {}) as any;
    const workspaceId = body.workspaceId || null;
    const entityName = template?.name || body.name!.trim();
    const entityDescription = template?.description ?? null;

    // createdAgentIds rastreia SÓ os agentes criados NESTA requisição (pra
    // rollback manual se uma etapa seguinte falhar) -- agentes já existentes
    // referenciados por uma etapa (reuso entre orquestrações) nunca são apagados.
    let createdAgentIds: string[] = [];
    let primaryAgentId: string | null = null;
    let builtNodes: any[];
    let builtEdges: any[];

    const hasSnapshotNodes = Array.isArray(flowSnapshot.nodes) && flowSnapshot.nodes.length > 0;
    if (template) {
      // Template: sempre cria 1 agente a partir do agent_snapshot (agent_instances
      // exige um ai_agent_id -- serve de bookkeeping/"agente principal" mesmo
      // quando o flow_snapshot já embute vários nós de agente próprios).
      const { data: agent, error: agentError } = await service
        .from("ai_agents")
        .insert({
          organization_id: organizationId,
          name: entityName,
          description: entityDescription,
          function_role: agentSnapshot.function_role || "recepcao",
          prompt_base: agentSnapshot.prompt_base || "",
          persona: agentSnapshot.persona || null,
          knowledge_base: agentSnapshot.knowledge_base || null,
          flow_ids: [],
          workspace_id: workspaceId,
        })
        .select("*")
        .single();
      if (agentError) return errorResponse(`Erro ao criar agente: ${agentError.message}`, 500);
      createdAgentIds = [agent.id];
      primaryAgentId = agent.id;
      // Com grafo já desenhado no template, usa como está; sem isso (caso do
      // único template semeado até agora), grafo mínimo com esse agente.
      ({ nodes: builtNodes, edges: builtEdges } = hasSnapshotNodes
        ? { nodes: flowSnapshot.nodes, edges: flowSnapshot.edges || [] }
        : buildSingleAgentGraph(agent.id, entityName));
    } else {
      // From-scratch: monta o grafo real a partir da lista de etapas, criando
      // (ou reaproveitando) os agentes de cada etapa 'agent' ao longo do caminho.
      try {
        const built = await buildStepsGraph(service, organizationId, workspaceId, body.steps || []);
        builtNodes = built.nodes;
        builtEdges = built.edges;
        primaryAgentId = built.primaryAgentId;
        createdAgentIds = built.createdAgentIds;
      } catch (stepsError: any) {
        return errorResponse(stepsError?.message || "Erro ao montar as etapas da orquestração", 500);
      }
    }

    const rollbackCreatedAgents = async () => {
      for (const id of createdAgentIds) await service.from("ai_agents").delete().eq("id", id);
    };

    const flowFolderId = await getOrCreateOrchestrationFolder(service, "flow_folders", organizationId);

    const { data: flow, error: flowError } = await service
      .from("flows")
      .insert({
        organization_id: organizationId,
        name: entityName,
        description: entityDescription,
        workspace_id: workspaceId,
        workspace_ids: workspaceId ? [workspaceId] : [],
        nodes: builtNodes,
        edges: builtEdges,
        variables: flowSnapshot.variables || {},
        created_by: auth.userId,
        folder_id: flowFolderId,
      })
      .select("*")
      .single();
    if (flowError) {
      await rollbackCreatedAgents();
      return errorResponse(`Erro ao criar fluxo: ${flowError.message}`, 500);
    }

    // flow_ids é só bookkeeping (não afeta execução -- quem roda é o node
    // ai-handoff) -- soma este fluxo aos agentes criados agora, sem apagar
    // vínculos com outras orquestrações que já usavam esses mesmos agentes.
    for (const id of createdAgentIds) {
      await service.from("ai_agents").update({ flow_ids: [flow.id] }).eq("id", id);
    }

    const campaignFolderId = await getOrCreateOrchestrationFolder(service, "campaign_folders", organizationId);

    const suggestedKeyword = body.triggerKeyword || template?.suggested_trigger_keyword || suggestKeywordFromName(entityName) || entityName;
    const { data: campaign, error: campaignError } = await service
      .from("campaigns")
      .insert({
        organization_id: organizationId,
        name: entityName,
        flow_id: flow.id,
        trigger_keyword: suggestedKeyword,
        match_type: "contains",
        workspace_id: workspaceId,
        is_active: false, // sempre inativa até o cliente confirmar (ver Parte 5)
        folder_id: campaignFolderId,
      })
      .select("*")
      .single();
    if (campaignError) {
      await service.from("flows").delete().eq("id", flow.id);
      await rollbackCreatedAgents();
      return errorResponse(`Erro ao criar campanha: ${campaignError.message}`, 500);
    }

    const { data: instance, error: instanceError } = await service
      .from("agent_instances")
      .insert({
        organization_id: organizationId,
        template_id: template?.id || null,
        flow_id: flow.id,
        ai_agent_id: primaryAgentId,
        campaign_id: campaign.id,
        status: "draft",
      })
      .select("*")
      .single();
    if (instanceError) {
      await service.from("campaigns").delete().eq("id", campaign.id);
      await service.from("flows").delete().eq("id", flow.id);
      await rollbackCreatedAgents();
      return errorResponse(`Erro ao criar instância: ${instanceError.message}`, 500);
    }

    const collidingCampaigns = await checkKeywordCollision(service, organizationId, suggestedKeyword, campaign.id);

    const { data: primaryAgent } = primaryAgentId
      ? await service.from("ai_agents").select("*").eq("id", primaryAgentId).maybeSingle()
      : { data: null };

    return jsonResponse({ instance, flow, agent: primaryAgent, campaign, collidingCampaigns });
  } catch (error: any) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    console.error("apply-agent-template error:", error);
    return errorResponse(error?.message || "Erro interno", 500);
  }
});
