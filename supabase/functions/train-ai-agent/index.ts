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

      const systemPrompt = `Você é um engenheiro de prompts especialista. 
Sua tarefa é transformar um feedback informal de um usuário em uma instrução técnica clara e concisa para um agente de IA.
Traduza o feedback em português brasileiro.

MENSAGEM ORIGINAL DA IA: "${originalMessage || 'Não fornecida'}"
FEEDBACK DO USUÁRIO: "${feedback}"

Responda APENAS com a instrução refinada, sem comentários adicionais.`;

      const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LOVABLE_API_KEY}`
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-exp',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: feedback }],
          temperature: 0.7,
        })
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`AI Gateway error: ${err}`);
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
      const newPrompt = (agent.prompt_base || '') + `\n\n### AJUSTE DE TREINAMENTO (${new Date().toLocaleDateString()}):\n${feedback}`;
      
      const { error } = await supabase.from('ai_agents').update({ prompt_base: newPrompt }).eq('id', agentId);
      updateError = error;

    } else if (target === 'master_prompt') {
      const promptId = context?.masterPromptId;
      if (!promptId) throw new Error('masterPromptId is required for master_prompt target');

      const { data: prompt } = await supabase.from('master_prompts').select('content').eq('id', promptId).single();
      const newContent = (prompt.content || '') + `\n\n### AJUSTE DE TREINAMENTO (${new Date().toLocaleDateString()}):\n${feedback}`;

      const { error } = await supabase.from('master_prompts').update({ content: newContent }).eq('id', promptId);
      updateError = error;

    } else if (target === 'flow_node') {
      const flowId = context?.flowId;
      const nodeId = context?.nodeId;
      if (!flowId || !nodeId) throw new Error('flowId and nodeId are required for flow_node target');

      const { data: flow } = await supabase.from('flows').select('nodes').eq('id', flowId).single();
      const nodes = flow.nodes || [];
      const nodeIndex = nodes.findIndex((n: any) => n.id === nodeId);

      if (nodeIndex !== -1) {
        const node = nodes[nodeIndex];
        node.data = node.data || {};
        const oldPrompt = node.data.additionalPrompt || '';
        node.data.additionalPrompt = oldPrompt + `\n\n### AJUSTE DE TREINAMENTO (${new Date().toLocaleDateString()}):\n${feedback}`;
        
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

  } catch (error) {
    console.error('[TRAIN-AI] Internal error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
