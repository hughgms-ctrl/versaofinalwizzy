// Mover uma conversa de pipeline.
//
// Regra do produto: uma conversa ocupa UMA posicao de pipeline por vez (a tabela
// tem UNIQUE(conversation_id) desde 20260309020135, e o board do frontend assume
// isso). Um upsert com onConflict 'conversation_id,pipeline_id' NAO move: ele
// cria uma linha no pipeline de destino e deixa a linha antiga viva, entao o card
// aparece nos dois pipelines. Este helper faz o movimento de verdade: reaproveita
// a linha existente e apaga qualquer sobra.

export interface PipelineMoveResult {
  /** Coluna anterior, apenas quando a conversa ja estava no MESMO pipeline. */
  fromColumnId: string | null;
  /** Pipeline anterior, mesmo quando era outro. Null se a conversa nao tinha posicao. */
  fromPipelineId: string | null;
  error: string | null;
}

export async function moveConversationToPipeline(
  supabase: any,
  conversationId: string,
  pipelineId: string,
  columnId: string,
): Promise<PipelineMoveResult> {
  // Todas as posicoes da conversa, mais recente primeiro. Sem .maybeSingle():
  // bases legadas podem ter mais de uma linha, e maybeSingle() erraria e faria o
  // codigo achar que nao existe posicao (criando mais uma duplicata).
  const { data: rows, error: selectError } = await supabase
    .from('conversation_pipeline_positions')
    .select('id, pipeline_id, column_id')
    .eq('conversation_id', conversationId)
    .order('updated_at', { ascending: false });

  if (selectError) {
    return { fromColumnId: null, fromPipelineId: null, error: selectError.message };
  }

  const existingRows = (rows || []) as Array<{ id: string; pipeline_id: string; column_id: string }>;
  // Prefere reaproveitar a linha do pipeline de destino (se ja existir) para nao
  // esbarrar no UNIQUE(conversation_id, pipeline_id) ao atualizar outra linha.
  const keep = existingRows.find((r) => r.pipeline_id === pipelineId) || existingRows[0] || null;
  const fromPipelineId = existingRows[0]?.pipeline_id ?? null;
  const fromColumnId = existingRows[0]?.pipeline_id === pipelineId ? existingRows[0].column_id : null;

  // Apaga as sobras ANTES do update: a linha antiga em outro pipeline e
  // exatamente o que fazia o card continuar aparecendo no pipeline de origem.
  const staleIds = existingRows.filter((r) => r.id !== keep?.id).map((r) => r.id);
  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('conversation_pipeline_positions')
      .delete()
      .in('id', staleIds);
    if (deleteError) {
      return { fromColumnId, fromPipelineId, error: deleteError.message };
    }
  }

  if (keep) {
    const { error } = await supabase
      .from('conversation_pipeline_positions')
      .update({
        pipeline_id: pipelineId,
        column_id: columnId,
        order: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', keep.id);
    return { fromColumnId, fromPipelineId, error: error?.message ?? null };
  }

  const { error } = await supabase
    .from('conversation_pipeline_positions')
    .insert({
      conversation_id: conversationId,
      pipeline_id: pipelineId,
      column_id: columnId,
      order: 0,
    });
  return { fromColumnId, fromPipelineId, error: error?.message ?? null };
}
