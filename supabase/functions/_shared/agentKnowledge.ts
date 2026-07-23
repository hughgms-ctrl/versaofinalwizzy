import { resolveOpenAIConfig } from './aiStrategy.ts';

const OPENAI_EMBEDDINGS_ENDPOINT = 'https://api.openai.com/v1/embeddings';

// Busca RAG: transforma a mensagem atual do cliente em embedding e recupera
// os pedaços mais parecidos da base de conhecimento DESTE agente (ver
// conversa com o usuário -- nunca o arquivo inteiro no prompt, só os trechos
// relevantes pra pergunta de agora). `supabase` precisa ser o client
// service_role (a RPC match_agent_knowledge_chunks só concede EXECUTE pra
// service_role).
//
// Sempre falha em silêncio (retorna '') -- um problema na base de
// conhecimento (sem chave de IA, embedding fora do ar, etc.) nunca deve
// derrubar a conversa; o agente simplesmente responde sem esse contexto extra.
export async function buildKnowledgeBlock(
  supabase: any,
  organizationId: string | null | undefined,
  agentId: string | null | undefined,
  queryText: string | null | undefined,
): Promise<string> {
  if (!agentId || !queryText?.trim()) return '';

  try {
    // Pula a chamada de embedding inteira se o agente não tem nenhum arquivo
    // na base de conhecimento -- é a maioria dos agentes hoje, sem custo ou
    // latência extra pra quem não usa a feature.
    const { count } = await supabase
      .from('agent_knowledge_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId);
    if (!count) return '';

    const aiConfig = await resolveOpenAIConfig(supabase, organizationId, 'knowledge_base_embedding');
    if (!aiConfig) return '';

    const embedRes = await fetch(OPENAI_EMBEDDINGS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiConfig.apiKey}` },
      body: JSON.stringify({ model: aiConfig.model, input: queryText.slice(0, 8000) }),
    });
    if (!embedRes.ok) {
      console.error('buildKnowledgeBlock: embeddings request failed', embedRes.status, await embedRes.text());
      return '';
    }
    const embedData = await embedRes.json();
    const queryEmbedding = embedData?.data?.[0]?.embedding;
    if (!queryEmbedding) return '';

    const { data: chunks, error } = await supabase.rpc('match_agent_knowledge_chunks', {
      _agent_id: agentId,
      _query_embedding: queryEmbedding,
      _match_count: 6,
    });
    if (error || !chunks?.length) return '';

    const body = (chunks as any[]).map((c) => c.content).join('\n---\n');
    return `BASE DE CONHECIMENTO (trechos dos arquivos deste agente, relevantes pra pergunta atual -- use isto pra responder, não invente informação que não está aqui):\n${body}`;
  } catch (e) {
    console.error('buildKnowledgeBlock error:', e);
    return '';
  }
}
