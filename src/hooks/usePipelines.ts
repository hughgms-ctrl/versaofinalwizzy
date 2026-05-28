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

async function removeStaleConversationPositions(conversationId: string, keepPositionId: string) {
  const { data: rows, error } = await supabase
    .from('conversation_pipeline_positions')
    .select('id, pipeline_id, column_id, updated_at')
    .eq('conversation_id', conversationId)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const staleRows = (rows || []).filter((row) => row.id !== keepPositionId);
  if (staleRows.length > 0) {
    const { error: deleteError } = await supabase
      .from('conversation_pipeline_positions')
      .delete()
      .in('id', staleRows.map((row) => row.id));

    if (deleteError) throw deleteError;
  }

  const { data: remainingRows, error: verifyError } = await supabase
    .from('conversation_pipeline_positions')
    .select('id, pipeline_id, column_id')
    .eq('conversation_id', conversationId);

  if (verifyError) throw verifyError;
  if ((remainingRows || []).some((row) => row.id !== keepPositionId)) {
    throw new Error('Ainda existem posicoes antigas deste card em outros pipelines.');
  }
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
    mutationFn: async ({ id, name, description, workspace_ids, next_pipeline_id, next_pipeline_column_id, default_assigned_to, completion_column_id }: { 
      id: string;
      name?: string; 
      description?: string;
      workspace_ids?: string[];
      next_pipeline_id?: string | null;
      next_pipeline_column_id?: string | null;
      default_assigned_to?: string | null;
      completion_column_id?: string | null;
    }) => {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (workspace_ids !== undefined) updates.workspace_ids = workspace_ids;
      if (next_pipeline_id !== undefined) updates.next_pipeline_id = next_pipeline_id;
      if (next_pipeline_column_id !== undefined) updates.next_pipeline_column_id = next_pipeline_column_id;
      if (default_assigned_to !== undefined) updates.default_assigned_to = default_assigned_to;
      if (completion_column_id !== undefined) updates.completion_column_id = completion_column_id;

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
    }: { 
      conversationId: string;
      pipelineId: string;
      columnId: string;
      order?: number;
      changedByType?: string;
      skipAutoTransition?: boolean;
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

      // Check if position already exists. Keep the newest row if legacy duplicates exist.
      const { data: existingRows, error: existingError } = await supabase
        .from('conversation_pipeline_positions')
        .select('id, column_id, pipeline_id, order')
        .eq('conversation_id', conversationId)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (existingError) throw existingError;
      const existing = existingRows?.[0] || null;

      if (existingRows && existingRows.length > 1) {
        const { error: deleteDuplicatesError } = await supabase
          .from('conversation_pipeline_positions')
          .delete()
          .in('id', existingRows.slice(1).map((row) => row.id));

        if (deleteDuplicatesError) throw deleteDuplicatesError;
      }

      const existingOrder = Number(existing?.order ?? 0);
      const requestedOrder = Number(order ?? 0);
      if (
        existing?.pipeline_id === pipelineId &&
        existing?.column_id === columnId &&
        existingOrder === requestedOrder
      ) {
        return {
          changed: false,
          orderChanged: false,
          fromColumnId: existing.column_id,
          toColumnId: columnId,
          pipelineId,
        };
      }

      const fromColumnId = existing?.column_id || null;
      const stageChanged = existing?.pipeline_id !== pipelineId || existing?.column_id !== columnId;
      let savedPosition: ConversationPipelinePosition | null = null;

      if (existing && existing.pipeline_id === pipelineId) {
        // Same pipeline, just update column
        const { data, error } = await supabase
          .from('conversation_pipeline_positions')
          .update({
            column_id: columnId,
            order,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        savedPosition = data as ConversationPipelinePosition;
      } else if (existing) {
        // Different pipeline — update pipeline + column
        const { data, error } = await supabase
          .from('conversation_pipeline_positions')
          .update({
            pipeline_id: pipelineId,
            column_id: columnId,
            order,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        savedPosition = data as ConversationPipelinePosition;
      } else {
        const { data, error } = await supabase
          .from('conversation_pipeline_positions')
          .insert({
            conversation_id: conversationId,
            pipeline_id: pipelineId,
            column_id: columnId,
            order,
          })
          .select()
          .single();

        if (error) throw error;
        savedPosition = data as ConversationPipelinePosition;
      }

      if (
        !savedPosition ||
        savedPosition.pipeline_id !== pipelineId ||
        savedPosition.column_id !== columnId
      ) {
        throw new Error('A posicao no pipeline nao foi confirmada.');
      }

      await removeStaleConversationPositions(conversationId, savedPosition.id);

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
              const firstNextColumn = { id: targetColumnId };
              // With unique constraint, just update the existing position to new pipeline
              const { data: existingPos } = await supabase
                .from('conversation_pipeline_positions')
                .select('id, column_id')
                .eq('conversation_id', conversationId)
                .maybeSingle();

              const fromNextColumnId = existingPos?.column_id || null;

              if (existingPos) {
                await supabase
                  .from('conversation_pipeline_positions')
                  .update({ 
                    pipeline_id: currentPipeline.next_pipeline_id,
                    column_id: firstNextColumn.id, 
                    order: 0, 
                    updated_at: new Date().toISOString() 
                  })
                  .eq('id', existingPos.id);
              } else {
                await supabase
                  .from('conversation_pipeline_positions')
                  .insert({
                    conversation_id: conversationId,
                    pipeline_id: currentPipeline.next_pipeline_id,
                    column_id: firstNextColumn.id,
                    order: 0,
                  });
              }

              // Log auto-transition
              await (supabase as any)
                .from('conversation_stage_history')
                .insert({
                  conversation_id: conversationId,
                  pipeline_id: currentPipeline.next_pipeline_id,
                  from_column_id: fromNextColumnId,
                  to_column_id: firstNextColumn.id,
                  changed_by_type: 'auto',
                  organization_id: profile.organization_id,
                });

              supabase.functions.invoke('stage-notification', {
                body: {
                  conversationId,
                  pipelineId: currentPipeline.next_pipeline_id,
                  columnId: firstNextColumn.id,
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

      return { changed: stageChanged, orderChanged: !stageChanged, fromColumnId, toColumnId: columnId, pipelineId };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversation-positions'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-positions', result?.pipelineId] });
      queryClient.invalidateQueries({ queryKey: ['stage-history', variables.conversationId] });
      if (result?.changed) {
        toast({ title: 'Conversa movida!' });
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
    }: {
      conversationId: string;
      targetPipelineId: string;
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

      // Get current position for history. Keep newest if old duplicate rows exist.
      const { data: currentRows, error: currentRowsError } = await supabase
        .from('conversation_pipeline_positions')
        .select('id, pipeline_id, column_id')
        .eq('conversation_id', conversationId)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (currentRowsError) throw currentRowsError;
      const currentPos = currentRows?.[0] || null;

      if (currentRows && currentRows.length > 1) {
        const { error: deleteDuplicatesError } = await supabase
          .from('conversation_pipeline_positions')
          .delete()
          .in('id', currentRows.slice(1).map((row) => row.id));

        if (deleteDuplicatesError) throw deleteDuplicatesError;
      }

      const mutation = currentPos
        ? supabase
          .from('conversation_pipeline_positions')
          .update({
            pipeline_id: targetPipelineId,
            column_id: targetColumnId,
            order: 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentPos.id)
        : supabase
          .from('conversation_pipeline_positions')
          .insert({
            conversation_id: conversationId,
            pipeline_id: targetPipelineId,
            column_id: targetColumnId,
            order: 0,
          });

      const { data: savedPosition, error } = await mutation.select().single();

      if (error) throw error;
      if (!savedPosition) throw new Error('A transferencia no pipeline nao foi confirmada.');

      await removeStaleConversationPositions(conversationId, savedPosition.id);

      // Log transfer in history
      await (supabase as any)
        .from('conversation_stage_history')
        .insert({
          conversation_id: conversationId,
          pipeline_id: targetPipelineId,
          from_column_id: currentPos?.column_id || null,
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
