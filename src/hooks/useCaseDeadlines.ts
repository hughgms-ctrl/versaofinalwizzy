import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';
import type { CaseDeadline } from '@/types/operations';

export function useCaseDeadlines(caseId: string | null) {
  return useQuery({
    queryKey: ['case-deadlines', caseId],
    queryFn: async (): Promise<CaseDeadline[]> => {
      if (!caseId) return [];
      const { data, error } = await (supabase as any)
        .from('case_deadlines')
        .select('*')
        .eq('case_id', caseId)
        .order('due_date');
      if (error) throw error;
      return (data || []) as CaseDeadline[];
    },
    enabled: !!caseId,
  });
}

export function useAllDeadlines() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['all-deadlines', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await (supabase as any)
        .from('case_deadlines')
        .select('*, case:cases(id,title,kind)')
        .is('completed_at', null)
        .order('due_date');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useCreateDeadline() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      case_id: string;
      title: string;
      description?: string;
      due_date: string;
      is_fatal?: boolean;
      notify_days_before?: number;
    }) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      const { error } = await (supabase as any).from('case_deadlines').insert({
        ...input,
        organization_id: profile.organization_id,
        created_by: profile.id,
      });
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['case-deadlines', v.case_id] });
      qc.invalidateQueries({ queryKey: ['all-deadlines'] });
      toast({ title: 'Prazo adicionado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateDeadline() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ id, complete, ...rest }: { id: string; complete?: boolean } & Partial<CaseDeadline>) => {
      const patch: any = { ...rest };
      if (complete !== undefined) {
        patch.completed_at = complete ? new Date().toISOString() : null;
        patch.completed_by = complete ? profile?.id : null;
      }
      const { error } = await (supabase as any).from('case_deadlines').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-deadlines'] });
      qc.invalidateQueries({ queryKey: ['all-deadlines'] });
    },
  });
}

export function useDeleteDeadline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('case_deadlines').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-deadlines'] });
      qc.invalidateQueries({ queryKey: ['all-deadlines'] });
    },
  });
}

export function useCaseActivity(caseId: string | null) {
  return useQuery({
    queryKey: ['case-activity', caseId],
    queryFn: async () => {
      if (!caseId) return [];
      const { data, error } = await (supabase as any)
        .from('case_activity_log')
        .select('*, actor:profiles(full_name,avatar_url)')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!caseId,
  });
}
