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
import { OPENAI_CHAT_ENDPOINT, resolveOpenAIConfig } from "../_shared/aiStrategy.ts";

// Testador de agentes (Etapa 4 da spec SPEC_TEMPLATES_TESTADOR.md v2) — roda UMA
// conversa simulada (persona x agente) inteira numa chamada só, avalia no final e
// grava o resultado. Modo massa = o chamador dispara N chamadas desta função em
// paralelo (uma por persona), não é orquestrado aqui dentro.
//
// De propósito NÃO reusa flow-execute nem sendTextMessage/sendMediaItem/
// sendWhatsAppMessage — a simulação conversa direto com o prompt do agente
// (persona <-> agente), sem passar perto do envio real de WhatsApp. Isso existe
// justamente pra garantir que nada aqui possa afetar campanhas/conversas reais:
// nenhum código de envio é compartilhado ou modificado.

const MAX_TURNS_DEFAULT = 6;
const AI_TIMEOUT_MS = 40000;

interface RunBody {
  targetType: "template" | "instance";
  targetId: string;
  personaId: string;
  sessionId?: string;
  maxTurns?: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatResult {
  content: string | null;
  error: string | null;
}

async function callChat(endpoint: string, apiKey: string, model: string, messages: ChatMessage[]): Promise<ChatResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, temperature: 0.7 }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("agent-tester-run: chat call failed", res.status, errText);
      return { content: null, error: `HTTP ${res.status}: ${errText.slice(0, 300)}` };
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || null;
    return { content, error: content ? null : "Resposta sem conteúdo (choices vazio)" };
  } catch (e) {
    console.error("agent-tester-run: chat call error", e);
    return { content: null, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timeout);
  }
}

function buildTrainingRulesBlock(rules: Array<{ situation: string; rule: string }>): string {
  if (rules.length === 0) return "";
  const lines = rules.map((r) => `- Quando: ${r.situation}\n  Você deve: ${r.rule}`).join("\n");
  return `\n\nREGRAS APRENDIDAS (siga à risca, elas vêm de ajustes já aplicados):\n${lines}`;
}

