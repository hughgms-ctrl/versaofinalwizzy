import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { Node, Edge } from '@xyflow/react';

export interface Flow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  nodes: Node[];
  edges: Edge[];
  variables: Record<string, unknown>;
  triggers_count: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  folder_id: string | null;
  workspace_id: string | null;
  master_prompt?: string;
  is_master_active?: boolean;
  provider?: string | null;
  model?: string | null;
  position: number;
  visible_in_chat: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRowToFlow(row: any): Flow {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    description: row.description,
    is_active: row.is_active,
    trigger_type: row.trigger_type,
    trigger_config: row.trigger_config || {},
    nodes: row.nodes || [],
    edges: row.edges || [],
    variables: row.variables || {},
    triggers_count: row.triggers_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    folder_id: row.folder_id || null,
    workspace_id: row.workspace_id || null,
    master_prompt: row.master_prompt || '',
    is_master_active: row.is_master_active || false,
    provider: row.provider || null,
    model: row.model || null,
    position: row.position || 0,
    visible_in_chat: row.visible_in_chat !== false,
  };
}

export function useFlows() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['flows', profile?.organization_id] as const,
    queryFn: async (): Promise<Flow[]> => {
      if (!profile?.organization_id) return [];

      // Using type assertion since flows table is new and types aren't regenerated yet
      let { data, error } = await (supabase
        .from('flows' as 'contacts') // Temporary workaround
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('position', { ascending: true })
        .order('updated_at', { ascending: false }) as unknown as Promise<{ data: unknown[] | null; error: any }>);

      if (error && error.code === '42703') { // Column does not exist
        console.warn('Position column missing in flows, falling back to updated_at');
        const retry = await (supabase
          .from('flows' as 'contacts')
          .select('*')
          .eq('organization_id', profile.organization_id)
          .order('updated_at', { ascending: false }) as unknown as Promise<{ data: unknown[] | null; error: any }>);
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;

      return (data || []).map(row => mapRowToFlow(row));
    },
    enabled: !!profile?.organization_id,
  });
}

export function useFlow(flowId: string | null) {
  return useQuery({
    queryKey: ['flow', flowId] as const,
    queryFn: async (): Promise<Flow | null> => {
      if (!flowId) return null;

      const { data, error } = await (supabase
        .from('flows' as 'contacts')
        .select('*')
        .eq('id', flowId)
        .single() as unknown as Promise<{ data: unknown | null; error: Error | null }>);

      if (error) throw error;

      return data ? mapRowToFlow(data) : null;
    },
    enabled: !!flowId,
  });
}

export function useCreateFlow() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (data: { name: string; description?: string; workspace_id?: string | null }) => {
      if (!profile?.organization_id || !user?.id) {
        throw new Error('User not authenticated');
      }

      const initialNodes = [
        {
          id: 'start-1',
          type: 'start',
          position: { x: 250, y: 200 },
          data: { label: 'Início' },
        },
      ];

      const { data: flow, error } = await (supabase
        .from('flows' as 'contacts')
        .insert({
          organization_id: profile.organization_id,
          name: data.name,
          description: data.description || null,
          workspace_id: data.workspace_id || null,
          nodes: initialNodes,
          edges: [],
          created_by: user.id,
        } as never)
        .select()
        .single() as unknown as Promise<{ data: unknown | null; error: Error | null }>);

      if (error) throw error;
      return flow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast.success('Fluxo criado com sucesso!');
    },
    onError: (error) => {
      console.error('Error creating flow:', error);
      toast.error('Erro ao criar fluxo');
    },
  });
}

