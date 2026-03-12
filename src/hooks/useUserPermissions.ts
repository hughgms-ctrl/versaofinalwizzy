import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface UserPermissions {
  id: string;
  user_id: string;
  organization_id: string;
  can_access_dashboard: boolean;
  can_access_conversations: boolean;
  can_access_pipeline: boolean;
  can_access_flows: boolean;
  can_access_reports: boolean;
  can_access_agents: boolean;
  can_access_settings: boolean;
  can_access_team: boolean;
  can_access_scheduled: boolean;
  can_access_calendar: boolean;
  conversations_filter_type: 'all' | 'assigned' | 'tags' | 'assigned_and_tags';
  conversations_allowed_tags: string[];
  pipeline_access_type: 'all' | 'specific';
  allowed_pipeline_ids: string[];
  hide_unassigned_pipeline_ids: string[];
  created_at: string;
  updated_at: string;
}

export function useUserPermissions(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;

  return useQuery({
    queryKey: ['user-permissions', targetUserId],
    queryFn: async (): Promise<UserPermissions | null> => {
      if (!targetUserId) return null;

      const { data, error } = await (supabase as any)
        .from('user_permissions')
        .select('*')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (error) throw error;
      return data as UserPermissions | null;
    },
    enabled: !!targetUserId,
  });
}

export function useAllUserPermissions() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['all-user-permissions', profile?.organization_id],
    queryFn: async (): Promise<UserPermissions[]> => {
      if (!profile?.organization_id) return [];

      const { data, error } = await (supabase as any)
        .from('user_permissions')
        .select('*')
        .eq('organization_id', profile.organization_id);

      if (error) throw error;
      return (data || []) as UserPermissions[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useUpdateUserPermissions() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (permissions: Partial<UserPermissions> & { user_id: string }) => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada');

      const { user_id, ...rest } = permissions;

      // Upsert permissions
      const { error } = await (supabase as any)
        .from('user_permissions')
        .upsert({
          user_id,
          organization_id: profile.organization_id,
          ...rest,
        }, {
          onConflict: 'user_id,organization_id',
        });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions', variables.user_id] });
      queryClient.invalidateQueries({ queryKey: ['all-user-permissions'] });
      toast({ title: 'Permissões atualizadas!' });
    },
    onError: (error: any) => {
      console.error('Error updating permissions:', error);
      toast({ title: 'Erro ao atualizar permissões', description: error.message, variant: 'destructive' });
    },
  });
}

// Hook to check if current user has access to a module
export function useCanAccessModule(module: string) {
  const { user, profile } = useAuth();
  const { data: permissions, isLoading } = useUserPermissions();
  const { data: userRole } = useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      return data?.role || null;
    },
    enabled: !!user?.id,
  });

  // Owners and admins always have full access
  if (userRole === 'owner' || userRole === 'admin') {
    return { canAccess: true, isLoading: false };
  }

  // If no permissions set, deny by default for non-owners
  if (!permissions && !isLoading) {
    return { canAccess: false, isLoading: false };
  }

  const moduleMap: Record<string, keyof UserPermissions> = {
    conversations: 'can_access_conversations',
    pipeline: 'can_access_pipeline',
    flows: 'can_access_flows',
    reports: 'can_access_reports',
    agents: 'can_access_agents',
    settings: 'can_access_settings',
    team: 'can_access_team',
    scheduled: 'can_access_scheduled',
  };

  const key = moduleMap[module];
  const canAccess = key ? (permissions?.[key] as boolean) ?? false : false;

  return { canAccess, isLoading };
}

// Hook to get current user's role
export function useCurrentUserRole() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['current-user-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      return data?.role as 'owner' | 'admin' | 'supervisor' | 'agent' | null;
    },
    enabled: !!user?.id,
  });
}
