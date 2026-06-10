import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { isMissingRelationError } from '@/lib/supabaseErrors';

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
  can_access_operations: boolean;
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
  const { selectedOrganizationId } = useWorkspaceContext();
  const targetUserId = userId || user?.id;

  return useQuery({
    queryKey: ['user-permissions', targetUserId, selectedOrganizationId],
    queryFn: async (): Promise<UserPermissions | null> => {
      if (!targetUserId) return null;

      let query = (supabase as any)
        .from('user_permissions')
        .select('*')
        .eq('user_id', targetUserId);

      if (selectedOrganizationId) {
        query = query.eq('organization_id', selectedOrganizationId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      return data as UserPermissions | null;
    },
    enabled: !!targetUserId,
  });
}

export function useAllUserPermissions() {
  const { profile } = useAuth();
  const { selectedOrganizationId } = useWorkspaceContext();
  const organizationId = selectedOrganizationId || profile?.organization_id || null;

  return useQuery({
    queryKey: ['all-user-permissions', organizationId],
    queryFn: async (): Promise<UserPermissions[]> => {
      if (!organizationId) return [];

      const { data, error } = await (supabase as any)
        .from('user_permissions')
        .select('*')
        .eq('organization_id', organizationId);

      if (error) throw error;
      return (data || []) as UserPermissions[];
    },
    enabled: !!organizationId,
  });
}

export function useUpdateUserPermissions() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { selectedOrganizationId } = useWorkspaceContext();
  const organizationId = selectedOrganizationId || profile?.organization_id || null;

  return useMutation({
    mutationFn: async (permissions: Partial<UserPermissions> & { user_id: string }) => {
      if (!organizationId) throw new Error('Organizacao nao encontrada');

      const { user_id, ...rest } = permissions;

      const { error } = await (supabase as any)
        .from('user_permissions')
        .upsert({
          user_id,
          organization_id: organizationId,
          ...rest,
        }, {
          onConflict: 'user_id,organization_id',
        });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions', variables.user_id] });
      queryClient.invalidateQueries({ queryKey: ['all-user-permissions'] });
      toast({ title: 'Permissoes atualizadas!' });
    },
    onError: (error: any) => {
      console.error('Error updating permissions:', error);
      toast({ title: 'Erro ao atualizar permissoes', description: error.message, variant: 'destructive' });
    },
  });
}

export function useCanAccessModule(module: string) {
  const { user } = useAuth();
  const { selectedOrganizationId } = useWorkspaceContext();
  const { data: permissions, isLoading } = useUserPermissions();
  const { data: userRole } = useQuery({
    queryKey: ['user-role', user?.id, selectedOrganizationId],
    queryFn: async () => {
      if (!user?.id) return null;
      let query = (supabase as any)
        .from('organization_members')
        .select('role')
        .eq('user_id', user.id);

      if (selectedOrganizationId) {
        query = query.eq('organization_id', selectedOrganizationId);
      }

      const { data, error } = await query.maybeSingle();
      if (error && !isMissingRelationError(error)) throw error;
      if (error && isMissingRelationError(error)) {
        const roleQuery = (supabase as any)
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);
        if (selectedOrganizationId) roleQuery.eq('organization_id', selectedOrganizationId);
        const { data: legacyRole } = await roleQuery.maybeSingle();
        return legacyRole?.role || null;
      }
      return data?.role || null;
    },
    enabled: !!user?.id,
  });

  if (userRole === 'owner' || userRole === 'admin' || userRole === 'platform_admin') {
    return { canAccess: true, isLoading: false };
  }

  if (!permissions && !isLoading) {
    return { canAccess: false, isLoading: false };
  }

  const moduleMap: Record<string, keyof UserPermissions> = {
    dashboard: 'can_access_dashboard',
    conversations: 'can_access_conversations',
    pipeline: 'can_access_pipeline',
    flows: 'can_access_flows',
    reports: 'can_access_reports',
    agents: 'can_access_agents',
    settings: 'can_access_settings',
    team: 'can_access_team',
    scheduled: 'can_access_scheduled',
    calendar: 'can_access_calendar',
    operations: 'can_access_operations',
  };

  const key = moduleMap[module];
  const canAccess = key ? (permissions?.[key] as boolean) ?? false : false;

  return { canAccess, isLoading };
}

export function useCurrentUserRole(organizationId?: string | null) {
  const { user, profile } = useAuth();
  const { selectedOrganizationId } = useWorkspaceContext();
  const scopedOrganizationId = organizationId ?? selectedOrganizationId ?? profile?.organization_id ?? null;

  return useQuery({
    queryKey: ['current-user-role', user?.id, scopedOrganizationId],
    queryFn: async () => {
      if (!user?.id) return null;
      let query = (supabase as any)
        .from('organization_members')
        .select('role')
        .eq('user_id', user.id);

      if (scopedOrganizationId) {
        query = query.eq('organization_id', scopedOrganizationId);
      }

      const { data, error } = await query.maybeSingle();
      if (error && !isMissingRelationError(error)) throw error;
      if (error && isMissingRelationError(error)) {
        const roleQuery = (supabase as any)
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);
        if (scopedOrganizationId) roleQuery.eq('organization_id', scopedOrganizationId);
        const { data: legacyRole } = await roleQuery.maybeSingle();
        return (legacyRole?.role || 'admin') as 'owner' | 'admin' | 'supervisor' | 'agent' | null;
      }
      return data?.role as 'owner' | 'admin' | 'supervisor' | 'agent' | null;
    },
    enabled: !!user?.id,
  });
}
