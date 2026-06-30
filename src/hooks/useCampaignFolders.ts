import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CampaignFolder {
  id: string;
  organization_id: string;
  name: string;
  parent_id: string | null;
  workspace_id: string | null;
  workspace_ids: string[];
  created_at: string;
  updated_at: string;
  position: number;
}

// campaign_folders is not in the generated Supabase types yet, so we cast the
// table name to a known one ('contacts') to bypass the type check, exactly like
// other recently-added tables in this codebase do.
const FOLDERS = 'campaign_folders' as 'contacts';

export function useCampaignFolders() {
  return useQuery({
    queryKey: ['campaign-folders'],
    queryFn: async () => {
      let { data, error } = await (supabase
        .from(FOLDERS)
        .select('*')
        .order('position', { ascending: true })
        .order('name') as unknown as Promise<{ data: any[] | null; error: any }>);

      if (error && error.code === '42703') { // Column does not exist
        console.warn('Position column missing in campaign_folders, falling back to name');
        const retry = await (supabase
          .from(FOLDERS)
          .select('*')
          .order('name') as unknown as Promise<{ data: any[] | null; error: any }>);
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      return (data || []).map((folder: any) => ({
        ...folder,
        position: folder.position || 0,
        workspace_ids: Array.isArray(folder.workspace_ids) ? folder.workspace_ids : [],
      })) as CampaignFolder[];
    },
  });
}

export function useCreateCampaignFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, parentId, workspaceId, workspaceIds }: { name: string; parentId?: string | null; workspaceId?: string | null; workspaceIds?: string[] | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Profile not found');

      const wsIds = workspaceIds && workspaceIds.length > 0
        ? workspaceIds
        : (workspaceId ? [workspaceId] : []);

      const { data, error } = await supabase
        .from(FOLDERS)
        .insert({
          name,
          organization_id: profile.organization_id,
          parent_id: parentId || null,
          workspace_id: wsIds[0] || null,
          workspace_ids: wsIds,
        } as never)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as CampaignFolder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-folders'] });
      toast.success('Pasta criada com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao criar pasta: ' + error.message);
    },
  });
}

export function useRenameCampaignFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ folderId, name, workspaceId, workspaceIds }: { folderId: string; name: string; workspaceId?: string | null; workspaceIds?: string[] | null }) => {
      const updateData: Record<string, unknown> = { name };
      let updatingWorkspace = false;
      let newWsIds: string[] | null = null;

      if (workspaceIds !== undefined) {
        newWsIds = workspaceIds || [];
        updateData.workspace_ids = newWsIds;
        updateData.workspace_id = newWsIds[0] || null;
        updatingWorkspace = true;
      } else if (workspaceId !== undefined) {
        newWsIds = workspaceId ? [workspaceId] : [];
        updateData.workspace_id = workspaceId;
        updateData.workspace_ids = newWsIds;
        updatingWorkspace = true;
      }

      // Update the main folder
      const { error } = await (supabase
        .from(FOLDERS)
        .update(updateData as never)
        .eq('id', folderId) as unknown as Promise<{ error: Error | null }>);

      if (error) throw error;

      // If workspace was changed, recursively update all contents
      if (updatingWorkspace && newWsIds !== null) {
        const updateWorkspaceRecursive = async (currentFolderId: string, ids: string[]) => {
          // Update all campaigns in this folder (campaigns only have a single workspace_id)
          const { error: campErr } = await (supabase as any)
            .from('campaigns')
            .update({ workspace_id: ids[0] || null })
            .eq('folder_id', currentFolderId);

          if (campErr) {
            console.error('Error updating workspace for campaigns:', campErr);
          }

          // Fetch all subfolders
          const { data: subfolders, error: subfErr } = await (supabase
            .from(FOLDERS)
            .select('id')
            .eq('parent_id', currentFolderId) as unknown as Promise<{ data: any[] | null; error: any }>);

          if (!subfErr && subfolders && subfolders.length > 0) {
            const { error: updErr } = await (supabase
              .from(FOLDERS)
              .update({ workspace_id: ids[0] || null, workspace_ids: ids } as never)
              .in('id', subfolders.map((s: any) => s.id)) as unknown as Promise<{ error: Error | null }>);

            if (updErr) {
              console.error('Error updating workspace for subfolders:', updErr);
            }

            for (const sub of subfolders) {
              await updateWorkspaceRecursive(sub.id, ids);
            }
          }
        };

        await updateWorkspaceRecursive(folderId, newWsIds);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-folders'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Pasta atualizada');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar pasta: ' + error.message);
    },
  });
}

export function useDeleteCampaignFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (folderId: string) => {
      const { error } = await (supabase
        .from(FOLDERS)
        .delete()
        .eq('id', folderId) as unknown as Promise<{ error: Error | null }>);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-folders'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Pasta excluída');
    },
    onError: (error) => {
      toast.error('Erro ao excluir pasta: ' + error.message);
    },
  });
}

export function useMoveCampaignToFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, folderId, folderWorkspaceId, folderWorkspaceIds }: { campaignId: string; folderId: string | null; folderWorkspaceId?: string | null; folderWorkspaceIds?: string[] | null }) => {
      const updateData: Record<string, unknown> = { folder_id: folderId };
      // If the folder has workspaces, auto-assign the campaign to the first one
      // (campaigns only carry a single workspace_id).
      if (folderWorkspaceIds && folderWorkspaceIds.length > 0) {
        updateData.workspace_id = folderWorkspaceIds[0];
      } else if (folderWorkspaceId !== undefined && folderWorkspaceId !== null) {
        updateData.workspace_id = folderWorkspaceId;
      }

      const { error } = await (supabase
        .from('campaigns')
        .update(updateData as never)
        .eq('id', campaignId) as unknown as Promise<{ error: Error | null }>);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campanha movida');
    },
    onError: (error) => {
      toast.error('Erro ao mover campanha: ' + error.message);
    },
  });
}

export function useUpdateCampaignFolderPositions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: { id: string; position: number }[]) => {
      const promises = updates.map(update =>
        supabase
          .from(FOLDERS)
          .update({ position: update.position } as never)
          .eq('id', update.id)
      );

      const results = await Promise.all(promises);
      const firstError = results.find(r => r.error)?.error;
      if (firstError) throw firstError;
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ['campaign-folders'] });

      const previousFolders = queryClient.getQueryData<CampaignFolder[]>(['campaign-folders']);

      if (previousFolders) {
        const newFolders = [...previousFolders];
        updates.forEach(update => {
          const index = newFolders.findIndex(f => f.id === update.id);
          if (index !== -1) {
            newFolders[index] = { ...newFolders[index], position: update.position };
          }
        });

        newFolders.sort((a, b) => a.position - b.position);

        queryClient.setQueryData(['campaign-folders'], newFolders);
      }

      return { previousFolders };
    },
    onError: (error, _updates, context) => {
      if (context?.previousFolders) {
        queryClient.setQueryData(['campaign-folders'], context.previousFolders);
      }

      console.error('Error updating campaign folder positions:', error);
      if ((error as any).code === '42703') {
        toast.error('Coluna "position" não encontrada no banco de dados. A ordem não será persistida.');
      } else {
        toast.error('Erro ao atualizar ordem das pastas: ' + (error as any).message);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-folders'] });
    },
  });
}
