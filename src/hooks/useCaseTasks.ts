import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';
import type { CaseTask, CaseTaskStatus } from '@/types/operations';

export function useCaseTasks(caseId: string | null) {
  return useQuery({
    queryKey: ['case-tasks', caseId],
    queryFn: async (): Promise<CaseTask[]> => {
      if (!caseId) return [];
      const { data, error } = await (supabase as any)
        .from('case_tasks')
        .select('*, assignee:profiles!case_tasks_assignee_id_fkey(id,full_name,avatar_url)')
        .eq('case_id', caseId)
        .order('order')
        .order('created_at');
      if (error) throw error;
      return (data || []) as CaseTask[];
    },
    enabled: !!caseId,
  });
}

export function useMyTasks(includeDone = false) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['my-tasks', profile?.id, includeDone],
    queryFn: async () => {
      if (!profile?.id) return [];
      let q = (supabase as any)
        .from('case_tasks')
        .select('*, case:cases(id,title,kind,workspace_id,contact:contacts(name,phone,avatar_url))')
        .eq('assignee_id', profile.id);
      if (!includeDone) q = q.is('completed_at', null);
      const { data, error } = await q.order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });
}

export function useAllPendingTasks(includeDone = false) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['all-pending-tasks', profile?.organization_id, includeDone],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      let q = (supabase as any)
        .from('case_tasks')
        .select('*, case:cases(id,title,kind,workspace_id,contact:contacts(name,phone,avatar_url)), assignee:profiles!case_tasks_assignee_id_fkey(id,full_name,avatar_url)')
        .eq('organization_id', profile.organization_id);
      if (!includeDone) q = q.is('completed_at', null);
      const { data, error } = await q.order('due_date', { ascending: true, nullsFirst: false }).limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useCreateCaseTask() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      case_id: string;
      title: string;
      description?: string;
      assignee_id?: string | null;
      due_date?: string | null;
    }) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      const { error } = await (supabase as any).from('case_tasks').insert({
        ...input,
        organization_id: profile.organization_id,
        created_by: profile.id,
      });
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['case-tasks', v.case_id] });
      qc.invalidateQueries({ queryKey: ['my-tasks'] });
      qc.invalidateQueries({ queryKey: ['all-pending-tasks'] });
      qc.invalidateQueries({ queryKey: ['tasks-by-case'] });
      toast({ title: 'Tarefa adicionada' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateCaseTask() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status, ...rest }: { id: string; status?: CaseTaskStatus } & Partial<CaseTask>) => {
      const patch: any = { ...rest };
      if (status) {
        patch.status = status;
        if (status === 'done') {
          patch.completed_at = new Date().toISOString();
          patch.completed_by = profile?.id;
        } else {
          patch.completed_at = null;
          patch.completed_by = null;
        }
      }
      const { error } = await (supabase as any).from('case_tasks').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-tasks'] });
      qc.invalidateQueries({ queryKey: ['my-tasks'] });
      qc.invalidateQueries({ queryKey: ['all-pending-tasks'] });
      qc.invalidateQueries({ queryKey: ['tasks-by-case'] });
    },
  });
}

export function useDeleteCaseTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('case_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-tasks'] });
      qc.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });
}
