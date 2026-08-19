import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface Pipeline {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  workspace_ids: string[];
  next_pipeline_id: string | null;
  next_pipeline_column_id: string | null;
  default_assigned_to: string | null;
  completion_column_id: string | null;
  board_background_color: string | null;
  board_background_image: string | null;
  show_unassigned: boolean;
  created_at: string;
  updated_at: string;
}

export interface PipelineColumn {
  id: string;
  pipeline_id: string;
  name: string;
  color: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationPipelinePosition {
  id: string;
  conversation_id: string;
  pipeline_id: string;
  column_id: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export type PipelinePlacementMode = 'move' | 'add';

interface PlacementArgs {
  conversationId: string;
  pipelineId: string;
  columnId: string;
  order?: number;
  /** 'move' (padrao) tira o card da origem; 'add' mantem os outros funis. */
  mode?: PipelinePlacementMode;
  /** Funil de onde o card esta saindo. So usado no modo 'move'. */
  fromPipelineId?: string | null;
}

interface PlacementResult {
  position: ConversationPipelinePosition;
  /** Coluna anterior, apenas quando o card ja estava NESTE funil. */
  fromColumnId: string | null;
  /** Funil de onde o card saiu. Null se nao saiu de lugar nenhum. */
  fromPipelineId: string | null;
  stageChanged: boolean;
  orderChanged: boolean;
}

// Coloca uma conversa num funil.
//
// Desde 20260819130000 a conversa pode ter card em varios funis (um por evento,
// por exemplo) e apenas um card dentro de cada funil. Antes, a tabela tinha
// UNIQUE(conversation_id) e todo movimento era obrigado a apagar as demais
// posicoes — o card sumia do funil de origem sem ninguem pedir.
//
// No modo 'move', informe `fromPipelineId` sempre que souber de onde o card
// esta saindo. Sem essa informacao, so e seguro mover quando a conversa tem um
// unico card; com varios, apagar um "na sorte" seria o sumico silencioso de
// novo, entao aqui apenas adiciona.
async function placeConversationInPipeline({
  conversationId,
  pipelineId,
  columnId,
  order = 0,
  mode = 'move',
  fromPipelineId = null,
}: PlacementArgs): Promise<PlacementResult> {
  const { data: rows, error } = await supabase
    .from('conversation_pipeline_positions')
    .select('id, pipeline_id, column_id, order')
    .eq('conversation_id', conversationId)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const existingRows = (rows || []) as Array<{ id: string; pipeline_id: string; column_id: string; order: number }>;
  const inTarget = existingRows.filter((row) => row.pipeline_id === pipelineId);
  const target = inTarget[0] || null;

  // Sobras dentro do MESMO funil (base legada): a constraint composta so aceita
  // uma. Apagar aqui nao tira o card de nenhum outro funil.
  const duplicateIds = inTarget.slice(1).map((row) => row.id);
  if (duplicateIds.length > 0) {
    const { error: duplicateError } = await supabase
      .from('conversation_pipeline_positions')
      .delete()
      .in('id', duplicateIds);

    if (duplicateError) throw duplicateError;
  }

  let source: { id: string; pipeline_id: string; column_id: string } | null = null;
  if (mode === 'move') {
    if (fromPipelineId && fromPipelineId !== pipelineId) {
      source = existingRows.find((row) => row.pipeline_id === fromPipelineId) || null;
    } else if (!fromPipelineId && !target && existingRows.length === 1) {
      source = existingRows[0];
    }
  }

  const fromColumnId = target ? target.column_id : null;
  const cameFromPipelineId = source?.pipeline_id ?? (target ? pipelineId : null);
  // Sair de um funil tambem e mudanca de estagio, mesmo que a coluna de destino
  // ja fosse a mesma — senao um movimento real ficaria sem historico.
  const stageChanged = !target || target.column_id !== columnId || !!source;
  const orderChanged = !!target && target.column_id === columnId && Number(target.order ?? 0) !== Number(order);

  if (target && !stageChanged && !orderChanged && !source) {
    return {
      position: target as ConversationPipelinePosition,
      fromColumnId,
      fromPipelineId: cameFromPipelineId,
      stageChanged: false,
      orderChanged: false,
    };
  }

  let saved: ConversationPipelinePosition | null = null;

  if (target) {
    const { data, error: updateError } = await supabase
      .from('conversation_pipeline_positions')
      .update({ column_id: columnId, order, updated_at: new Date().toISOString() })
      .eq('id', target.id)
      .select()
      .single();

    if (updateError) throw updateError;
    saved = data as ConversationPipelinePosition;
  } else if (source) {
    // Movimento de verdade: a mesma linha troca de funil.
    const { data, error: moveError } = await supabase
      .from('conversation_pipeline_positions')
      .update({
        pipeline_id: pipelineId,
        column_id: columnId,
        order,
        updated_at: new Date().toISOString(),
      })
      .eq('id', source.id)
      .select()
      .single();

    if (moveError) throw moveError;
    saved = data as ConversationPipelinePosition;
  } else {
    const { data, error: insertError } = await supabase
      .from('conversation_pipeline_positions')
      .insert({ conversation_id: conversationId, pipeline_id: pipelineId, column_id: columnId, order })
      .select()
      .single();

    if (insertError) throw insertError;
    saved = data as ConversationPipelinePosition;
  }

  // Destino ja existia E ha origem a esvaziar: sem isto o card ficaria nos dois.
  if (target && source) {
    const { error: deleteError } = await supabase
      .from('conversation_pipeline_positions')
      .delete()
      .eq('id', source.id);

    if (deleteError) throw deleteError;
  }

  if (!saved || saved.pipeline_id !== pipelineId || saved.column_id !== columnId) {
    throw new Error('A posicao no funil nao foi confirmada.');
  }

  return {
    position: saved,
    fromColumnId,
    fromPipelineId: cameFromPipelineId,
    stageChanged,
    orderChanged,
  };
}

export function usePipelines() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['pipelines'],
    queryFn: async (): Promise<Pipeline[]> => {
      const { data, error } = await (supabase as any)
        .from('pipelines')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as Pipeline[];
    },
    enabled: !!session,
    staleTime: 10 * 60 * 1000, // FASE 4 (4D): config muda raramente
  });
}

