// Colocar uma conversa num funil.
//
// Regra do produto (desde 20260819130000): a conversa pode ter card em VARIOS
// funis — um por evento, por exemplo — mas apenas UM card dentro de cada funil
// (UNIQUE(conversation_id, pipeline_id)). Antes disso a tabela tinha
// UNIQUE(conversation_id) e este helper era obrigado a apagar as demais
// posicoes; hoje ele so apaga a origem quando o chamador pede movimento.
//
//   mode: 'move' (padrao) — leva o card de um funil para outro.
//   mode: 'add'           — coloca um card a mais, sem tirar dos outros funis.
//
// No modo 'move', informe `fromPipelineId` sempre que souber de onde o card
// esta saindo. Sem essa informacao, so e seguro mover quando a conversa tem um
// unico card: com varios, escolher um "na sorte" para apagar e exatamente o
// sumico silencioso que a regra nova veio corrigir — nesse caso o helper apenas
// adiciona.

export type PipelinePlacementMode = 'move' | 'add';

export interface PipelinePlacementOptions {
  /** 'move' (padrao) tira o card da origem; 'add' mantem os outros funis. */
  mode?: PipelinePlacementMode;
  /** Funil de onde o card esta saindo. So usado no modo 'move'. */
  fromPipelineId?: string | null;
}

export interface PipelineMoveResult {
  /** Coluna anterior, apenas quando a conversa ja estava no MESMO pipeline. */
  fromColumnId: string | null;
  /** Pipeline de onde o card saiu. Null se nao saiu de lugar nenhum. */
  fromPipelineId: string | null;
  error: string | null;
}

interface PositionRow {
  id: string;
  pipeline_id: string;
  column_id: string;
}

export async function moveConversationToPipeline(
  supabase: any,
  conversationId: string,
  pipelineId: string,
  columnId: string,
  options: PipelinePlacementOptions = {},
): Promise<PipelineMoveResult> {
  const mode: PipelinePlacementMode = options.mode === 'add' ? 'add' : 'move';

  // Todas as posicoes da conversa, mais recente primeiro. Sem .maybeSingle():
  // agora existir mais de uma linha e o comportamento normal.
  const { data: rows, error: selectError } = await supabase
    .from('conversation_pipeline_positions')
    .select('id, pipeline_id, column_id')
    .eq('conversation_id', conversationId)
    .order('updated_at', { ascending: false });

  if (selectError) {
    return { fromColumnId: null, fromPipelineId: null, error: selectError.message };
  }

  const existingRows = (rows || []) as PositionRow[];
  const inTarget = existingRows.filter((r) => r.pipeline_id === pipelineId);
  const target = inTarget[0] ?? null;

  // Sobras dentro do MESMO funil (base legada): a constraint composta so aceita
  // uma. Apagar aqui e seguro — nao tira o card de nenhum outro funil.
  const duplicateIds = inTarget.slice(1).map((r) => r.id);
  if (duplicateIds.length > 0) {
    const { error: dupError } = await supabase
      .from('conversation_pipeline_positions')
      .delete()
      .in('id', duplicateIds);
    if (dupError) {
      return { fromColumnId: null, fromPipelineId: null, error: dupError.message };
    }
  }

  let source: PositionRow | null = null;
  if (mode === 'move') {
    if (options.fromPipelineId && options.fromPipelineId !== pipelineId) {
      source = existingRows.find((r) => r.pipeline_id === options.fromPipelineId) ?? null;
    } else if (!options.fromPipelineId && existingRows.length === 1 && !target) {
      // Origem nao declarada e um unico card: e o caso classico de "mover".
      source = existingRows[0];
    }
  }

  const fromColumnId = target ? target.column_id : null;
  const fromPipelineId = source?.pipeline_id ?? (target ? pipelineId : null);

  if (target) {
    const { error } = await supabase
      .from('conversation_pipeline_positions')
      .update({
        column_id: columnId,
        order: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.id);
    if (error) return { fromColumnId, fromPipelineId, error: error.message };
  } else if (source) {
    // Movimento de verdade: a mesma linha troca de funil.
    const { error } = await supabase
      .from('conversation_pipeline_positions')
      .update({
        pipeline_id: pipelineId,
        column_id: columnId,
        order: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', source.id);
    return { fromColumnId, fromPipelineId, error: error?.message ?? null };
  } else {
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

  // Destino ja existia E ha origem a esvaziar: sem isto o card ficaria nos dois.
  if (source) {
    const { error } = await supabase
      .from('conversation_pipeline_positions')
      .delete()
      .eq('id', source.id);
    if (error) return { fromColumnId, fromPipelineId, error: error.message };
  }

  return { fromColumnId, fromPipelineId, error: null };
}
