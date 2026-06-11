import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useOrganizationPlan } from './useOrganizationPlan';
import { isMissingRelationError } from '@/lib/supabaseErrors';

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

export interface UserWorkspaceAccess {
  workspace_id: string;
  organization_id: string;
}

export type OrganizationRole = 'owner' | 'admin' | 'supervisor' | 'agent' | 'platform_admin';

export interface OrganizationMembership {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  created_at: string;
  organization?: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  } | null;
}

export function useOrganizationMemberships() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['organization-memberships', session?.user?.id],
    queryFn: async (): Promise<OrganizationMembership[]> => {
      if (!session?.user?.id) return [];
      const { data, error } = await (supabase as any)
        .from('organization_members')
        .select('id, organization_id, user_id, role, created_at, organization:organizations(id, name, slug, logo_url)')
        .eq('user_id', session.user.id)
        .order('created_at');

      if (error && !isMissingRelationError(error)) throw error;
      if (error && isMissingRelationError(error)) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, organization_id, user_id, created_at, organization:organizations(id, name, slug, logo_url)')
          .eq('user_id', session.user.id);
        if (profileError) throw profileError;

        const { data: roles } = await (supabase as any)
          .from('user_roles')
          .select('role, organization_id')
          .eq('user_id', session.user.id);

        return (profiles || []).map((profile: any) => {
          const roleRow = (roles || []).find((row: any) =>
            !row.organization_id || row.organization_id === profile.organization_id
          );
          return {
            id: profile.id,
            organization_id: profile.organization_id,
            user_id: profile.user_id,
            role: (roleRow?.role || 'admin') as OrganizationRole,
            created_at: profile.created_at,
            organization: profile.organization,
          };
        });
      }
      return (data || []) as OrganizationMembership[];
    },
    enabled: !!session?.user?.id,
  });
}

export function useWorkspaces(organizationId?: string | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['workspaces', organizationId || 'all'],
    queryFn: async (): Promise<Workspace[]> => {
      let query = supabase
        .from('workspaces')
        .select('*')
        .eq('is_active', true);

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;
      return (data || []) as unknown as Workspace[];
    },
    enabled: !!session,
  });
}

export function useAllWorkspaces(organizationId?: string | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['workspaces', 'all', organizationId || 'visible'],
    queryFn: async (): Promise<Workspace[]> => {
      let query = supabase
        .from('workspaces')
        .select('*');

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;
      return (data || []) as unknown as Workspace[];
    },
    enabled: !!session,
  });
}

export function useVisibleWorkspaces() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['workspaces', 'visible', session?.user?.id],
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
    queryKey: ['user-workspaces', session?.user?.id],
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

export function useUserWorkspaceAccess() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['user-workspace-access', session?.user?.id],
    queryFn: async (): Promise<UserWorkspaceAccess[]> => {
      if (!session?.user?.id) return [];
      const { data, error } = await supabase
        .from('workspace_members')
        .select('workspace_id, workspace:workspaces(organization_id)')
        .eq('user_id', session.user.id);

      if (error) throw error;

      return (data || [])
        .map((row: any) => ({
          workspace_id: row.workspace_id,
          organization_id: Array.isArray(row.workspace)
            ? row.workspace[0]?.organization_id
            : row.workspace?.organization_id,
        }))
        .filter((row: UserWorkspaceAccess) => row.workspace_id && row.organization_id);
    },
    enabled: !!session,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { usage } = useOrganizationPlan();

  return useMutation({
    mutationFn: async (workspace: {
      name: string;
      organization_id?: string;
      description?: string;
      filter_tag_ids?: string[];
      color?: string;
      whatsapp_instance_id?: string | null;
    }) => {
      const organizationId = workspace.organization_id || profile?.organization_id;
      if (!organizationId) throw new Error('No organization');
      if (usage.workspaceLimit > 0 && usage.workspaceCount >= usage.workspaceLimit) {
        throw new Error(`Limite de workspaces atingido neste plano (${usage.workspaceCount}/${usage.workspaceLimit}). Faça upgrade para criar mais workspaces.`);
      }
      const { organization_id: _organizationId, ...workspaceInput } = workspace;
      const { data, error } = await supabase
        .from('workspaces')
        .insert({
          ...workspaceInput,
          organization_id: organizationId,
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

export function useSetUserWorkspaces() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, workspaceIds, organizationId }: {
      userId: string;
      workspaceIds: string[];
      organizationId?: string | null;
    }) => {
      if (!organizationId) throw new Error('Organizacao nao encontrada');
      const { data, error } = await supabase.functions.invoke('update-team-member', {
        body: { userId, workspaceIds, organizationId },
      });

      if (error) throw await getFunctionError(error);
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      queryClient.invalidateQueries({ queryKey: ['user-workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      variables.workspaceIds.forEach(workspaceId => {
        queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      });
    },
  });
}

async function getFunctionError(error: any) {
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.error) return new Error(body.error);
    } catch {
      // Fall back to the Supabase error message below.
    }
  }
  return error;
}