export function usePipelineColumns(pipelineId: string | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['pipeline-columns', pipelineId],
    queryFn: async (): Promise<PipelineColumn[]> => {
      if (!pipelineId) return [];

      const { data, error } = await (supabase as any)
        .from('pipeline_columns')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('order', { ascending: true });

      if (error) throw error;
      return (data || []) as PipelineColumn[];
    },
    enabled: !!session && !!pipelineId,
  });
}

export interface PipelineWithColumns {
  pipeline: Pipeline;
  columns: PipelineColumn[];
}

// Usado pelo filtro de contatos: precisa das colunas de TODOS os pipelines de uma vez,
// diferente de usePipelineColumns() que busca só um pipeline por vez.
export function useAllPipelineColumns() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['pipeline-columns', 'all'],
    queryFn: async (): Promise<PipelineWithColumns[]> => {
      const { data: pipelines, error: pipelinesError } = await (supabase as any)
        .from('pipelines')
        .select('*')
        .order('created_at', { ascending: true });
      if (pipelinesError) throw pipelinesError;

      const pipelineIds = (pipelines || []).map((p: Pipeline) => p.id);
      if (pipelineIds.length === 0) return [];

      const { data: columns, error: columnsError } = await (supabase as any)
        .from('pipeline_columns')
        .select('*')
        .in('pipeline_id', pipelineIds)
        .order('order', { ascending: true });
      if (columnsError) throw columnsError;

      return (pipelines as Pipeline[]).map((pipeline) => ({
        pipeline,
        columns: (columns || []).filter((c: PipelineColumn) => c.pipeline_id === pipeline.id),
      }));
    },
    enabled: !!session,
    staleTime: 10 * 60 * 1000,
  });
}

