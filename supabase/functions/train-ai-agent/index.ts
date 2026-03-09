import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();
    const { mode, feedback, target, context, organizationId, messageId, originalMessage } = payload;

    if (mode === 'draft') {
      if (!feedback) throw new Error('feedback is required for drafting');
      
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

      // Fetch conversation context around the message for better training
      let conversationContext = '';
      if (messageId) {
        const { data: msg } = await supabase
          .from('messages')
          .select('conversation_id, created_at')
          .eq('id', messageId)
          .single();

        if (msg) {
          const { data: contextMessages } = await supabase
            .from('messages')
            .select('content, direction, type, created_at')
            .eq('conversation_id', msg.conversation_id)
            .lte('created_at', msg.created_at)
            .order('created_at', { ascending: false })
            .limit(10);

          if (contextMessages && contextMessages.length > 0) {
            conversationContext = contextMessages
              .reverse()
              .map((m: any) => {
                const role = m.direction === 'inbound' ? 'CLIENTE' : 'IA';
                const content = m.content || `[${m.type}]`;
                return `${role}: ${content}`;
              })
              .join('\n');
          }
        }
      }

      const systemPrompt = `Você é um engenheiro de prompts especialista em criar regras contextuais para agentes de IA de atendimento.

Sua tarefa é transformar um feedback informal de um usuário em uma REGRA CONTEXTUAL clara e acionável para um agente de IA.

A regra deve:
1. Descrever o CENÁRIO/SITUAÇÃO em que se aplica (baseado no contexto da conversa)
2. Definir claramente o que o agente DEVE fazer diferente
3. Ser específica o suficiente para guiar o agente em situações similares
4. Ser escrita em português brasileiro

${conversationContext ? `CONTEXTO DA CONVERSA:\n${conversationContext}\n` : ''}
MENSAGEM DA IA QUE GEROU O FEEDBACK: "${originalMessage || 'Não fornecida'}"
FEEDBACK DO USUÁRIO: "${feedback}"

Responda em JSON com exatamente dois campos:
{
  "situation": "descrição do cenário em que a regra se aplica",
  "rule": "o que o agente deve fazer diferente"
}

Responda APENAS com o JSON, sem markdown ou comentários.`;

      const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LOVABLE_API_KEY}`
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: feedback }],
          temperature: 0.7,
        })
      });

      if (!resp.ok) {
        const err = await resp.text();
        console.error('[TRAIN-AI] AI Gateway error:', resp.status, err);
        throw new Error(`AI Gateway error: ${resp.status}`);
      }

      const aiData = await resp.json();
      const rawContent = aiData.choices?.[0]?.message?.content?.trim() || '';

      // Parse JSON response
      let situation = '';
      let rule = '';
      try {
        const cleaned = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        situation = parsed.situation || '';
        rule = parsed.rule || '';
      } catch {
        // Fallback: use raw content as rule
        situation = 'Situação geral';
        rule = rawContent;
      }

      return new Response(JSON.stringify({ success: true, situation, rule }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== APPLY MODE ==========
    if (!feedback || !target) {
      return new Response(JSON.stringify({ error: 'feedback and target are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { situation, rule: ruleText } = payload;

    console.log(`[TRAIN-AI] Saving structured rule. Target: ${target}, messageId: ${messageId}`);

    // Build the training rule record
    const ruleRecord: any = {
      organization_id: organizationId,
      target_type: target,
      situation: situation || 'Regra geral',
      rule: ruleText || feedback,
      original_message: originalMessage || null,
      original_feedback: feedback,
      message_id: messageId || null,
      is_active: true,
    };

    // Set the correct target reference
    if (target === 'agent' && context?.agentId) {
      ruleRecord.agent_id = context.agentId;
    } else if (target === 'master_prompt' && context?.masterPromptId) {
      ruleRecord.master_prompt_id = context.masterPromptId;
    } else if (target === 'flow_node' && context?.flowId) {
      ruleRecord.flow_id = context.flowId;
      ruleRecord.node_id = context.nodeId || null;
    }

    const { error: insertError } = await supabase
      .from('agent_training_rules')
      .insert(ruleRecord);

    if (insertError) {
      console.error('[TRAIN-AI] Insert error:', insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[TRAIN-AI] Rule saved successfully for target ${target}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[TRAIN-AI] Internal error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
