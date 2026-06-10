import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessError, assertActiveOrganizationAccess, getRequestUser } from '../_shared/access.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function resolveAIConfig(integrationConfig: any, feature: string, _lovableApiKey?: string) {
  const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

  if (!integrationConfig) {
    return null;
  }

  const featureProvider = integrationConfig[`${feature}_provider`];
  const featureModel = integrationConfig[`${feature}_model`];
  const model = (featureModel || integrationConfig.default_model || 'gpt-4o-mini').replace('openai/', '').replace('google/', '');
  if ((featureProvider || integrationConfig.ai_provider) !== 'openai') integrationConfig.ai_provider = 'openai';
  if (!integrationConfig.openai_api_key) return null;
  return { endpoint: OPENAI_ENDPOINT, apiKey: integrationConfig.openai_api_key, model };
}

async function applyAdminAIStrategy(supabase: any, organizationId: string, integrationConfig: any, feature: string) {
  const { data: planRow } = await supabase.from('organization_plans').select('plan:platform_plans(ai_mode)').eq('organization_id', organizationId).maybeSingle();
  const { data: settingRow } = await supabase.from('platform_settings').select('value').eq('key', 'ai_model_strategy').maybeSingle();
  const strategy = settingRow?.value || {};
  const model = strategy.features?.[feature] || strategy.default_model || 'gpt-4o-mini';
  const platformKey = Deno.env.get('WIZZY_OPENAI_API_KEY') || Deno.env.get('OPENAI_API_KEY') || '';
  const usePlatformKey = (planRow as any)?.plan?.ai_mode === 'platform_api';
  return { ...(integrationConfig || {}), ai_provider: 'openai', default_model: model, [`${feature}_provider`]: 'openai', [`${feature}_model`]: model, openai_api_key: usePlatformKey ? platformKey : integrationConfig?.openai_api_key };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, availableAgents, availableTags, availablePipelines, availableFlows, organizationId } = await req.json();
    if (!organizationId) {
      return new Response(JSON.stringify({ error: "Organizacao obrigatoria." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve AI config
    const user = await getRequestUser(req);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await assertActiveOrganizationAccess(supabase, user.id, organizationId, { module: 'flows' });
    const { data } = await supabase.from('integration_configs').select('*').eq('organization_id', organizationId).maybeSingle();
    const integrationConfig = await applyAdminAIStrategy(supabase, organizationId, data, 'flow_generation');
    const aiConfig = resolveAIConfig(integrationConfig, 'flow_generation');
    if (!aiConfig) {
      return new Response(JSON.stringify({ error: "Nenhum provedor de IA configurado. Acesse Configurações > Integrações e adicione sua chave de API." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um especialista em montar fluxos visuais de automação para atendimento via WhatsApp.

O usuário vai descrever em texto como quer que o fluxo funcione. Sua tarefa é usar a ferramenta "build_flow" para retornar a estrutura de nodes e edges do fluxo visual.

TIPOS DE NODES DISPONÍVEIS (use EXATAMENTE estes tipos):

1. "start" - Início do fluxo (OBRIGATÓRIO, sempre exatamente 1). Data: { label: "Início" }

2. "content-block" - Bloco de conteúdo (texto, mídia). Data: { label, items: [{ id, type: "text"|"image"|"video"|"audio"|"document"|"delay", content?, mediaUrl?, caption?, delaySeconds? }] }

3. "message-buttons" - Mensagem com botões de resposta rápida (máx 3 botões). Data: { label, text: "mensagem", buttons: [{ id, label }] }
   - Cada botão gera uma saída separada via sourceHandle "btn_0", "btn_1", "btn_2"
   - Também tem saída "timeout" para quando não responde

4. "message-list" - Lista interativa com opções. Data: { label, content: "mensagem", sections: [{ title, rows: [{ id, title, description? }] }] }
   - Cada row gera saída via sourceHandle "row_0", "row_1", etc.
   - Também tem saída "timeout"

5. "ai-handoff" - Agente de IA (direciona conversa para IA). Data: { label, agentId, agentName, expectedOutcomes?: "Qualificado,Não Qualificado" }
   - Se expectedOutcomes for definido, gera saídas via sourceHandle "outcome-Qualificado", "outcome-Não Qualificado", "outcome-default"

6. "action-tag" - Atribuir/remover tag. Data: { label, action: "add"|"remove", tagId, tagName }

7. "action-pipeline" - Mover para pipeline/coluna. Data: { label, pipelineId, columnId, pipelineName, pipelineColumnName }

8. "action-transfer" - Escalação humana. Data: { label }

9. "action-delay" - Pausa simples. Data: { label, delaySeconds: number }

10. "action-webhook" - Webhook externo. Data: { label, webhookUrl }

11. "action-flow" - Iniciar outro fluxo. Data: { label, flowId, flowName }

12. "action-department" - Mudar departamento. Data: { label, departmentName }

13. "action-document" - Gerar documento. Data: { label, templateName, signingMethod: "Manual"|"OTP" }

14. "action-workspace" - Atribuir workspace. Data: { label, workspaceName }

15. "condition" - Condição/ramificação. Data: { label, conditionLabel, rules: [{ id, type: "tag"|"pipeline"|"assigned"|"variable"|"contact_field"|"service_mode", tagId?, pipelineId?, columnId?, variable?, operator?: "equals"|"not_equals"|"contains", value? }], matchType: "all"|"any" }
    - Saídas: sourceHandle "true" (Sim) e "false" (Não)

16. "user-input" - Pergunta ao usuário. Data: { label, variableName, inputType: "text"|"number"|"email"|"phone"|"cpf" }
    - Saídas: sourceHandle "responded" e "timeout"

17. "randomizer" - Teste A/B. Data: { label, variants: [{ id: "A", label: "Variante A", weight: 50 }, { id: "B", label: "Variante B", weight: 50 }] }
    - Saídas: sourceHandle por variant id ("A", "B")

18. "smart-delay" - Atraso inteligente. Data: { label, delayType: "fixed"|"until_time"|"until_business_hours", fixedMinutes?, time? }

REGRAS DE POSICIONAMENTO (FLUXO HORIZONTAL, esquerda → direita):
- O node "start" deve ficar em position { x: 50, y: 200 }
- Nodes subsequentes: espaçamento de ~280px no eixo X
- Para branches (condições, botões), separe verticalmente com ~180px no eixo Y
- IDs: "start-1" para o início, depois "node_1", "node_2", etc.

REGRAS DE CONEXÃO (edges):
- source e target são IDs dos nodes
- Use sourceHandle quando o node tem múltiplas saídas (botões, condições, etc.)
- O node "start" só tem saída (source), sem entrada
- Todos os outros nodes têm entrada (target) e saída (source)

IMPORTANTE:
- Sempre use os IDs reais de agentes, tags, pipelines e fluxos quando disponíveis
- Se o recurso mencionado não existir na lista, use o nome como referência sem ID
- O fluxo DEVE começar com um node "start"`;

    const contextParts = [];
    if (availableAgents?.length) {
      contextParts.push(`Agentes disponíveis: ${availableAgents.map((a: any) => `${a.name} (id: ${a.id})`).join(", ")}`);
    }
    if (availableTags?.length) {
      contextParts.push(`Tags disponíveis: ${availableTags.map((t: any) => `${t.name} (id: ${t.id})`).join(", ")}`);
    }
    if (availablePipelines?.length) {
      contextParts.push(`Pipelines disponíveis: ${availablePipelines.map((p: any) => `${p.name} (id: ${p.id}, colunas: ${p.columns?.map((c: any) => `${c.name}(${c.id})`).join(", ") || "nenhuma"})`).join("; ")}`);
    }
    if (availableFlows?.length) {
      contextParts.push(`Fluxos disponíveis: ${availableFlows.map((f: any) => `${f.name} (id: ${f.id})`).join(", ")}`);
    }

    const fullSystem = systemPrompt + (contextParts.length ? "\n\nRECURSOS DISPONÍVEIS:\n" + contextParts.join("\n") : "");

    const nodeTypeEnum = [
      "start", "content-block", "message-buttons", "message-list",
      "ai-handoff", "action-tag", "action-pipeline", "action-transfer",
      "action-delay", "action-webhook", "action-flow", "action-department",
      "action-document", "action-workspace", "condition", "user-input",
      "randomizer", "smart-delay"
    ];

    const tools = [
      {
        type: "function",
        function: {
          name: "build_flow",
          description: "Constrói o fluxo visual com nodes e edges baseado na descrição do usuário.",
          parameters: {
            type: "object",
            properties: {
              nodes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    type: { type: "string", enum: nodeTypeEnum },
                    position: {
                      type: "object",
                      properties: { x: { type: "number" }, y: { type: "number" } },
                      required: ["x", "y"],
                      additionalProperties: false,
                    },
                    data: { type: "object" },
                  },
                  required: ["id", "type", "position", "data"],
                  additionalProperties: false,
                },
              },
              edges: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    source: { type: "string" },
                    target: { type: "string" },
                    sourceHandle: { type: "string" },
                    targetHandle: { type: "string" },
                  },
                  required: ["id", "source", "target"],
                  additionalProperties: false,
                },
              },
            },
            required: ["nodes", "edges"],
            additionalProperties: false,
          },
        },
      },
    ];

    const response = await fetch(aiConfig.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: "system", content: fullSystem },
          { role: "user", content: prompt },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "build_flow" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        try {
          const parsed = JSON.parse(content);
          return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch {
          throw new Error("Could not parse AI response");
        }
      }
      throw new Error("No tool call in response");
    }

    const flowData = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(flowData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof AccessError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("prompt-to-flow error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