export function useConversationPositions(pipelineId: string | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['conversation-positions', pipelineId],
    queryFn: async (): Promise<ConversationPipelinePosition[]> => {
      if (!pipelineId) return [];

      const { data, error } = await (supabase as any)
        .from('conversation_pipeline_positions')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('order', { ascending: true });

      if (error) throw error;
      return (data || []) as ConversationPipelinePosition[];
    },
    enabled: !!session && !!pipelineId,
  });
}

// Em quais funis esta conversa tem card. Desde 20260819130000 podem ser varios
// (um por evento, por exemplo), entao quem precisa remover/mover um card tem que
// dizer de qual funil esta falando.
export function useConversationPipelinePositions(conversationId: string | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['all-conversation-positions', conversationId],
    queryFn: async (): Promise<ConversationPipelinePosition[]> => {
      if (!conversationId) return [];

      const { data, error } = await (supabase as any)
        .from('conversation_pipeline_positions')
        .select('*')
        .eq('conversation_id', conversationId);

      if (error) throw error;
      return (data || []) as ConversationPipelinePosition[];
    },
    enabled: !!session && !!conversationId,
  });
}

// Tira o card de UM funil. Os cards da conversa nos outros funis ficam de pe.
export function useRemoveConversationFromPipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, pipelineId }: { conversationId: string; pipelineId: string }) => {
      const { error } = await supabase
        .from('conversation_pipeline_positions')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('pipeline_id', pipelineId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversation-positions'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-positions', variables.pipelineId] });
      queryClient.invalidateQueries({ queryKey: ['all-conversation-positions', variables.conversationId] });
      toast({ title: 'Removido do funil', description: 'A conversa saiu deste funil e segue nos demais.' });
    },
    onError: (error: any) => {
      console.error('Error removing conversation from pipeline:', error);
      toast({
        title: 'Erro ao remover do funil',
        description: error?.message || 'Nao foi possivel remover o card.',
        variant: 'destructive',
      });
    },
  });
}

export function useCreatePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, description, columns, workspace_ids }: { 
      name: string; 
      description?: string;
      columns: { name: string; color: string }[];
      workspace_ids?: string[];
    }) => {
      // Get user's org
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Profile not found');

      // Create pipeline
      const { data: pipeline, error: pipelineError } = await (supabase as any)
        .from('pipelines')
        .insert({
          organization_id: profile.organization_id,
          name,
          description: description || null,
          workspace_ids: workspace_ids || [],
        })
        .select()
        .single();

      if (pipelineError) throw pipelineError;

      // Create columns
      if (columns.length > 0) {
        const columnsToInsert = columns.map((col, index) => ({
          pipeline_id: pipeline.id,
          name: col.name,
          color: col.color,
          order: index,
        }));

        const { error: columnsError } = await (supabase as any)
          .from('pipeline_columns')
          .insert(columnsToInsert);

        if (columnsError) throw columnsError;
      }

      return pipeline;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      toast({ title: 'Pipeline criado com sucesso!' });
    },
    onError: (error: any) => {
      console.error('Error creating pipeline:', error, JSON.stringify(error));
      toast({ title: 'Erro ao criar pipeline', description: error?.message || 'Erro desconhecido', variant: 'destructive' });
    },
  });
}

