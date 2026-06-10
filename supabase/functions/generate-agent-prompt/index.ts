import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessError, assertActiveOrganizationAccess, getRequestUser } from '../_shared/access.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function resolveAIConfig(integrationConfig: any, feature: string) {
  const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

  const featureProvider = integrationConfig?.[`${feature}_provider`];
  const featureModel = integrationConfig?.[`${feature}_model`];
  let provider = featureProvider || integrationConfig?.ai_provider || 'openai';
  let model = featureModel || integrationConfig?.default_model || 'google/gemini-3-flash-preview';

  provider = 'openai';
  model = (model || 'gpt-4o-mini').replace('openai/', '').replace('google/', '');
  if (!integrationConfig?.openai_api_key) return null;
  return { endpoint: OPENAI_ENDPOINT, apiKey: integrationConfig.openai_api_key, model };
}

async function applyAdminAIStrategy(supabase: any, organizationId: string, integrationConfig: any, feature: string) {
  const { data: planRow } = await supabase
    .from('organization_plans')
    .select('plan:platform_plans(ai_mode)')
    .eq('organization_id', organizationId)
    .maybeSingle();
  const { data: settingRow } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'ai_model_strategy')
    .maybeSingle();
  const strategy = settingRow?.value || {};
  const model = strategy.features?.[feature] || strategy.default_model || 'gpt-4o-mini';
  const platformKey = Deno.env.get('WIZZY_OPENAI_API_KEY') || Deno.env.get('OPENAI_API_KEY') || '';
  const usePlatformKey = (planRow as any)?.plan?.ai_mode === 'platform_api';
  return {
    ...(integrationConfig || {}),
    ai_provider: 'openai',
    default_model: model,
    [`${feature}_provider`]: 'openai',
    [`${feature}_model`]: model,
    openai_api_key: usePlatformKey ? platformKey : integrationConfig?.openai_api_key,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    const {
      userDescription,
      agentName,
      agentRole,
      organizationId,
      mode = 'generation',
      messages: chatMessages = [],
      systemPrompt: customSystemPrompt
    } = payload;
    if (!organizationId) {
      return new Response(JSON.stringify({ error: "Organizacao obrigatoria." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = await getRequestUser(req);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await assertActiveOrganizationAccess(supabase, user.id, organizationId, { module: 'agents' });
    const { data } = await supabase.from('integration_configs').select('*').eq('organization_id', organizationId).maybeSingle();
    const integrationConfig = await applyAdminAIStrategy(supabase, organizationId, data, mode === 'chat' ? 'agents' : 'prompt_generation');

    const aiConfig = resolveAIConfig(integrationConfig, mode === 'chat' ? 'agents' : 'prompt_generation');
    if (!aiConfig) {
      return new Response(JSON.stringify({ error: "Nenhum provedor de IA configurado. Acesse Configurações > Integrações e adicione sua chave de API." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let finalSystemPrompt = customSystemPrompt;
    let finalMessages = chatMessages;

    if (mode === 'generation') {
      finalSystemPrompt = `Você é um especialista em criar prompts para agentes de IA de atendimento ao cliente via WhatsApp em escritórios de advocacia.

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

      finalMessages = [
        { role: "system", content: finalSystemPrompt },
        { role: "user", content: userDescription },
      ];
    } else {
      // Chat mode - use provided messages and system prompt
      if (finalSystemPrompt) {
        finalMessages = [
          { role: "system", content: finalSystemPrompt },
          ...chatMessages
        ];
      }
    }

    console.log(`[generate-agent-prompt] Mode: ${mode}, Model: ${aiConfig.model}`);

    const response = await fetch(aiConfig.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: finalMessages,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify(mode === 'generation' ? { prompt: content } : { content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof AccessError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("generate-agent-prompt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
