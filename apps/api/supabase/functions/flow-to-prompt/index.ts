import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function resolveAIConfig(integrationConfig: any, feature: string) {
  const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
  const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

  if (!integrationConfig) return null;

  const featureProvider = integrationConfig[`${feature}_provider`];
  const featureModel = integrationConfig[`${feature}_model`];
  let provider = featureProvider || integrationConfig.ai_provider;
  let model = featureModel || integrationConfig.default_model;

  if (!provider || provider === 'lovable') {
    if (integrationConfig.openai_api_key) { provider = 'openai'; model = model || 'gpt-4o-mini'; }
    else if (integrationConfig.gemini_api_key) { provider = 'gemini'; model = model || 'gemini-2.0-flash'; }
    else return null;
  }
  if (provider === 'gemini') model = (model || 'gemini-2.0-flash').replace('google/', '');
  else if (provider === 'openai') model = (model || 'gpt-4o-mini').replace('openai/', '');

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
    const { nodes, edges, organizationId } = await req.json();

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

    const systemPrompt = `Você é um especialista em criar prompts de personalidade para agentes de IA de atendimento via WhatsApp.

Você receberá uma estrutura JSON contendo "nodes" (blocos do fluxo) e "edges" (conexões entre blocos) de um orquestrador visual.

IMPORTANTE: O fluxo visual já controla a EXECUÇÃO (qual ação executar, quando trocar de agente, quando adicionar tags, etc). 
Você NÃO deve gerar instruções de execução.

Sua tarefa é gerar APENAS um prompt de PERSONALIDADE e COMPORTAMENTO que define:
1. O tom e estilo de comunicação (formal, informal, amigável, profissional)
2. A persona do assistente (nome, papel, como se apresenta)
3. Regras de comportamento (o que fazer e não fazer)
4. O nicho/contexto do atendimento baseado nos agentes e fluxo
5. Diretrizes de linguagem (português brasileiro, emoji, etc)

NÃO inclua:
- Instruções sobre quando adicionar tags
- Instruções sobre quando mover pipeline
- Instruções sobre quando trocar de agente
- Instruções sobre quando disparar fluxos
- Qualquer instrução de SEQUÊNCIA ou EXECUÇÃO

O prompt gerado será usado como contexto de personalidade. A execução do fluxo é controlada pelo motor de estado do sistema.

Retorne APENAS o prompt de personalidade, sem explicações adicionais.`;

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
          { role: "user", content: JSON.stringify({ nodes, edges }) },
        ],
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
    const prompt = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ prompt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("flow-to-prompt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
