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
