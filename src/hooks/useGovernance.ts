import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

async function govFetch(action: string, body?: any) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-governance?action=${action}`;
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

export function useGovernanceDashboard() {
  return useQuery({
    queryKey: ['governance', 'dashboard'],
    queryFn: () => govFetch('dashboard'),
    staleTime: 30 * 1000,
  });
}

export function useGovernancePrompts() {
  return useQuery({
    queryKey: ['governance', 'prompts'],
    queryFn: () => govFetch('prompts'),
    staleTime: 30 * 1000,
  });
}

export function useGovernancePromptDetail(id: string | null) {
  return useQuery({
    queryKey: ['governance', 'prompt', id],
    queryFn: () => govFetch(`prompt_detail&id=${id}`),
    enabled: !!id,
  });
}

export function useGovernanceActionLogs() {
  return useQuery({
    queryKey: ['governance', 'action_logs'],
    queryFn: () => govFetch('action_logs'),
    staleTime: 30 * 1000,
  });
}

export function useGovernanceCertifications() {
  return useQuery({
    queryKey: ['governance', 'certifications'],
    queryFn: () => govFetch('certifications'),
    staleTime: 30 * 1000,
  });
}

export function useUpdateCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; status: string; notes?: string }) => govFetch('update_check', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['governance'] });
      toast.success('Verificação atualizada');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpsertCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => govFetch('upsert_check', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['governance'] });
      toast.success('Item salvo');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => govFetch('delete_check', { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['governance'] });
      toast.success('Item removido');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpsertPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => govFetch('upsert_prompt', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['governance', 'prompts'] });
      toast.success('Prompt salvo');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => govFetch('delete_prompt', { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['governance', 'prompts'] });
      toast.success('Prompt removido');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useIssueCertification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => govFetch('issue_certification', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['governance'] });
      toast.success('Certificação emitida!');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRevokeCertification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; reason: string }) => govFetch('revoke_certification', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['governance'] });
      toast.success('Certificação revogada');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRecordScore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => govFetch('record_score', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['governance'] });
      toast.success('Score registrado');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