export function useUpdatePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name, description, workspace_ids, next_pipeline_id, next_pipeline_column_id, default_assigned_to, completion_column_id, board_background_color, board_background_image, show_unassigned }: { 
      id: string;
      name?: string; 
      description?: string;
      workspace_ids?: string[];
      next_pipeline_id?: string | null;
      next_pipeline_column_id?: string | null;
      default_assigned_to?: string | null;
      completion_column_id?: string | null;
      board_background_color?: string | null;
      board_background_image?: string | null;
      show_unassigned?: boolean;
    }) => {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (workspace_ids !== undefined) updates.workspace_ids = workspace_ids;
      if (next_pipeline_id !== undefined) updates.next_pipeline_id = next_pipeline_id;
      if (next_pipeline_column_id !== undefined) updates.next_pipeline_column_id = next_pipeline_column_id;
      if (default_assigned_to !== undefined) updates.default_assigned_to = default_assigned_to;
      if (completion_column_id !== undefined) updates.completion_column_id = completion_column_id;
      if (board_background_color !== undefined) updates.board_background_color = board_background_color;
      if (board_background_image !== undefined) updates.board_background_image = board_background_image;
      if (show_unassigned !== undefined) updates.show_unassigned = show_unassigned;

      const { error } = await (supabase as any)
        .from('pipelines')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      toast({ title: 'Pipeline atualizado!' });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar pipeline', variant: 'destructive' });
    },
  });
}

export function useDeletePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('pipelines')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      toast({ title: 'Pipeline excluído!' });
    },
    onError: () => {
      toast({ title: 'Erro ao excluir pipeline', variant: 'destructive' });
    },
  });
}

export function useCreateColumn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pipelineId, name, color, order }: { 
      pipelineId: string;
      name: string; 
      color: string;
      order: number;
    }) => {
      const { data, error } = await (supabase as any)
        .from('pipeline_columns')
        .insert({
          pipeline_id: pipelineId,
          name,
          color,
          order,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-columns', variables.pipelineId] });
      toast({ title: 'Coluna criada!' });
    },
    onError: () => {
      toast({ title: 'Erro ao criar coluna', variant: 'destructive' });
    },
  });
}

export function useUpdateColumn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, pipelineId, name, color, order }: { 
      id: string;
      pipelineId: string;
      name?: string; 
      color?: string;
      order?: number;
    }) => {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (color !== undefined) updates.color = color;
      if (order !== undefined) updates.order = order;

      const { error } = await (supabase as any)
        .from('pipeline_columns')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-columns', variables.pipelineId] });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar coluna', variant: 'destructive' });
    },
  });
}

/**
 * Reorder pipeline columns by inserting the dragged column at a target position
 * and shifting other columns up/down to make room (does NOT swap with target).
 */
export function useReorderColumns() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pipelineId,
      sourceColumnId,
      targetColumnId,
    }: {
      pipelineId: string;
      sourceColumnId: string;
      targetColumnId: string;
    }) => {
      // Fetch current ordered list
      const { data: cols, error: fetchErr } = await (supabase as any)
        .from('pipeline_columns')
        .select('id, order')
        .eq('pipeline_id', pipelineId)
        .order('order', { ascending: true });
      if (fetchErr) throw fetchErr;
      if (!cols || cols.length === 0) return;

      const ordered: { id: string }[] = cols.map((c: any) => ({ id: c.id }));
      const fromIdx = ordered.findIndex((c) => c.id === sourceColumnId);
      const toIdx = ordered.findIndex((c) => c.id === targetColumnId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

      // Move (insertion semantics — others shift)
      const [moved] = ordered.splice(fromIdx, 1);
      ordered.splice(toIdx, 0, moved);

      // Two-phase update to avoid potential UNIQUE(pipeline_id, order) collisions:
      // 1) push everyone to a high temp range
      // 2) write final 1..N
      const TEMP_OFFSET = 100000;
      for (let i = 0; i < ordered.length; i++) {
        const { error } = await (supabase as any)
          .from('pipeline_columns')
          .update({ order: TEMP_OFFSET + i })
          .eq('id', ordered[i].id);
        if (error) throw error;
      }
      for (let i = 0; i < ordered.length; i++) {
        const { error } = await (supabase as any)
          .from('pipeline_columns')
          .update({ order: i + 1 })
          .eq('id', ordered[i].id);
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-columns', variables.pipelineId] });
    },
    onError: () => {
      toast({ title: 'Erro ao reordenar colunas', variant: 'destructive' });
    },
  });
}

