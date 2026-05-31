import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getOrganizationIdFromRequest, resolveOpenAIConfig } from "../_shared/aiStrategy.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatDelay(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)} segundos`;
  if (minutes < 60) return `${Math.round(minutes)} minutos`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hora${minutes >= 120 ? 's' : ''}`;
  return `${Math.round(minutes / 1440)} dia${minutes >= 2880 ? 's' : ''}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { context, steps, organizationId: bodyOrganizationId } = await req.json();

    if (!context || !steps?.length) {
      return new Response(JSON.stringify({ error: 'context and steps are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const organizationId = await getOrganizationIdFromRequest(supabase, req, bodyOrganizationId);
    const aiConfig = await resolveOpenAIConfig(supabase, organizationId, 'remarketing');
    if (!aiConfig) throw new Error('OpenAI não configurada para gerar remarketing');

    const stepsDescription = steps.map((s: any, i: number) =>
      `Tentativa ${i + 1}: após ${formatDelay(s.delayMinutes)} sem resposta`
    ).join('\n');

    const systemPrompt = `Você é um especialista em copywriting para WhatsApp e remarketing conversacional.
Gere mensagens de follow-up naturais, variadas e que NÃO pareçam automatizadas.
Cada mensagem deve ter um tom diferente e se adaptar ao tempo que passou.
- Mensagens curtas (até 2 frases para intervalos curtos)
- Tom casual e amigável nos intervalos curtos
- Tom mais profissional/urgente nos intervalos longos
- Use emojis com moderação
- Nunca repita a mesma estrutura
- As mensagens devem soar como se uma pessoa real estivesse escrevendo
- Use variações: pergunta, lembrete, oferta de ajuda, urgência sutil`;

    const userPrompt = `Contexto da conversa: "${context}"

Gere UMA mensagem de follow-up para cada tentativa abaixo:

${stepsDescription}

Retorne usando a tool "set_messages" com as mensagens geradas.`;

    const response = await fetch(aiConfig.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'set_messages',
            description: 'Set the remarketing messages for each step',
            parameters: {
              type: 'object',
              properties: {
                messages: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      index: { type: 'number', description: 'Step index (0-based)' },
                      message: { type: 'string', description: 'The follow-up message' },
                    },
                    required: ['index', 'message'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['messages'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'set_messages' } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[REMARKETING AI] Error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, try again later' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required for AI credits' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      throw new Error('No tool call response from AI');
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const generatedMessages = parsed.messages || [];

    // Merge messages back into steps
    const updatedSteps = steps.map((s: any, i: number) => {
      const generated = generatedMessages.find((m: any) => m.index === i);
      return {
        ...s,
        message: generated?.message || s.message || '',
      };
    });

    return new Response(JSON.stringify({ steps: updatedSteps }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[REMARKETING AI] Fatal:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
