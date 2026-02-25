import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface AgentFunctionRole {
  id: string;
  organization_id: string;
  label: string;
  value: string;
  order: number;
  created_at: string;
}

const DEFAULT_ROLES = [
  { value: 'recepcao', label: 'Recepção' },
  { value: 'triagem', label: 'Triagem' },
  { value: 'qualificacao', label: 'Qualificação' },
  { value: 'oferta', label: 'Oferta' },
  { value: 'documentos', label: 'Documentos' },
  { value: 'agenda', label: 'Agenda' },
  { value: 'followup', label: 'Follow-up' },
];

export function useAgentFunctionRoles() {
  const { session, profile } = useAuth();

  return useQuery({
    queryKey: ['agent-function-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_function_roles' as any)
        .select('*')
        .order('order');

      if (error) throw error;
      const roles = (data || []) as unknown as AgentFunctionRole[];
      
      // If no custom roles, seed defaults
      if (roles.length === 0 && profile?.organization_id) {
        const toInsert = DEFAULT_ROLES.map((r, i) => ({
          ...r,
          organization_id: profile.organization_id,
          order: i,
        }));
        const { data: seeded, error: seedErr } = await supabase
          .from('agent_function_roles' as any)
          .insert(toInsert)
          .select();
        if (seedErr) throw seedErr;
        return (seeded || []) as unknown as AgentFunctionRole[];
      }
      return roles;
    },
    enabled: !!session && !!profile?.organization_id,
  });
}

export function useCreateAgentFunctionRole() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (role: { label: string; value: string }) => {
      if (!profile?.organization_id) throw new Error('No organization');
      const { data, error } = await supabase
        .from('agent_function_roles' as any)
        .insert({ ...role, organization_id: profile.organization_id, order: 999 })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-function-roles'] });
      toast({ title: 'Departamento adicionado' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao adicionar departamento', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteAgentFunctionRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agent_function_roles' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-function-roles'] });
      toast({ title: 'Departamento removido' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao remover departamento', description: error.message, variant: 'destructive' });
    },
  });
}