export function useDeleteColumn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, pipelineId }: { id: string; pipelineId: string }) => {
      const { error } = await (supabase as any)
        .from('pipeline_columns')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-columns', variables.pipelineId] });
      toast({ title: 'Coluna excluída!' });
    },
    onError: () => {
      toast({ title: 'Erro ao excluir coluna', variant: 'destructive' });
    },
  });
}

export function useMoveConversation() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      conversationId,
      pipelineId,
      columnId,
      order = 0,
      changedByType = 'manual',
      skipAutoTransition = false,
      skipInvalidate = false,
      mode = 'move',
      fromPipelineId = null,
    }: {
      conversationId: string;
      pipelineId: string;
      columnId: string;
      order?: number;
      changedByType?: string;
      skipAutoTransition?: boolean;
      skipInvalidate?: boolean;
      /** 'add' coloca um card a mais, sem tirar a conversa dos outros funis. */
      mode?: PipelinePlacementMode;
      /** Funil de onde o card esta saindo — o board sabe, os menus nem sempre. */
      fromPipelineId?: string | null;
    }) => {
      const { data: targetColumn, error: targetColumnError } = await (supabase as any)
        .from('pipeline_columns')
        .select('id, pipeline_id')
        .eq('id', columnId)
        .single();

      if (targetColumnError) throw targetColumnError;
      if (!targetColumn || targetColumn.pipeline_id !== pipelineId) {
        throw new Error('A coluna escolhida nao pertence ao pipeline de destino.');
      }

      const placement = await placeConversationInPipeline({
        conversationId,
        pipelineId,
        columnId,
        order,
        mode,
        fromPipelineId,
      });

      const { stageChanged, orderChanged, fromColumnId } = placement;

      if (!stageChanged && !orderChanged) {
        return { changed: false, orderChanged: false, fromColumnId, toColumnId: columnId, pipelineId, mode };
      }

      // Log stage change only when the card actually changes column/pipeline.
      if (stageChanged && profile?.organization_id) {
        await (supabase as any)
          .from('conversation_stage_history')
          .insert({
            conversation_id: conversationId,
            pipeline_id: pipelineId,
            from_column_id: fromColumnId,
            to_column_id: columnId,
            changed_by_type: changedByType || 'manual',
            changed_by: profile.user_id || null,
            organization_id: profile.organization_id,
          });
      }

      // Trigger notification (fire and forget)
      if (stageChanged && profile?.organization_id) {
        supabase.functions.invoke('stage-notification', {
          body: {
            conversationId,
            pipelineId,
            columnId,
            organizationId: profile.organization_id,
          },
        }).catch(() => {});
      }

      // Auto-transition: check if this is the last column and pipeline has next_pipeline_id
      if (stageChanged && !skipAutoTransition && profile?.organization_id) {
        // Fetch all columns of current pipeline to check if we're at the last one
        const { data: allColumns } = await (supabase as any)
          .from('pipeline_columns')
          .select('id, order')
          .eq('pipeline_id', pipelineId)
          .order('order', { ascending: false })
          .limit(1);

        const lastColumn = allColumns?.[0];
        if (lastColumn && lastColumn.id === columnId) {
          // Fetch pipeline to get next_pipeline_id
          const { data: currentPipeline } = await (supabase as any)
            .from('pipelines')
            .select('next_pipeline_id, next_pipeline_column_id, default_assigned_to')
            .eq('id', pipelineId)
            .single();

          if (currentPipeline?.next_pipeline_id) {
            // Use configured column or fall back to first column of next pipeline
            let targetColumnId = currentPipeline.next_pipeline_column_id;

            if (!targetColumnId) {
              const { data: nextColumns } = await (supabase as any)
                .from('pipeline_columns')
                .select('id')
                .eq('pipeline_id', currentPipeline.next_pipeline_id)
                .order('order', { ascending: true })
                .limit(1);
              targetColumnId = nextColumns?.[0]?.id;
            }

            if (targetColumnId) {
              // A transicao automatica continua sendo MOVIMENTO: o card sai do
              // funil que acabou de terminar e entra no proximo. `fromPipelineId`
              // deixa isso explicito, para nao esvaziar um funil de evento que a
              // conversa tenha por fora.
              const transition = await placeConversationInPipeline({
                conversationId,
                pipelineId: currentPipeline.next_pipeline_id,
                columnId: targetColumnId,
                order: 0,
                mode: 'move',
                fromPipelineId: pipelineId,
              });

              // Log auto-transition
              await (supabase as any)
                .from('conversation_stage_history')
                .insert({
                  conversation_id: conversationId,
                  pipeline_id: currentPipeline.next_pipeline_id,
                  from_column_id: transition.fromColumnId ?? columnId,
                  to_column_id: targetColumnId,
                  changed_by_type: 'auto',
                  organization_id: profile.organization_id,
                });

              supabase.functions.invoke('stage-notification', {
                body: {
                  conversationId,
                  pipelineId: currentPipeline.next_pipeline_id,
                  columnId: targetColumnId,
                  organizationId: profile.organization_id,
                },
              }).catch(() => {});

              // Auto-assign responsible from next pipeline
              const { data: nextPipelineData } = await (supabase as any)
                .from('pipelines')
                .select('default_assigned_to')
                .eq('id', currentPipeline.next_pipeline_id)
                .single();

              if (nextPipelineData?.default_assigned_to) {
                await (supabase as any)
                  .from('conversations')
                  .update({ assigned_to: nextPipelineData.default_assigned_to })
                  .eq('id', conversationId);
              }
            }
          }
        }
      }

      return { changed: stageChanged, orderChanged, fromColumnId, toColumnId: columnId, pipelineId, mode };
    },
    onSuccess: (result, variables) => {
      if (!variables.skipInvalidate) {
        queryClient.invalidateQueries({ queryKey: ['conversation-positions'] });
        queryClient.invalidateQueries({ queryKey: ['conversation-positions', result?.pipelineId] });
      }
      queryClient.invalidateQueries({ queryKey: ['all-conversation-positions', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['stage-history', variables.conversationId] });
      if (result?.changed) {
        toast({ title: result.mode === 'add' ? 'Adicionada ao funil!' : 'Conversa movida!' });
      }
    },
    onError: (error: any) => {
      console.error('Error moving conversation:', error);
      toast({
        title: 'Erro ao mover conversa',
        description: error?.message || 'Nao foi possivel salvar a posicao do card.',
        variant: 'destructive',
      });
    },
  });
}

