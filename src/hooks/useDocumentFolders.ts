import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type DocumentFolderKind = 'template' | 'pack' | 'both';

export interface DocumentFolder {
  id: string;
  organization_id: string;
  name: string;
  workspace_id: string | null;
  position: number;
  kind: DocumentFolderKind;
  created_at: string;
  updated_at: string;
}

export function useDocumentFolders(kind?: DocumentFolderKind) {
  return useQuery({
    queryKey: ['document-folders', kind || 'all'],
    queryFn: async () => {
      let q = (supabase as any)
        .from('document_folders')
        .select('*')
        .order('position', { ascending: true })
        .order('name');
      if (kind) q = q.in('kind', [kind, 'both']);
      const { data, error } = await q;

      if (error) throw error;
      return (data || []) as DocumentFolder[];
    },
  });
}

export function useCreateDocumentFolder() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ name, workspaceId, kind = 'both' }: { name: string; workspaceId?: string | null; kind?: DocumentFolderKind }) => {
      const { data, error } = await (supabase as any)
        .from('document_folders')
        .insert({
          name,
          organization_id: profile!.organization_id,
          workspace_id: workspaceId || null,
          kind,
        })
        .select()
        .single();

      if (error) throw error;
      return data as DocumentFolder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-folders'] });
      toast.success('Pasta criada');
    },
    onError: (error: any) => {
      toast.error('Erro ao criar pasta: ' + error.message);
    },
  });
}

export function useRenameDocumentFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ folderId, name, workspaceId }: { folderId: string; name: string; workspaceId?: string | null }) => {
      const updateData: Record<string, unknown> = { name };
      if (workspaceId !== undefined) updateData.workspace_id = workspaceId;

      const { error } = await (supabase as any)
        .from('document_folders')
        .update(updateData)
        .eq('id', folderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-folders'] });
      toast.success('Pasta atualizada');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar pasta: ' + error.message);
    },
  });
}

export function useDeleteDocumentFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (folderId: string) => {
      const { error } = await (supabase as any)
        .from('document_folders')
        .delete()
        .eq('id', folderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-folders'] });
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      queryClient.invalidateQueries({ queryKey: ['document-packs'] });
      toast.success('Pasta excluída');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir pasta: ' + error.message);
    },
  });
}

export function useMoveDocumentToFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ type, itemId, folderId, folderWorkspaceId }: {
      type: 'template' | 'pack';
      itemId: string;
      folderId: string | null;
      folderWorkspaceId?: string | null;
    }) => {
      const table = type === 'template' ? 'document_templates' : 'document_packs';
      const updateData: Record<string, unknown> = { folder_id: folderId };
      if (folderWorkspaceId !== undefined && folderWorkspaceId !== null) {
        updateData.workspace_id = folderWorkspaceId;
      }

      const { error } = await (supabase as any)
        .from(table)
        .update(updateData)
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      queryClient.invalidateQueries({ queryKey: ['document-packs'] });
      toast.success('Item movido');
    },
    onError: (error: any) => {
      toast.error('Erro ao mover: ' + error.message);
    },
  });
}

export function useUpdateDocumentWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ type, itemId, workspaceId }: {
      type: 'template' | 'pack';
      itemId: string;
      workspaceId: string | null;
    }) => {
      const table = type === 'template' ? 'document_templates' : 'document_packs';
      const { error } = await (supabase as any)
        .from(table)
        .update({ workspace_id: workspaceId })
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-templates'] });
      queryClient.invalidateQueries({ queryKey: ['document-packs'] });
      toast.success('Workspace atualizado');
    },
    onError: (error: any) => {
      toast.error('Erro: ' + error.message);
    },
  });
}