export function useSaveFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      id: string;
      name?: string;
      description?: string;
      nodes: Node[];
      edges: Edge[];
      is_active?: boolean;
      trigger_type?: string;
      trigger_config?: Record<string, unknown>;
      workspace_id?: string | null;
      master_prompt?: string;
      is_master_active?: boolean;
      provider?: string | null;
      model?: string | null;
    }) => {
      const updateData: Record<string, unknown> = {
        nodes: data.nodes,
        edges: data.edges,
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;
      if (data.trigger_type !== undefined) updateData.trigger_type = data.trigger_type;
      if (data.trigger_config !== undefined) updateData.trigger_config = data.trigger_config;
      if (data.workspace_id !== undefined) updateData.workspace_id = data.workspace_id;
      if (data.master_prompt !== undefined) updateData.master_prompt = data.master_prompt;
      if (data.is_master_active !== undefined) updateData.is_master_active = data.is_master_active;
      if (data.provider !== undefined) updateData.provider = data.provider;
      if (data.model !== undefined) updateData.model = data.model;

      const { data: flow, error } = await (supabase
        .from('flows' as 'contacts')
        .update(updateData as never)
        .eq('id', data.id)
        .select()
        .single() as unknown as Promise<{ data: unknown | null; error: Error | null }>);

      if (error) throw error;
      return flow;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      queryClient.invalidateQueries({ queryKey: ['flow', variables.id] });
      toast.success('Fluxo salvo com sucesso!');
    },
    onError: (error) => {
      console.error('Error saving flow:', error);
      toast.error('Erro ao salvar fluxo');
    },
  });
}

export function useDeleteFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (flowId: string) => {
      const { error } = await (supabase
        .from('flows' as 'contacts')
        .delete()
        .eq('id', flowId) as unknown as Promise<{ error: Error | null }>);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast.success('Fluxo excluído com sucesso!');
    },
    onError: (error) => {
      console.error('Error deleting flow:', error);
      toast.error('Erro ao excluir fluxo');
    },
  });
}

export function useToggleFlowActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ flowId, isActive }: { flowId: string; isActive: boolean }) => {
      const { error } = await (supabase
        .from('flows' as 'contacts')
        .update({ is_active: isActive } as never)
        .eq('id', flowId) as unknown as Promise<{ error: Error | null }>);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
    },
    onError: (error) => {
      console.error('Error toggling flow:', error);
      toast.error('Erro ao alterar status do fluxo');
    },
  });
}

export function useToggleFlowVisibleInChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ flowId, visibleInChat }: { flowId: string; visibleInChat: boolean }) => {
      const { error } = await (supabase
        .from('flows' as 'contacts')
        .update({ visible_in_chat: visibleInChat } as never)
        .eq('id', flowId) as unknown as Promise<{ error: Error | null }>);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast.success('Visibilidade atualizada');
    },
    onError: (error) => {
      console.error('Error toggling flow visibility:', error);
      toast.error('Erro ao alterar visibilidade');
    },
  });
}

export function useUpdateFlowPositions() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (updates: { id: string; position: number }[]) => {
      const promises = updates.map(update =>
        supabase
          .from('flows' as 'contacts')
          .update({ position: update.position } as never)
          .eq('id', update.id)
      );

      const results = await Promise.all(promises);
      const firstError = results.find(r => r.error)?.error;
      if (firstError) throw firstError;
    },
    onMutate: async (updates) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['flows', profile?.organization_id] });

      // Snapshot the previous value
      const previousFlows = queryClient.getQueryData<Flow[]>(['flows', profile?.organization_id]);

      // Optimistically update to the new value
      if (previousFlows) {
        const newFlows = [...previousFlows];
        updates.forEach(update => {
          const index = newFlows.findIndex(f => f.id === update.id);
          if (index !== -1) {
            newFlows[index] = { ...newFlows[index], position: update.position };
          }
        });

        // Sort by position
        newFlows.sort((a, b) => a.position - b.position);

        queryClient.setQueryData(['flows', profile?.organization_id], newFlows);
      }

      return { previousFlows };
    },
    onError: (error, _updates, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousFlows) {
        queryClient.setQueryData(['flows', profile?.organization_id], context.previousFlows);
      }

      console.error('Error updating flow positions:', error);
      if ((error as any).code === '42703') {
        toast.error('Coluna "position" não encontrada no banco de dados. A ordem não será persistida.');
      } else {
        toast.error('Erro ao atualizar ordem dos fluxos');
      }
    },
    onSettled: () => {
      // Always refetch after error or success to guarantee we are in sync with the server
      queryClient.invalidateQueries({ queryKey: ['flows', profile?.organization_id] });
    },
  });
}
