import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface AgentFolder {
  id: string;
  organization_id: string;
  name: string;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useAgentFolders() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['agent-folders'],
    queryFn: async (): Promise<AgentFolder[]> => {
      const { data, error } = await (supabase as any)
        .from('agent_folders')
        .select('*')
        .order('name');

      if (error) throw error;
      return (data || []) as AgentFolder[];
    },
    enabled: !!session,
  });
}

export function useCreateAgentFolder() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ name, workspaceId }: { name: string; workspaceId?: string | null }) => {
      if (!profile?.organization_id) throw new Error('No organization');
      const { data, error } = await (supabase as any)
        .from('agent_folders')
        .insert({
          name,
          organization_id: profile.organization_id,
          workspace_id: workspaceId || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as AgentFolder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-folders'] });
      toast({ title: 'Pasta criada com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao criar pasta', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteAgentFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('agent_folders')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-folders'] });
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      toast({ title: 'Pasta excluída com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir pasta', description: error.message, variant: 'destructive' });
    },
  });
}

export function useRenameAgentFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name, workspaceId }: { id: string; name: string; workspaceId?: string | null }) => {
      const updateData: Record<string, unknown> = { name };
      if (workspaceId !== undefined) updateData.workspace_id = workspaceId;

      const { error } = await (supabase as any)
        .from('agent_folders')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-folders'] });
      toast({ title: 'Pasta atualizada com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar pasta', description: error.message, variant: 'destructive' });
    },
  });
}

export function useMoveAgentToFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, folderId, folderWorkspaceId }: {
      agentId: string;
      folderId: string | null;
      folderWorkspaceId?: string | null;
    }) => {
      const updateData: Record<string, unknown> = { folder_id: folderId };
      if (folderWorkspaceId !== undefined) {
        updateData.workspace_id = folderWorkspaceId;
      }

      const { error } = await (supabase as any)
        .from('ai_agents')
        .update(updateData)
        .eq('id', agentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      toast({ title: 'Agente movido' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao mover agente', description: error.message, variant: 'destructive' });
    },
  });
}
