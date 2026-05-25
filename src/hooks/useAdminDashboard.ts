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

export function useAdminWhatsAppIntegrations() {
  return useQuery({
    queryKey: ['admin', 'whatsapp-integrations'],
    queryFn: () => adminFetch('whatsapp_integrations'),
    staleTime: 30 * 1000,
  });
}

export function useUpdateWhatsAppStrategy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (strategy: {
      primary_provider: 'evolution' | 'uazapi';
      backup_provider: 'evolution' | 'uazapi';
      evolution_enabled: boolean;
      uazapi_enabled: boolean;
      auto_fallback_enabled: boolean;
    }) => adminFetch('update_whatsapp_strategy', strategy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'whatsapp-integrations'] });
      toast.success('Estratégia de WhatsApp salva');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateWhatsAppConnectionSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: {
      uazapi_base_url?: string;
      uazapi_admin_token?: string;
      evolution_base_url?: string;
      evolution_api_key?: string;
      webhook_url?: string;
    }) => adminFetch('update_whatsapp_connection_settings', settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'whatsapp-integrations'] });
      toast.success('Configurações de conexão salvas');
    },
    onError: (err: Error) => toast.error(err.message),
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

export function useToggleClientPlansMenu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (show: boolean) => adminFetch('toggle_client_plans_menu', { show }),
    onSuccess: (_, show) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['platform-setting', 'show_client_plans_menu'] });
      toast.success(show ? 'Aba Planos habilitada para clientes' : 'Aba Planos ocultada dos clientes');
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] });
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
    staleTime: 30 * 1000,
  });
}

export function useAdminOrgDetails(orgId: string | null) {
  return useQuery({
    queryKey: ['admin', 'org-details', orgId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-dashboard?action=org_details&org_id=${orgId}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch org details');
      return res.json();
    },
    enabled: !!orgId,
    staleTime: 30 * 1000,
  });
}

export function useBlockIp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { ip_address: string; reason?: string }) => adminFetch('block_ip', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast.success('IP bloqueado com sucesso');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useApproveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { user_id: string }) => adminFetch('approve_user', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast.success('Usuário aprovado com sucesso');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['admin', 'pending-approvals'],
    queryFn: () => adminFetch('pending_approvals'),
    staleTime: 30 * 1000,
  });
}
