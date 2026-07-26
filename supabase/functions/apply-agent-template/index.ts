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
// Criação "do zero" (sem templateId) e a action 'update_orchestration' NÃO
// existem mais aqui -- orquestração do zero agora cria fluxo/campanha/instância
// direto do cliente (ver useCreateOrchestrationInstance) e é sempre editada no
// Flow Builder real, sem passar por um "step builder" no servidor.
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

function suggestKeywordFromName(name: string): string {
  return normalizeText(name).replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "");
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

interface ApplyBody {
  action: "apply" | "activate" | "check_keyword" | "save_as_template" | "set_goal_tag";
  templateId?: string; // 'apply': obrigatório
  name?: string; // 'save_as_template': nome do template
  workspaceId?: string | null;
  triggerKeyword?: string;
  instanceId?: string; // pra action:'activate'/'check_keyword'/'save_as_template'/'set_goal_tag'
  // 'save_as_template' (só admin de plataforma, sempre vai pra galeria global)
  description?: string;
  category?: string;
  suggestedTriggerKeyword?: string;
  // 'set_goal_tag': tag que, aplicada num contato que passou por essa
  // orquestração, marca conversão (ver get_agent_instance_conversion). null
  // remove o objetivo (volta a não mostrar conversão nenhuma).
  goalTagId?: string | null;
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
      if (!instance.ai_agent_id) return errorResponse("Essa orquestração ainda não tem um agente de IA no fluxo", 400);

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

    // action: 'apply' -- aplica um template da galeria (cria fluxo, agente e
    // campanha novos pra organização a partir do snapshot salvo do template).
    if (body.action !== "apply") return errorResponse(`Ação desconhecida: ${body.action}`, 400);
    if (!body.templateId) return errorResponse("templateId é obrigatório", 400);

    const { data: template, error: templateError } = await rls
      .from("agent_templates")
      .select("*")
      .eq("id", body.templateId)
      .maybeSingle();
    if (templateError || !template) return errorResponse("Template não encontrado ou sem permissão", 404);

    const flowSnapshot = (template.flow_snapshot || {}) as any;
    const agentSnapshot = (template.agent_snapshot || {}) as any;
    const workspaceId = body.workspaceId || null;
    const entityName = template.name;
    const entityDescription = template.description ?? null;

    // Template: sempre cria 1 agente a partir do agent_snapshot (agent_instances
    // guarda esse id como "agente principal" mesmo quando o flow_snapshot já
    // embute vários nós de agente próprios).
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

    const rollbackCreatedAgent = async () => {
      await service.from("ai_agents").delete().eq("id", agent.id);
    };

    // Com grafo já desenhado no template, usa como está; sem isso (caso do
    // único template semeado até agora), grafo mínimo com esse agente.
    const hasSnapshotNodes = Array.isArray(flowSnapshot.nodes) && flowSnapshot.nodes.length > 0;
    const { nodes: builtNodes, edges: builtEdges } = hasSnapshotNodes
      ? { nodes: flowSnapshot.nodes, edges: flowSnapshot.edges || [] }
      : buildSingleAgentGraph(agent.id, entityName);

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
      await rollbackCreatedAgent();
      return errorResponse(`Erro ao criar fluxo: ${flowError.message}`, 500);
    }

    // flow_ids é só bookkeeping (não afeta execução -- quem roda é o node
    // ai-handoff).
    await service.from("ai_agents").update({ flow_ids: [flow.id] }).eq("id", agent.id);

    const campaignFolderId = await getOrCreateOrchestrationFolder(service, "campaign_folders", organizationId);

    const suggestedKeyword = body.triggerKeyword || template.suggested_trigger_keyword || suggestKeywordFromName(entityName) || entityName;
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
      await rollbackCreatedAgent();
      return errorResponse(`Erro ao criar campanha: ${campaignError.message}`, 500);
    }

    const { data: instance, error: instanceError } = await service
      .from("agent_instances")
      .insert({
        organization_id: organizationId,
        template_id: template.id,
        flow_id: flow.id,
        ai_agent_id: agent.id,
        campaign_id: campaign.id,
        status: "draft",
        // Fluxo criado agora a partir do template -- vale perguntar se apaga
        // junto na hora de excluir a orquestração.
        flow_created_by_wizard: true,
      })
      .select("*")
      .single();
    if (instanceError) {
      await service.from("campaigns").delete().eq("id", campaign.id);
      await service.from("flows").delete().eq("id", flow.id);
      await rollbackCreatedAgent();
      return errorResponse(`Erro ao criar instância: ${instanceError.message}`, 500);
    }

    const collidingCampaigns = await checkKeywordCollision(service, organizationId, suggestedKeyword, campaign.id);

    return jsonResponse({ instance, flow, agent, campaign, collidingCampaigns });
  } catch (error: any) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    console.error("apply-agent-template error:", error);
    return errorResponse(error?.message || "Erro interno", 500);
  }
});
