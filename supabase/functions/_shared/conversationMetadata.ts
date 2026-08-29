/**
 * conversations.metadata sem read-modify-write.
 *
 * Seis ou mais pontos (debounce da IA, handoff, pausa da IA, fim de fluxo,
 * estado do orquestrador) faziam SELECT metadata → espalha → UPDATE metadata
 * inteiro. Dois deles rodando ao mesmo tempo na mesma conversa — o que passa a
 * ser rotina com orquestrador e webhook em paralelo — perdiam a escrita um do
 * outro: o handoff sumia, o estado do fluxo voltava no tempo, o marcador de
 * debounce ressuscitava.
 *
 * A RPC merge_conversation_metadata faz `metadata || _set - _unset` numa
 * instrução só, no banco, sob o lock da linha. Se a RPC não existir (banco
 * ainda sem a Semana 1 da revisão de escala), cai no caminho antigo para não
 * derrubar o fluxo — o lost update volta a ser possível, mas nada para.
 */

export type MetadataPatch = Record<string, unknown>;

export async function mergeConversationMetadata(
  supabase: any,
  conversationId: string,
  set: MetadataPatch | null | undefined,
  unset: string[] = [],
): Promise<Record<string, unknown> | null> {
  const setPayload = set && Object.keys(set).length > 0 ? set : {};
  const { data, error } = await supabase.rpc('merge_conversation_metadata', {
    _conversation: conversationId,
    _set: setPayload,
    _unset: unset,
  });

  if (!error) {
    return (data ?? null) as Record<string, unknown> | null;
  }

  console.warn(`[METADATA] merge_conversation_metadata indisponível (${error.message}); usando read-modify-write para ${conversationId}`);
  const { data: conv } = await supabase
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .maybeSingle();
  const merged: Record<string, unknown> = { ...((conv?.metadata as Record<string, unknown>) || {}), ...setPayload };
  for (const key of unset) delete merged[key];
  const { error: updateError } = await supabase
    .from('conversations')
    .update({ metadata: merged })
    .eq('id', conversationId);
  if (updateError) {
    console.error(`[METADATA] Falha ao gravar metadata da conversa ${conversationId}:`, updateError);
    return null;
  }
  return merged;
}
