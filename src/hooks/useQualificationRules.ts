import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface QualificationRule {
  id: string;
  organization_id: string;
  agent_id: string;
  label: string;
  criteria: string;
  requires_all: boolean;
  is_active: boolean;
  order: number;
  created_at: string;
  updated_at: string;
}

export function useQualificationRules(agentId?: string) {
  return useQuery({
    queryKey: ['qualification-rules', agentId],
    queryFn: async () => {
      if (!agentId) return [];
      const { data, error } = await supabase
        .from('agent_qualification_rules')
        .select('*')
        .eq('agent_id', agentId)
        .order('order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as QualificationRule[];
    },
    enabled: !!agentId,
  });
}

export function useCreateQualificationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      agent_id: string;
      organization_id: string;
      label: string;
      criteria: string;
      requires_all?: boolean;
      order?: number;
    }) => {
      const { data, error } = await supabase
        .from('agent_qualification_rules')
        .insert({
          agent_id: input.agent_id,
          organization_id: input.organization_id,
          label: input.label,
          criteria: input.criteria,
          requires_all: input.requires_all ?? true,
          order: input.order ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['qualification-rules', vars.agent_id] });
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
      agent_id: _agent_id,
      ...patch
    }: Partial<QualificationRule> & { id: string; agent_id: string }) => {
      const { error } = await supabase
        .from('agent_qualification_rules')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['qualification-rules', vars.agent_id] });
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao atualizar'),
  });
}

export function useDeleteQualificationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, agent_id: _a }: { id: string; agent_id: string }) => {
      const { error } = await supabase
        .from('agent_qualification_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['qualification-rules', vars.agent_id] });
      toast.success('Regra removida');
    },
  });
}
