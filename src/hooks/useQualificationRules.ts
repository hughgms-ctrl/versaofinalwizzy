import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface QualificationRule {
  id: string;
  organization_id: string;
  agent_id: string | null;
  flow_id: string | null;
  node_id: string | null;
  label: string;
  criteria: string;
  requires_all: boolean;
  is_active: boolean;
  order: number;
  created_at: string;
  updated_at: string;
}

export type QualificationScope =
  | { type: 'agent'; agent_id: string }
  | { type: 'flow-node'; flow_id: string; node_id: string };

function scopeKey(scope: QualificationScope | undefined): unknown[] {
  if (!scope) return ['none'];
  if (scope.type === 'agent') return ['agent', scope.agent_id];
  return ['flow-node', scope.flow_id, scope.node_id];
}

export function useQualificationRules(scope?: QualificationScope) {
  return useQuery({
    queryKey: ['qualification-rules', ...scopeKey(scope)],
    queryFn: async () => {
      if (!scope) return [];
      let query = supabase
        .from('agent_qualification_rules')
        .select('*')
        .order('order', { ascending: true })
        .order('created_at', { ascending: true });

      if (scope.type === 'agent') {
        query = query.eq('agent_id', scope.agent_id).is('flow_id', null);
      } else {
        query = query.eq('flow_id', scope.flow_id).eq('node_id', scope.node_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as QualificationRule[];
    },
    enabled: !!scope,
  });
}

export function useCreateQualificationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      scope: QualificationScope;
      organization_id: string;
      label: string;
      criteria: string;
      requires_all?: boolean;
      order?: number;
    }) => {
      const payload: any = {
        organization_id: input.organization_id,
        label: input.label,
        criteria: input.criteria,
        requires_all: input.requires_all ?? true,
        order: input.order ?? 0,
      };
      if (input.scope.type === 'agent') {
        payload.agent_id = input.scope.agent_id;
      } else {
        payload.flow_id = input.scope.flow_id;
        payload.node_id = input.scope.node_id;
      }
      const { data, error } = await supabase
        .from('agent_qualification_rules')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['qualification-rules', ...scopeKey(vars.scope)] });
      toast.success('Regra adicionada');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao salvar'),
  });
}

export function useUpdateQualificationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      scope: _scope,
      ...patch
    }: Partial<QualificationRule> & { id: string; scope: QualificationScope }) => {
      const { error } = await supabase
        .from('agent_qualification_rules')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['qualification-rules', ...scopeKey(vars.scope)] });
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao atualizar'),
  });
}

export function useDeleteQualificationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, scope: _s }: { id: string; scope: QualificationScope }) => {
      const { error } = await supabase
        .from('agent_qualification_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['qualification-rules', ...scopeKey(vars.scope)] });
      toast.success('Regra removida');
    },
  });
}