export function useTransferConversation() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      conversationId,
      targetPipelineId,
      fromPipelineId,
    }: {
      conversationId: string;
      targetPipelineId: string;
      /** Funil de origem. Sem ele, so move quando a conversa tem um card unico. */
      fromPipelineId?: string | null;
    }) => {
      if (!profile?.organization_id) throw new Error('No org');

      // Get first column of target pipeline
      const { data: targetColumns } = await (supabase as any)
        .from('pipeline_columns')
        .select('id')
        .eq('pipeline_id', targetPipelineId)
        .order('order', { ascending: true })
        .limit(1);

      const targetColumnId = targetColumns?.[0]?.id;
      if (!targetColumnId) throw new Error('Pipeline sem colunas');

      const placement = await placeConversationInPipeline({
        conversationId,
        pipelineId: targetPipelineId,
        columnId: targetColumnId,
        order: 0,
        mode: 'move',
        fromPipelineId: fromPipelineId ?? null,
      });

      // Log transfer in history
      await (supabase as any)
        .from('conversation_stage_history')
        .insert({
          conversation_id: conversationId,
          pipeline_id: targetPipelineId,
          from_column_id: placement.fromColumnId,
          to_column_id: targetColumnId,
          changed_by_type: 'transfer',
          changed_by: profile.user_id || null,
          organization_id: profile.organization_id,
        });

      // Auto-assign from target pipeline
      const { data: targetPipeline } = await (supabase as any)
        .from('pipelines')
        .select('default_assigned_to')
        .eq('id', targetPipelineId)
        .single();

      if (targetPipeline?.default_assigned_to) {
        await (supabase as any)
          .from('conversations')
          .update({ assigned_to: targetPipeline.default_assigned_to })
          .eq('id', conversationId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-positions'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error) => {
      console.error('Error transferring conversation:', error);
      toast({ title: 'Erro ao transferir conversa', variant: 'destructive' });
    },
  });
}

