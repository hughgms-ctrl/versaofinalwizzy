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
    mutationFn: async ({ id, name, description, workspace_ids, next_pipeline_id }: { 
      id: string;
      name?: string; 
      description?: string;
      workspace_ids?: string[];
      next_pipeline_id?: string | null;
    }) => {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (workspace_ids !== undefined) updates.workspace_ids = workspace_ids;
      if (next_pipeline_id !== undefined) updates.next_pipeline_id = next_pipeline_id;

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
      order = 0 
    }: { 
      conversationId: string;
      pipelineId: string;
      columnId: string;
      order?: number;
    }) => {
      // Check if position already exists
      const { data: existing } = await supabase
        .from('conversation_pipeline_positions')
        .select('id, column_id')
        .eq('conversation_id', conversationId)
        .eq('pipeline_id', pipelineId)
        .maybeSingle();

      const fromColumnId = existing?.column_id || null;

      if (existing) {
        const { error } = await supabase
          .from('conversation_pipeline_positions')
          .update({
            column_id: columnId,
            order,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('conversation_pipeline_positions')
          .insert({
            conversation_id: conversationId,
            pipeline_id: pipelineId,
            column_id: columnId,
            order,
          });

        if (error) throw error;
      }

      // Log stage change
      if (profile?.organization_id) {
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
      if (profile?.organization_id) {
        supabase.functions.invoke('stage-notification', {
          body: {
            conversationId,
            columnId,
            organizationId: profile.organization_id,
          },
        }).catch(() => {});
      }

      // Auto-transition: check if this is the last column and pipeline has next_pipeline_id
      if (!skipAutoTransition && profile?.organization_id) {
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
            .select('next_pipeline_id')
            .eq('id', pipelineId)
            .single();

          if (currentPipeline?.next_pipeline_id) {
            // Get first column of next pipeline
            const { data: nextColumns } = await (supabase as any)
              .from('pipeline_columns')
              .select('id')
              .eq('pipeline_id', currentPipeline.next_pipeline_id)
              .order('order', { ascending: true })
              .limit(1);

            const firstNextColumn = nextColumns?.[0];
            if (firstNextColumn) {
              // Move to next pipeline's first column
              const { data: existingNext } = await supabase
                .from('conversation_pipeline_positions')
                .select('id, column_id')
                .eq('conversation_id', conversationId)
                .eq('pipeline_id', currentPipeline.next_pipeline_id)
                .maybeSingle();

              const fromNextColumnId = existingNext?.column_id || null;

              if (existingNext) {
                await supabase
                  .from('conversation_pipeline_positions')
                  .update({ column_id: firstNextColumn.id, order: 0, updated_at: new Date().toISOString() })
                  .eq('id', existingNext.id);
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
            }
          }
        }
      }

      return { fromColumnId, toColumnId: columnId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversation-positions'] });
      queryClient.invalidateQueries({ queryKey: ['stage-history', variables.conversationId] });
      toast({ title: 'Conversa movida!' });
    },
    onError: (error) => {
      console.error('Error moving conversation:', error);
      toast({ title: 'Erro ao mover conversa', variant: 'destructive' });
    },
  });
}
