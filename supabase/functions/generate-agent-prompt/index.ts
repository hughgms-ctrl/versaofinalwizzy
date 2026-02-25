import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function resolveAIConfig(integrationConfig: any, feature: string, lovableApiKey: string) {
  const LOVABLE_ENDPOINT = 'https://ai.gateway.lovable.dev/v1/chat/completions';
  const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
  const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

  if (!integrationConfig) {
    return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableApiKey, model: 'google/gemini-3-flash-preview' };
  }

  const featureProvider = integrationConfig[`${feature}_provider`];
  const featureModel = integrationConfig[`${feature}_model`];
  const provider = featureProvider || integrationConfig.ai_provider || 'lovable';
  const model = featureModel || integrationConfig.default_model || 'google/gemini-3-flash-preview';

  switch (provider) {
    case 'openai':
      if (!integrationConfig.openai_api_key) return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableApiKey, model: 'google/gemini-3-flash-preview' };
      return { endpoint: OPENAI_ENDPOINT, apiKey: integrationConfig.openai_api_key, model };
    case 'gemini':
      if (!integrationConfig.gemini_api_key) return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableApiKey, model: 'google/gemini-3-flash-preview' };
      return { endpoint: GEMINI_ENDPOINT, apiKey: integrationConfig.gemini_api_key, model };
    default:
      return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableApiKey, model };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userDescription, agentName, agentRole, organizationId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Resolve AI config from org integration settings
    let integrationConfig = null;
    if (organizationId) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data } = await supabase.from('integration_configs').select('*').eq('organization_id', organizationId).maybeSingle();
      integrationConfig = data;
    }
    const aiConfig = resolveAIConfig(integrationConfig, 'prompt_generation', LOVABLE_API_KEY);

    const systemPrompt = `Você é um especialista em criar prompts para agentes de IA de atendimento ao cliente via WhatsApp em escritórios de advocacia.

O usuário vai descrever com suas palavras o que precisa que o agente faça. Sua tarefa é transformar essa descrição em um prompt-base profissional, claro e bem estruturado.

O prompt gerado deve:
- Definir claramente a personalidade e o tom de voz do agente
- Especificar as responsabilidades e ações que o agente deve executar
- Incluir regras de comportamento (o que fazer e o que não fazer)
- Ser em português brasileiro
- Ser formatado de forma organizada com seções claras
- Considerar que o agente faz parte de uma orquestração com outros agentes

Informações do agente:
- Nome: ${agentName}
- Função: ${agentRole}

Retorne APENAS o prompt gerado, sem explicações adicionais.`;

    const response = await fetch(aiConfig.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userDescription },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns segundos." }), {
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
    const prompt = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ prompt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-agent-prompt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
