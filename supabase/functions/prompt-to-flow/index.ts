import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function resolveAIConfig(integrationConfig: any, feature: string, _lovableApiKey?: string) {
  const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
  const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

  if (!integrationConfig) {
    return null;
  }

  const featureProvider = integrationConfig[`${feature}_provider`];
  const featureModel = integrationConfig[`${feature}_model`];
  let provider = featureProvider || integrationConfig.ai_provider;
  let model = featureModel || integrationConfig.default_model;

  if (!provider || provider === 'lovable') {
    if (integrationConfig.openai_api_key) {
      provider = 'openai';
      model = model || 'gpt-4o-mini';
    } else if (integrationConfig.gemini_api_key) {
      provider = 'gemini';
      model = model || 'gemini-2.0-flash';
    } else {
      return null;
    }
  }

  if (provider === 'gemini') {
    model = (model || 'gemini-2.0-flash').replace('google/', '');
  } else if (provider === 'openai') {
    model = (model || 'gpt-4o-mini').replace('openai/', '');
  }

  switch (provider) {
    case 'openai':
      if (!integrationConfig.openai_api_key) return null;
      return { endpoint: OPENAI_ENDPOINT, apiKey: integrationConfig.openai_api_key, model };
    case 'gemini':
      if (!integrationConfig.gemini_api_key) return null;
      return { endpoint: GEMINI_ENDPOINT, apiKey: integrationConfig.gemini_api_key, model };
    default:
      return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, availableAgents, availableTags, availablePipelines, availableFlows, organizationId } = await req.json();

    // Resolve AI config
    let integrationConfig = null;
    if (organizationId) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data } = await supabase.from('integration_configs').select('*').eq('organization_id', organizationId).maybeSingle();
      integrationConfig = data;
    }
    const aiConfig = resolveAIConfig(integrationConfig, 'flow_generation');
    if (!aiConfig) {
      return new Response(JSON.stringify({ error: "Nenhum provedor de IA configurado. Acesse Configurações > Integrações e adicione sua chave de API." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um especialista em montar fluxos visuais de orquestração de agentes de IA para atendimento via WhatsApp.

O usuário vai descrever em texto como quer que o fluxo de orquestração funcione. Sua tarefa é usar a ferramenta "build_flow" para retornar a estrutura de nodes e edges do fluxo visual.

Tipos de nodes disponíveis:
- orch-trigger: Gatilho de entrada (sempre deve existir exatamente 1). Data: { label, triggerType: "disabled"|"tag"|"keyword", triggerTags: string[], triggerKeywords: [{value, match_type}] }
- orch-agent: Agente de IA. Data: { label, agentId, agentName, additionalPrompt }
- orch-pipeline: Mover para pipeline. Data: { label, pipelineId, columnId, pipelineName }
- orch-tag: Gerenciar tag. Data: { label, action: "add"|"remove", tagId, tagName }
- orch-department: Mudar departamento. Data: { label, departmentName }
- orch-flow: Disparar fluxo. Data: { label, flowId, flowName }
- orch-delay: Intervalo. Data: { label, delaySeconds }
- orch-condition: Condição. Data: { label, conditionLabel, variable, operator: "equals"|"not_equals"|"contains", value }
- orch-human: Escalação humana. Data: { label }

Regras de posicionamento (FLUXO HORIZONTAL, da esquerda para a direita):
- O trigger node deve ficar em position { x: 50, y: 200 }
- Nodes subsequentes devem ser posicionados HORIZONTALMENTE com ~250px de espaçamento no eixo X
- Para branches (condições), separe VERTICALMENTE com ~150px no eixo Y
- O fluxo segue da ESQUERDA para a DIREITA
- IDs dos nodes devem seguir o padrão "orch_1", "orch_2", etc. O trigger sempre tem id "trigger-1"
- Handles de conexão ficam nas LATERAIS (source=right, target=left)

Recursos disponíveis para referência:`;

    const contextParts = [];
    if (availableAgents?.length) {
      contextParts.push(`Agentes: ${availableAgents.map((a: any) => `${a.name} (id: ${a.id})`).join(", ")}`);
    }
    if (availableTags?.length) {
      contextParts.push(`Tags: ${availableTags.map((t: any) => `${t.name} (id: ${t.id})`).join(", ")}`);
    }
    if (availablePipelines?.length) {
      contextParts.push(`Pipelines: ${availablePipelines.map((p: any) => `${p.name} (id: ${p.id}, colunas: ${p.columns?.map((c: any) => `${c.name}(${c.id})`).join(", ") || "nenhuma"})`).join("; ")}`);
    }
    if (availableFlows?.length) {
      contextParts.push(`Fluxos: ${availableFlows.map((f: any) => `${f.name} (id: ${f.id})`).join(", ")}`);
    }

    const fullSystem = systemPrompt + "\n" + contextParts.join("\n");

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
                    type: { type: "string", enum: ["orch-trigger", "orch-agent", "orch-pipeline", "orch-tag", "orch-department", "orch-flow", "orch-delay", "orch-condition", "orch-human"] },
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
    console.error("prompt-to-flow error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
