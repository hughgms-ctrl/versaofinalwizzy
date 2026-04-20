import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface CaseStatusInput {
  name: string;
  color?: string;
  category_id?: string | null;
  is_default?: boolean;
  is_closed?: boolean;
  order?: number;
}

export function useCreateCaseStatus() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: CaseStatusInput) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      const { data, error } = await (supabase as any)
        .from('case_statuses')
        .insert({
          organization_id: profile.organization_id,
          name: input.name,
          color: input.color || '#94a3b8',
          category_id: input.category_id || null,
          is_default: input.is_default || false,
          is_closed: input.is_closed || false,
          order: input.order ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-statuses'] });
    },
    onError: (e: any) => toast({ title: 'Erro ao criar coluna', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateCaseStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<CaseStatusInput>) => {
      const { error } = await (supabase as any).from('case_statuses').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-statuses'] });
    },
    onError: (e: any) => toast({ title: 'Erro ao atualizar', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteCaseStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('case_statuses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-statuses'] });
      toast({ title: 'Coluna removida' });
    },
    onError: (e: any) => toast({ title: 'Erro ao remover', description: e.message, variant: 'destructive' }),
  });
}

export function useReorderCaseStatuses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: { id: string; order: number }[]) => {
      await Promise.all(
        items.map((it) =>
          (supabase as any).from('case_statuses').update({ order: it.order }).eq('id', it.id)
        )
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-statuses'] });
    },
  });
}

export function useCloneStatusesFromCategory() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ from_category_id, to_category_id }: { from_category_id: string | null; to_category_id: string | null }) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      const fromQuery = (supabase as any)
        .from('case_statuses')
        .select('*')
        .eq('organization_id', profile.organization_id);
      const { data: source, error } = await (from_category_id
        ? fromQuery.eq('category_id', from_category_id)
        : fromQuery.is('category_id', null));
      if (error) throw error;
      if (!source || source.length === 0) throw new Error('A categoria de origem não tem colunas.');

      const inserts = source.map((s: any) => ({
        organization_id: profile.organization_id,
        category_id: to_category_id,
        name: s.name,
        color: s.color,
        order: s.order,
        is_default: s.is_default,
        is_closed: s.is_closed,
      }));
      const { error: insErr } = await (supabase as any).from('case_statuses').insert(inserts);
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-statuses'] });
      toast({ title: 'Colunas copiadas com sucesso!' });
    },
    onError: (e: any) => toast({ title: 'Erro ao copiar', description: e.message, variant: 'destructive' }),
  });
}
