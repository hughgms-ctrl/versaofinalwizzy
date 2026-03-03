import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface AIAgent {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  persona: string | null;
  avatar_url: string | null;
  is_active: boolean;
  knowledge_base: any;
  workspace_id: string | null;
  function_role: string;
  prompt_base: string;
  tag_ids: string[];
  pipeline_column_ids: string[];
  flow_ids: string[];
  folder_id: string | null;
  provider: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
}

export const AGENT_FUNCTION_ROLES = [
  { value: 'recepcao', label: 'Recepção' },
  { value: 'triagem', label: 'Triagem' },
  { value: 'qualificacao', label: 'Qualificação' },
  { value: 'documentos', label: 'Documentos' },
  { value: 'agenda', label: 'Agenda' },
  { value: 'followup', label: 'Follow-up' },
] as const;

export function useAIAgents() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['ai-agents'],
    queryFn: async (): Promise<AIAgent[]> => {
      const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .order('created_at');

      if (error) throw error;
      return (data || []) as unknown as AIAgent[];
    },
    enabled: !!session,
  });
}

export function useCreateAIAgent() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (agent: {
      name: string;
      description?: string;
      function_role: string;
      prompt_base?: string;
      tag_ids?: string[];
      pipeline_column_ids?: string[];
      flow_ids?: string[];
      workspace_id?: string | null;
      provider?: string;
      model?: string;
    }) => {
      if (!profile?.organization_id) throw new Error('No organization');
      const { data, error } = await supabase
        .from('ai_agents')
        .insert({
          ...agent,
          organization_id: profile.organization_id,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      toast({ title: 'Agente criado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar agente', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateAIAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AIAgent> & { id: string }) => {
      const { data, error } = await supabase
        .from('ai_agents')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      toast({ title: 'Agente atualizado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar agente', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteAIAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_agents')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      toast({ title: 'Agente excluído com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao excluir agente', description: error.message, variant: 'destructive' });
    },
  });
}
