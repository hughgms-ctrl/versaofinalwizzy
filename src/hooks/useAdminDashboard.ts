import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

async function adminFetch(action: string, body?: any) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-dashboard?action=${action}`;
  const options: RequestInit = {
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  };

  if (body) {
    options.method = 'POST';
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => adminFetch('overview'),
    staleTime: 60 * 1000,
  });
}

export function useAdminClients() {
  return useQuery({
    queryKey: ['admin', 'clients'],
    queryFn: () => adminFetch('clients'),
    staleTime: 60 * 1000,
  });
}

export function useAdminPlans() {
  return useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => adminFetch('plans'),
    staleTime: 60 * 1000,
  });
}

export function useAdminSecurity() {
  return useQuery({
    queryKey: ['admin', 'security'],
    queryFn: () => adminFetch('security'),
    staleTime: 60 * 1000,
  });
}

export function useAdminGovernance() {
  return useQuery({
    queryKey: ['admin', 'governance'],
    queryFn: () => adminFetch('governance'),
    staleTime: 60 * 1000,
  });
}

export function useAdminApi() {
  return useQuery({
    queryKey: ['admin', 'api'],
    queryFn: () => adminFetch('api'),
    staleTime: 60 * 1000,
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (plan: any) => adminFetch('update_plan', plan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
      toast.success('Plano salvo com sucesso');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAssignPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { organization_id: string; plan_id: string }) => adminFetch('assign_plan', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] });
      toast.success('Plano atribuído com sucesso');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAdminOrgUsers(orgId: string | null) {
  return useQuery({
    queryKey: ['admin', 'org-users', orgId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-dashboard?action=org_users&org_id=${orgId}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    },
    enabled: !!orgId,
    staleTime: 30 * 1000,
  });
}

export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { user_id: string; block: boolean }) => adminFetch('block_user', data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'org-users'] });
      toast.success(vars.block ? 'Usuário bloqueado' : 'Usuário desbloqueado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteOrgUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { user_id: string }) => adminFetch('delete_org_user', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'org-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] });
      toast.success('Usuário excluído com sucesso');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (organization_id: string) => adminFetch('delete_organization', { organization_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] });
      toast.success('Organização excluída com sucesso');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAdminSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => adminFetch('get_settings'),
    staleTime: 30 * 1000,
  });
}

export function useToggleSignups() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (allow: boolean) => adminFetch('toggle_signups', { allow }),
    onSuccess: (_, allow) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      toast.success(allow ? 'Cadastros automáticos habilitados' : 'Cadastros automáticos desabilitados');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSecurityAlerts() {
  return useQuery({
    queryKey: ['admin', 'security-alerts'],
    queryFn: () => adminFetch('security_alerts'),
    staleTime: 30 * 1000, // Frequent updates for security
  });
}
