import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ALWAYS return 200 so supabase.functions.invoke doesn't throw generic errors
function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fail(errorMsg: string) {
  console.error('[TRAIN-AI] Returning error:', errorMsg);
  return ok({ success: false, error: errorMsg });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let payload: Record<string, any>;
    try {
      payload = await req.json();
    } catch {
      return fail('JSON inválido no body da requisição');
    }

    const { mode, feedback, target, context, organizationId, messageId, originalMessage } = payload;

    console.log(`[TRAIN-AI] mode=${mode}, target=${target}, orgId=${organizationId}, msgId=${messageId}`);

    // ========== DRAFT MODE ==========
    if (mode === 'draft') {
      if (!feedback) return fail('O campo de feedback é obrigatório para gerar a regra');
      
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) return fail('LOVABLE_API_KEY não está configurada no servidor');

      // Fetch conversation context
      let conversationContext = '';
      if (messageId) {
        try {
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
        } catch (ctxErr) {
          console.warn('[TRAIN-AI] Failed to fetch context, proceeding without it:', ctxErr);
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
        if (resp.status === 429) return fail('Limite de requisições excedido. Tente novamente em alguns segundos.');
        if (resp.status === 402) return fail('Créditos de IA insuficientes.');
        return fail(`Erro no gateway de IA (${resp.status})`);
      }

      const aiData = await resp.json();
      const rawContent = aiData.choices?.[0]?.message?.content?.trim() || '';

      let situation = '';
      let rule = '';
      try {
        const cleaned = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        situation = parsed.situation || '';
        rule = parsed.rule || '';
      } catch {
        situation = 'Situação geral';
        rule = rawContent;
      }

      return ok({ success: true, situation, rule });
    }

    // ========== APPLY MODE ==========
    if (mode !== 'apply') {
      return fail(`Modo inválido: ${mode}`);
    }

    if (!organizationId) {
      return fail('organizationId é obrigatório');
    }

    if (!target) {
      return fail('Selecione onde aplicar a regra (target)');
    }

    const { situation, rule: ruleText } = payload;
    if (!situation && !ruleText && !feedback) {
      return fail('Preencha a situação e a regra');
    }

    const finalSituation = (situation || 'Regra geral').trim();
    const finalRule = (ruleText || feedback || 'Regra não especificada').trim();

    console.log(`[TRAIN-AI] Saving rule. Target: ${target}, situation: "${finalSituation.slice(0, 50)}..."`);

    // Build the training rule record
    const ruleRecord: Record<string, unknown> = {
      organization_id: organizationId,
      target_type: target,
      situation: finalSituation,
      rule: finalRule,
      original_message: originalMessage || null,
      original_feedback: feedback || null,
      message_id: messageId || null,
      is_active: true,
    };

    // Set the correct target reference based on target type
    const ctx = context || {};

    if (target === 'agent') {
      ruleRecord.agent_id = ctx.agentId || null;
      if (!ruleRecord.agent_id) {
        console.warn('[TRAIN-AI] agent target but no agentId provided');
      }
    } else if (target === 'master_prompt') {
      ruleRecord.master_prompt_id = ctx.masterPromptId || null;
      ruleRecord.flow_id = ctx.flowId || null;
    } else if (target === 'flow_node') {
      ruleRecord.flow_id = ctx.flowId || null;
      ruleRecord.node_id = ctx.nodeId || null;
    }

    // Fallback: resolve missing flow_id/node_id from recent flow execution
    if ((target === 'flow_node' || target === 'master_prompt') && !ruleRecord.flow_id && messageId) {
      console.log('[TRAIN-AI] Attempting to resolve flow_id from flow execution...');
      try {
        const { data: msg } = await supabase
          .from('messages')
          .select('conversation_id')
          .eq('id', messageId)
          .single();

        if (msg) {
          const { data: flowExec } = await supabase
            .from('flow_executions')
            .select('flow_id, current_node_id')
            .eq('conversation_id', msg.conversation_id)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (flowExec) {
            if (!ruleRecord.flow_id) ruleRecord.flow_id = flowExec.flow_id;
            if (target === 'flow_node' && !ruleRecord.node_id) ruleRecord.node_id = flowExec.current_node_id;
            console.log(`[TRAIN-AI] Resolved flow_id=${ruleRecord.flow_id}, node_id=${ruleRecord.node_id}`);
          }
        }
      } catch (resolveErr) {
        console.warn('[TRAIN-AI] Failed to resolve flow context:', resolveErr);
      }
    }

    console.log('[TRAIN-AI] Inserting record:', JSON.stringify(ruleRecord));

    const { data: inserted, error: insertError } = await supabase
      .from('agent_training_rules')
      .insert(ruleRecord)
      .select('id')
      .single();

    if (insertError) {
      console.error('[TRAIN-AI] Insert error:', JSON.stringify(insertError));
      return fail(`Erro ao inserir regra no banco: ${insertError.message}`);
    }

    console.log(`[TRAIN-AI] Rule saved successfully. ID: ${inserted?.id}`);

    return ok({ success: true, id: inserted?.id });

  } catch (error: unknown) {
    console.error('[TRAIN-AI] Unhandled error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno do servidor';
    return fail(message);
  }
});
