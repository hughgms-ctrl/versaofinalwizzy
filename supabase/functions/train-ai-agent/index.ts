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
        // Get the message and its conversation
        const { data: msg } = await supabase
          .from('messages')
          .select('conversation_id, created_at')
          .eq('id', messageId)
          .single();

        if (msg) {
          // Fetch surrounding messages for context (last 10 before + the message)
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

Responda APENAS com a regra contextual refinada no formato:
**Situação:** [descrição do cenário]
**Regra:** [o que o agente deve fazer]`;

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
      const refinedFeedback = aiData.choices?.[0]?.message?.content?.trim() || feedback;

      return new Response(JSON.stringify({ success: true, refinedFeedback }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default to 'apply' mode
    if (!feedback || !target) {
      return new Response(JSON.stringify({ error: 'feedback and target are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[TRAIN-AI] Applying feedback for message ${messageId || 'new'}. Target: ${target}`);

    let updateError = null;

    if (target === 'base_agent') {
      const agentId = context?.agentId;
      if (!agentId) throw new Error('agentId is required for base_agent target');

      const { data: agent } = await supabase.from('ai_agents').select('prompt_base').eq('id', agentId).single();
      const currentPrompt = agent?.prompt_base || '';
      const newPrompt = currentPrompt + `\n\n### REGRA DE TREINAMENTO (${new Date().toLocaleDateString()}):\n${feedback}`;
      
      const { error } = await supabase.from('ai_agents').update({ prompt_base: newPrompt }).eq('id', agentId);
      updateError = error;

    } else if (target === 'master_prompt') {
      const promptId = context?.masterPromptId;
      if (!promptId) throw new Error('masterPromptId is required for master_prompt target');

      const { data: prompt } = await supabase.from('master_prompts').select('content').eq('id', promptId).single();
      const currentContent = prompt?.content || '';
      const newContent = currentContent + `\n\n### REGRA DE TREINAMENTO (${new Date().toLocaleDateString()}):\n${feedback}`;

      const { error } = await supabase.from('master_prompts').update({ content: newContent }).eq('id', promptId);
      updateError = error;

    } else if (target === 'flow_node') {
      const flowId = context?.flowId;
      const nodeId = context?.nodeId;
      if (!flowId || !nodeId) throw new Error('flowId and nodeId are required for flow_node target');

      const { data: flow } = await supabase.from('flows').select('nodes').eq('id', flowId).single();
      const nodes = (flow?.nodes || []) as any[];
      const nodeIndex = nodes.findIndex((n: any) => n.id === nodeId);

      if (nodeIndex !== -1) {
        const node = nodes[nodeIndex];
        node.data = node.data || {};
        const oldPrompt = node.data.additionalPrompt || '';
        node.data.additionalPrompt = oldPrompt + `\n\n### REGRA DE TREINAMENTO (${new Date().toLocaleDateString()}):\n${feedback}`;
        
        const { error } = await supabase.from('flows').update({ nodes }).eq('id', flowId);
        updateError = error;
      } else {
        throw new Error('Node not found in flow');
      }
    }

    if (updateError) {
      console.error('[TRAIN-AI] Update error:', updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
