import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Workspace {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  filter_tag_ids: string[];
  color: string;
  whatsapp_instance_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  created_at: string;
}

export function useWorkspaces() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['workspaces'],
    queryFn: async (): Promise<Workspace[]> => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return (data || []) as unknown as Workspace[];
    },
    enabled: !!session,
  });
}

export function useWorkspaceMembers(workspaceId?: string | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: async (): Promise<WorkspaceMember[]> => {
      if (!workspaceId) return [];
      const { data, error } = await supabase
        .from('workspace_members')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (error) throw error;
      return (data || []) as unknown as WorkspaceMember[];
    },
    enabled: !!session && !!workspaceId,
  });
}

export function useUserWorkspaces() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['user-workspaces'],
    queryFn: async (): Promise<string[]> => {
      if (!session?.user?.id) return [];
      const { data, error } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', session.user.id);

      if (error) throw error;
      return (data || []).map((d: any) => d.workspace_id);
    },
    enabled: !!session,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (workspace: {
      name: string;
      description?: string;
      filter_tag_ids?: string[];
      color?: string;
      whatsapp_instance_id?: string | null;
    }) => {
      if (!profile?.organization_id) throw new Error('No organization');
      const { data, error } = await supabase
        .from('workspaces')
        .insert({
          ...workspace,
          organization_id: profile.organization_id,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: string;
      name?: string;
      description?: string;
      filter_tag_ids?: string[];
      color?: string;
      whatsapp_instance_id?: string | null;
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('workspaces')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useManageWorkspaceMembers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workspaceId, userIds }: {
      workspaceId: string;
      userIds: string[];
    }) => {
      // Remove all existing members
      await supabase
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId);

      // Add new members
      if (userIds.length > 0) {
        const { error } = await supabase
          .from('workspace_members')
          .insert(
            userIds.map(userId => ({
              workspace_id: workspaceId,
              user_id: userId,
            })) as any
          );

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', variables.workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['user-workspaces'] });
    },
  });
}