function traitsToText(traits: any): string {
  if (!traits) return "";
  if (typeof traits === "string") return traits;
  try {
    return Object.entries(traits)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
  } catch {
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await parseJsonBody<RunBody>(req);
    if (!body.targetType || !body.targetId || !body.personaId) {
      return errorResponse("targetType, targetId e personaId são obrigatórios", 400);
    }
    if (!["template", "instance"].includes(body.targetType)) {
      return errorResponse("targetType inválido", 400);
    }
    const maxTurns = Math.min(Math.max(body.maxTurns || MAX_TURNS_DEFAULT, 1), 12);

    const auth = await authenticateUser(req);
    const rls = auth.supabase; // RLS-scoped: só enxerga template/instance que o usuário pode ver
    const service = createServiceClient();

    // Organização de quem está RODANDO o teste — sempre a mesma, mesmo testando um
    // template global ainda não aplicado por ninguém (o RLS de agent_templates já
    // decide se esse usuário pode VER o template; aqui é só em nome de qual org a
    // sessão/modelo é resolvido).
    const organizationId = auth.organizationId;

    // Carrega o alvo (RLS decide se o usuário pode testar isso ou não).
    let promptBase = "";
    let persona = "";
    let aiAgentId: string | null = null;

    if (body.targetType === "instance") {
      const { data: instance, error: instanceError } = await rls
        .from("agent_instances")
        .select("id, organization_id, ai_agent_id")
        .eq("id", body.targetId)
        .maybeSingle();
      if (instanceError || !instance) return errorResponse("Instância não encontrada ou sem permissão", 404);

      aiAgentId = instance.ai_agent_id;

      const { data: agent, error: agentError } = await rls
        .from("ai_agents")
        .select("prompt_base, persona")
        .eq("id", instance.ai_agent_id)
        .maybeSingle();
      if (agentError || !agent) return errorResponse("Agente da instância não encontrado", 404);
      promptBase = agent.prompt_base || "";
      persona = agent.persona || "";
    } else {
      const { data: template, error: templateError } = await rls
        .from("agent_templates")
        .select("agent_snapshot")
        .eq("id", body.targetId)
        .maybeSingle();
      if (templateError || !template) return errorResponse("Template não encontrado ou sem permissão", 404);
      const snapshot = (template.agent_snapshot || {}) as any;
      promptBase = snapshot.prompt_base || "";
      persona = snapshot.persona || "";
    }

    const { data: personaRow, error: personaError } = await rls
      .from("agent_test_personas")
      .select("id, label, traits")
      .eq("id", body.personaId)
      .maybeSingle();
    if (personaError || !personaRow) return errorResponse("Persona não encontrada", 404);

    // Regras de treinamento já aplicadas (via "Aplicar ajuste" -> train-ai-agent),
    // só quando testamos uma instância real (templates ainda não têm ai_agent_id).
    let trainingRulesBlock = "";
    if (aiAgentId) {
      const { data: rules } = await service
        .from("agent_training_rules")
        .select("situation, rule")
        .eq("target_type", "agent")
        .eq("agent_id", aiAgentId)
        .eq("is_active", true);
      trainingRulesBlock = buildTrainingRulesBlock((rules as any[]) || []);
    }

    const [personaConfig, evaluatorConfig, agentConfig] = await Promise.all([
      resolveOpenAIConfig(service, organizationId, "agent_tester_persona"),
      resolveOpenAIConfig(service, organizationId, "agent_tester_evaluator"),
      resolveOpenAIConfig(service, organizationId, "agents"),
    ]);
    if (!personaConfig || !evaluatorConfig || !agentConfig) {
      return errorResponse("Nenhuma chave OpenAI configurada para rodar o teste", 400);
    }

    const agentSystemPrompt = [
      promptBase || "Você é um atendente de WhatsApp prestativo.",
      persona ? `Persona: ${persona}` : "",
      trainingRulesBlock,
    ].filter(Boolean).join("\n\n");

    const personaSystemPrompt = [
      `Você está simulando um possível cliente conversando por WhatsApp, para testar um agente de atendimento. Perfil: ${personaRow.label}.`,
      traitsToText(personaRow.traits) ? `Características: ${traitsToText(personaRow.traits)}.` : "",
      "Fale de forma natural e curta, como uma pessoa real digitando no celular. Não revele que isso é uma simulação. Conte seu problema aos poucos, como alguém faria de verdade, sem despejar tudo na primeira mensagem.",
    ].filter(Boolean).join("\n");

    // Histórico em duas visões (papéis invertidos pra cada lado) — mais simples e
    // robusto do que tentar reusar aiMessages de um único lado.
    const personaHistory: ChatMessage[] = [{ role: "system", content: personaSystemPrompt }];
    const agentHistory: ChatMessage[] = [{ role: "system", content: agentSystemPrompt }];
    const transcript: Array<{ role: "persona" | "agent"; content: string }> = [];

    let debugError: string | null = null;

    for (let turn = 0; turn < maxTurns; turn++) {
      personaHistory.push({
        role: "user",
        content: turn === 0
          ? "Inicie a conversa contando seu problema, como se fosse a primeira mensagem que você manda pra esse atendimento."
          : "Continue a conversa normalmente, respondendo ao que o atendente disse.",
      });
      const personaResult = await callChat(OPENAI_CHAT_ENDPOINT, personaConfig.apiKey, personaConfig.model, personaHistory);
      if (!personaResult.content) { debugError = `Persona (${personaConfig.model}): ${personaResult.error}`; break; }
      personaHistory.push({ role: "assistant", content: personaResult.content });
      agentHistory.push({ role: "user", content: personaResult.content });
      transcript.push({ role: "persona", content: personaResult.content });

      const agentResult = await callChat(OPENAI_CHAT_ENDPOINT, agentConfig.apiKey, agentConfig.model, agentHistory);
      if (!agentResult.content) { debugError = `Agente (${agentConfig.model}): ${agentResult.error}`; break; }
      agentHistory.push({ role: "assistant", content: agentResult.content });
      personaHistory.push({ role: "user", content: agentResult.content });
      transcript.push({ role: "agent", content: agentResult.content });
    }

    // Avaliador: papel separado, não participa da conversa — só analisa depois.
    const transcriptText = transcript.map((m) => `${m.role === "persona" ? "Cliente" : "Agente"}: ${m.content}`).join("\n");
    const evaluatorSystemPrompt = "Você avalia a qualidade de um atendimento simulado de WhatsApp. Responda SOMENTE com um JSON válido, sem markdown, no formato: " +
      '{"criteria": [{"label": string, "passed": boolean}], "suggestion": string, "score": number (0-100), "goalReached": boolean}. ' +
      "Critérios sugeridos (adapte se fizer sentido): coletou os dados certos, manteve tom natural, avançou a conversa em direção a um próximo passo (ex.: agendamento). " +
      "\"suggestion\" deve ser um ajuste concreto e acionável de comportamento do agente (situação + o que fazer diferente), não um comentário genérico.";
    const evaluationResult = transcript.length > 0
      ? await callChat(OPENAI_CHAT_ENDPOINT, evaluatorConfig.apiKey, evaluatorConfig.model, [
          { role: "system", content: evaluatorSystemPrompt },
          { role: "user", content: transcriptText },
        ])
      : { content: null, error: "sem transcrição pra avaliar" };
    if (!evaluationResult.content && !debugError) debugError = `Avaliador (${evaluatorConfig.model}): ${evaluationResult.error}`;

    let evaluation: { criteria: Array<{ label: string; passed: boolean }>; suggestion: string; score: number; goalReached: boolean } = {
      criteria: [],
      suggestion: "",
      score: 0,
      goalReached: false,
    };
    if (evaluationResult.content) {
      try {
        const cleaned = evaluationResult.content.replace(/^```json\s*|```$/g, "").trim();
        evaluation = { ...evaluation, ...JSON.parse(cleaned) };
      } catch (e) {
        console.error("agent-tester-run: falha ao parsear avaliação", e, evaluationResult.content);
      }
    }

    // Sessão: reusa se veio sessionId (rodada em massa/nova conversa na mesma
    // sessão), senão cria uma nova.
    let sessionId = body.sessionId || null;
    if (!sessionId) {
      const { data: session, error: sessionError } = await service
        .from("agent_test_sessions")
        .insert({
          organization_id: organizationId,
          target_type: body.targetType,
          target_id: body.targetId,
          mode: "manual",
          created_by: auth.userId,
        })
        .select("id")
        .single();
      if (sessionError) return errorResponse(`Erro ao criar sessão: ${sessionError.message}`, 500);
      sessionId = session.id;
    }

    const { data: roundData } = await service
      .from("agent_test_conversations")
      .select("round_number")
      .eq("session_id", sessionId)
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const roundNumber = (roundData?.round_number || 0) + 1;

    const { data: conversation, error: conversationError } = await service
      .from("agent_test_conversations")
      .insert({
        session_id: sessionId,
        persona_id: body.personaId,
        transcript,
        goal_reached: evaluation.goalReached,
        score: evaluation.score,
        evaluation_notes: { criteria: evaluation.criteria, suggestion: evaluation.suggestion },
        round_number: roundNumber,
      })
      .select("*")
      .single();
    if (conversationError) return errorResponse(`Erro ao gravar conversa: ${conversationError.message}`, 500);

    return jsonResponse({ sessionId, conversation, debugError });
  } catch (error: any) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    console.error("agent-tester-run error:", error);
    return errorResponse(error?.message || "Erro interno", 500);
  }
});