/**
 * Transfer a conversation to a pipeline/column that lives in ANOTHER workspace.
 * Besides repositioning the card, this changes the conversation's (and contact's)
 * workspace_id so the card leaves the current board and shows up in the target
 * workspace's board. Restricted by the caller to workspaces the user has access to
 * inside the same organization.
 */
export function useTransferConversationToWorkspace() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      conversationId,
      contactId,
      targetWorkspaceId,
      targetPipelineId,
      targetColumnId,
    }: {
      conversationId: string;
      contactId?: string | null;
      targetWorkspaceId: string;
      targetPipelineId: string;
      targetColumnId: string;
    }) => {
      if (!profile?.organization_id) throw new Error('No org');

      // Validate the chosen column really belongs to the target pipeline
      const { data: targetColumn, error: targetColumnError } = await (supabase as any)
        .from('pipeline_columns')
        .select('id, pipeline_id')
        .eq('id', targetColumnId)
        .single();

      if (targetColumnError) throw targetColumnError;
      if (!targetColumn || targetColumn.pipeline_id !== targetPipelineId) {
        throw new Error('A coluna escolhida nao pertence ao pipeline de destino.');
      }

      // A conversa MUDA de workspace, entao ela nao pode continuar aparecendo em
      // funil nenhum do workspace antigo — um card la seria um card de conversa
      // que nao pertence mais aquele board. Por isso esta transferencia (e so
      // ela) limpa todas as outras posicoes, e nao apenas a de origem.
      const { data: previousRows, error: previousRowsError } = await supabase
        .from('conversation_pipeline_positions')
        .select('id, pipeline_id, column_id')
        .eq('conversation_id', conversationId)
        .order('updated_at', { ascending: false });

      if (previousRowsError) throw previousRowsError;
      const previousPosition = (previousRows || [])[0] || null;

      const placement = await placeConversationInPipeline({
        conversationId,
        pipelineId: targetPipelineId,
        columnId: targetColumnId,
        order: 0,
        mode: 'add',
      });

      const leftoverIds = (previousRows || [])
        .filter((row) => row.id !== placement.position.id)
        .map((row) => row.id);

      if (leftoverIds.length > 0) {
        const { error: leftoverError } = await supabase
          .from('conversation_pipeline_positions')
          .delete()
          .in('id', leftoverIds);

        if (leftoverError) throw leftoverError;
      }

      // Move the conversation itself to the target workspace
      const { error: conversationError } = await (supabase as any)
        .from('conversations')
        .update({ workspace_id: targetWorkspaceId })
        .eq('id', conversationId);

      if (conversationError) throw conversationError;

      // Keep the contact in the same workspace as the conversation
      if (contactId) {
        const { error: contactError } = await (supabase as any)
          .from('contacts')
          .update({ workspace_id: targetWorkspaceId })
          .eq('id', contactId);

        if (contactError) throw contactError;
      }

      // Log transfer in history
      await (supabase as any)
        .from('conversation_stage_history')
        .insert({
          conversation_id: conversationId,
          pipeline_id: targetPipelineId,
          from_column_id: placement.fromColumnId ?? previousPosition?.column_id ?? null,
          to_column_id: targetColumnId,
          changed_by_type: 'transfer',
          changed_by: profile.user_id || null,
          organization_id: profile.organization_id,
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-positions'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: any) => {
      console.error('Error transferring conversation to workspace:', error);
      toast({
        title: 'Erro ao transferir conversa',
        description: error?.message || 'Nao foi possivel transferir a conversa.',
        variant: 'destructive',
      });
    },
  });
}
