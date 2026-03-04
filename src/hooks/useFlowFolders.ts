import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FlowFolder {
  id: string;
  organization_id: string;
  name: string;
  parent_id: string | null;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
  position: number;
  visible_in_chat: boolean;
}

export function useFlowFolders() {
  return useQuery({
    queryKey: ['flow-folders'],
    queryFn: async () => {
      let { data, error } = await (supabase
        .from('flow_folders')
        .select('*')
        .order('position', { ascending: true })
        .order('name') as unknown as Promise<{ data: any[] | null; error: any }>);

      if (error && error.code === '42703') { // Column does not exist
        console.warn('Position column missing in flow_folders, falling back to name');
        const retry = await (supabase
          .from('flow_folders')
          .select('*')
          .order('name') as unknown as Promise<{ data: any[] | null; error: any }>);
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      return (data || []).map(folder => ({
        ...folder,
        position: folder.position || 0,
        visible_in_chat: folder.visible_in_chat !== false,
      })) as FlowFolder[];
    },
  });
}

export function useCreateFlowFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, parentId, workspaceId }: { name: string; parentId?: string | null; workspaceId?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Profile not found');

      const { data, error } = await supabase
        .from('flow_folders')
        .insert({
          name,
          organization_id: profile.organization_id,
          parent_id: parentId || null,
          workspace_id: workspaceId || null,
        } as never)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as FlowFolder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-folders'] });
      toast.success('Pasta criada com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao criar pasta: ' + error.message);
    },
  });
}

export function useRenameFlowFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ folderId, name, workspaceId }: { folderId: string; name: string; workspaceId?: string | null }) => {
      const updateData: Record<string, unknown> = { name };
      if (workspaceId !== undefined) updateData.workspace_id = workspaceId;

      const { error } = await (supabase
        .from('flow_folders' as 'contacts')
        .update(updateData as never)
        .eq('id', folderId) as unknown as Promise<{ error: Error | null }>);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-folders'] });
      toast.success('Pasta atualizada');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar pasta: ' + error.message);
    },
  });
}

export function useDeleteFlowFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (folderId: string) => {
      const { error } = await supabase
        .from('flow_folders')
        .delete()
        .eq('id', folderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-folders'] });
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast.success('Pasta excluída');
    },
    onError: (error) => {
      toast.error('Erro ao excluir pasta: ' + error.message);
    },
  });
}

export function useMoveFlowToFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ flowId, folderId, folderWorkspaceId }: { flowId: string; folderId: string | null; folderWorkspaceId?: string | null }) => {
      const updateData: Record<string, unknown> = { folder_id: folderId };
      // If the folder has a workspace, auto-assign the flow to it
      if (folderWorkspaceId !== undefined && folderWorkspaceId !== null) {
        updateData.workspace_id = folderWorkspaceId;
      }

      const { error } = await (supabase
        .from('flows' as 'contacts')
        .update(updateData as never)
        .eq('id', flowId) as unknown as Promise<{ error: Error | null }>);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast.success('Fluxo movido');
    },
    onError: (error) => {
      toast.error('Erro ao mover fluxo: ' + error.message);
    },
  });
}

export function useUpdateFolderPositions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: { id: string; position: number }[]) => {
      const promises = updates.map(update =>
        supabase
          .from('flow_folders')
          .update({ position: update.position } as never)
          .eq('id', update.id)
      );

      const results = await Promise.all(promises);
      const firstError = results.find(r => r.error)?.error;
      if (firstError) throw firstError;
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ['flow-folders'] });

      const previousFolders = queryClient.getQueryData<FlowFolder[]>(['flow-folders']);

      if (previousFolders) {
        const newFolders = [...previousFolders];
        updates.forEach(update => {
          const index = newFolders.findIndex(f => f.id === update.id);
          if (index !== -1) {
            newFolders[index] = { ...newFolders[index], position: update.position };
          }
        });

        newFolders.sort((a, b) => a.position - b.position);

        queryClient.setQueryData(['flow-folders'], newFolders);
      }

      return { previousFolders };
    },
    onError: (error, _updates, context) => {
      if (context?.previousFolders) {
        queryClient.setQueryData(['flow-folders'], context.previousFolders);
      }

      console.error('Error updating folder positions:', error);
      if ((error as any).code === '42703') {
        toast.error('Coluna "position" não encontrada no banco de dados. A ordem não será persistida.');
      } else {
        toast.error('Erro ao atualizar ordem das pastas: ' + (error as any).message);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-folders'] });
    },
  });
}

export function useToggleFolderVisibleInChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ folderId, visibleInChat }: { folderId: string; visibleInChat: boolean }) => {
      const { error } = await (supabase
        .from('flow_folders' as 'contacts')
        .update({ visible_in_chat: visibleInChat } as never)
        .eq('id', folderId) as unknown as Promise<{ error: Error | null }>);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-folders'] });
      toast.success('Visibilidade da pasta atualizada');
    },
    onError: (error) => {
      console.error('Error toggling folder visibility:', error);
      toast.error('Erro ao alterar visibilidade da pasta');
    },
  });
}
