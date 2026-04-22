import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function resolveAIConfig(integrationConfig: any, feature: string) {
  const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
  const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  const LOVABLE_ENDPOINT = 'https://ai.gateway.lovable.dev/v1/chat/completions';

  const featureProvider = integrationConfig?.[`${feature}_provider`];
  const featureModel = integrationConfig?.[`${feature}_model`];
  let provider = featureProvider || integrationConfig?.ai_provider || 'lovable';
  let model = featureModel || integrationConfig?.default_model || 'google/gemini-3-flash-preview';

  if (provider === 'lovable') {
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (lovableKey) {
      return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableKey, model: model || 'google/gemini-3-flash-preview' };
    }
    if (integrationConfig?.openai_api_key) { provider = 'openai'; model = model || 'gpt-4o-mini'; }
    else if (integrationConfig?.gemini_api_key) { provider = 'gemini'; model = model || 'gemini-2.0-flash'; }
    else return null;
  }

  if (provider === 'gemini') model = (model || 'gemini-2.0-flash').replace('google/', '');
  else if (provider === 'openai') model = (model || 'gpt-4o-mini').replace('openai/', '');

  switch (provider) {
    case 'openai':
      if (!integrationConfig?.openai_api_key) return null;
      return { endpoint: OPENAI_ENDPOINT, apiKey: integrationConfig.openai_api_key, model };
    case 'gemini':
      if (!integrationConfig?.gemini_api_key) return null;
      return { endpoint: GEMINI_ENDPOINT, apiKey: integrationConfig.gemini_api_key, model };
    default:
      return null;
  }
}

const SYSTEM_PROMPT = `Você é um especialista em análise de prompts de agentes de IA jurídicos/comerciais.

Sua tarefa: ler o prompt/instruções de um agente e EXTRAIR todos os critérios objetivos de QUALIFICAÇÃO de leads que aparecem nele.

O que conta como critério de qualificação:
- Condições numéricas (idade mínima, tempo de contribuição, valor mínimo, prazo)
- Requisitos obrigatórios ("precisa ter", "deve possuir", "é necessário", "exigido")
- Listas de aceitação ("aceita se", "qualifica quando", "atende quando")
- Requisitos documentais (CPF, RG, laudo, comprovante)
- Condições de elegibilidade legais (tempo de carência, doença prevista, regime)

O que NÃO conta:
- Tom de voz, persona, estilo de comunicação
- Instruções operacionais ("pergunte com educação", "responda em até 2 frases")
- Definições de saída ("ao final escreva [RESULTADO: x]")
- Informações sobre a empresa ou contexto

Para cada critério encontrado, gere:
- "label": nome curto (2-5 palavras), em português
- "criteria": frase clara descrevendo o que precisa ser validado, em português

Se o prompt não tiver nenhum critério objetivo, retorne lista vazia.
Não invente critérios que não estão no texto.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, organizationId } = await req.json();

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 10) {
      return new Response(JSON.stringify({ error: "Prompt vazio ou muito curto." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let integrationConfig = null;
    if (organizationId) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data } = await supabase.from('integration_configs').select('*').eq('organization_id', organizationId).maybeSingle();
      integrationConfig = data;
    }

    const aiConfig = resolveAIConfig(integrationConfig, 'prompt_generation');
    if (!aiConfig) {
      return new Response(JSON.stringify({ error: "Nenhum provedor de IA configurado." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = {
      model: aiConfig.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Analise este prompt e extraia os critérios de qualificação:\n\n---\n${prompt}\n---` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_rules",
          description: "Retorna a lista de critérios de qualificação extraídos do prompt.",
          parameters: {
            type: "object",
            properties: {
              rules: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "Nome curto do critério" },
                    criteria: { type: "string", description: "Descrição clara do que validar" },
                  },
                  required: ["label", "criteria"],
                  additionalProperties: false,
                },
              },
            },
            required: ["rules"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_rules" } },
    };

    const aiResp = await fetch(aiConfig.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${aiConfig.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "Erro na IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    let rules: { label: string; criteria: string }[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        rules = Array.isArray(parsed?.rules) ? parsed.rules : [];
      } catch (e) {
        console.error("Failed to parse tool args", e);
      }
    }

    rules = rules
      .filter(r => r && typeof r.label === 'string' && typeof r.criteria === 'string' && r.label.trim() && r.criteria.trim())
      .map(r => ({ label: r.label.trim().slice(0, 100), criteria: r.criteria.trim().slice(0, 500) }));

    return new Response(JSON.stringify({ rules }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-qualification-rules error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
