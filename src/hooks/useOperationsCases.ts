import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { toast } from './use-toast';
import type { OperationsCase, CaseKind, CasePriority } from '@/types/operations';

export function useCaseCategories() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['case-categories', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await (supabase as any)
        .from('case_categories')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useCaseStatuses() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['case-statuses', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await (supabase as any)
        .from('case_statuses')
        .select('*')
        .order('order');
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useCases(filters?: {
  kind?: CaseKind | 'all';
  status_id?: string | 'all';
  assignee_id?: string | 'all';
  category_id?: string | 'all';
}) {
  const { profile } = useAuth();
  const { selectedWorkspaceId } = useWorkspaceContext();

  return useQuery({
    queryKey: ['cases', profile?.organization_id, selectedWorkspaceId, filters],
    queryFn: async (): Promise<OperationsCase[]> => {
      if (!profile?.organization_id) return [];
      let q = (supabase as any)
        .from('cases')
        .select('*, contact:contacts(id,name,phone,avatar_url), category:case_categories(id,name,kind,color,icon), assignee:profiles!cases_assignee_id_fkey(id,full_name,avatar_url)')
        .order('opened_at', { ascending: false });

      if (selectedWorkspaceId) q = q.eq('workspace_id', selectedWorkspaceId);
      if (filters?.kind && filters.kind !== 'all') q = q.eq('kind', filters.kind);
      if (filters?.status_id && filters.status_id !== 'all') q = q.eq('status_id', filters.status_id);
      if (filters?.assignee_id && filters.assignee_id !== 'all') q = q.eq('assignee_id', filters.assignee_id);
      if (filters?.category_id && filters.category_id !== 'all') q = q.eq('category_id', filters.category_id);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as OperationsCase[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useCase(caseId: string | null) {
  return useQuery({
    queryKey: ['case', caseId],
    queryFn: async () => {
      if (!caseId) return null;
      const { data, error } = await (supabase as any)
        .from('cases')
        .select('*, contact:contacts(*), category:case_categories(*), assignee:profiles!cases_assignee_id_fkey(id,full_name,avatar_url), status:case_statuses(*)')
        .eq('id', caseId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!caseId,
  });
}

export function useUpdateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<OperationsCase>) => {
      const { error } = await (supabase as any).from('cases').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['case', vars.id] });
    },
    onError: (e: any) => toast({ title: 'Erro ao atualizar caso', description: e.message, variant: 'destructive' }),
  });
}

export function useCreateCase() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { selectedWorkspaceId } = useWorkspaceContext();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      kind: CaseKind;
      category_id?: string | null;
      contact_id?: string | null;
      conversation_id?: string | null;
      assignee_id?: string | null;
      status_id?: string | null;
      priority?: CasePriority;
    }) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      const { data, error } = await (supabase as any)
        .from('cases')
        .insert({
          ...input,
          organization_id: profile.organization_id,
          workspace_id: selectedWorkspaceId,
          created_by: profile.id,
          priority: input.priority || 'medium',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases'] });
      toast({ title: 'Caso criado!' });
    },
    onError: (e: any) => toast({ title: 'Erro ao criar caso', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('cases').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases'] });
      toast({ title: 'Caso removido' });
    },
  });
}
