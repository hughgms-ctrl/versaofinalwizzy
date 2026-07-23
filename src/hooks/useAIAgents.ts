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
  // Personalidade estruturada (ver src/lib/agentPersonality.ts) -- null =
  // sem seleção, sem efeito extra no prompt (agentes criados antes disto).
  behavior_style: string | null;
  response_length: string | null;
  tone_style: string | null;
  emoji_usage: string | null;
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
      behavior_style?: string | null;
      response_length?: string | null;
      tone_style?: string | null;
      emoji_usage?: string | null;
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
      // Remove fields that don't exist in the DB table
      const { provider, model, ...dbUpdates } = updates as any;
      const { data, error } = await supabase
        .from('ai_agents')
        .update(dbUpdates as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Agentes criados pelo wizard de criação/template (ver apply-agent-template)
      // têm um fluxo+campanha já linkados via agent_instances -- sem isso, o
      // toggle aqui só desativava o agente, sem parar de fato os disparos da
      // campanha correspondente.
      if (typeof dbUpdates.is_active === 'boolean') {
        const { data: instances } = await (supabase as any)
          .from('agent_instances')
          .select('id, flow_id, campaign_id')
          .eq('ai_agent_id', id);
        for (const instance of (instances as any[]) || []) {
          // flows.is_active é um campo separado de campaigns.is_active -- sem
          // isso, desativar a orquestração aqui parava a campanha mas deixava
          // o fluxo "ativo" (ver conversa com o usuário).
          if (instance.flow_id) {
            await supabase.from('flows').update({ is_active: dbUpdates.is_active }).eq('id', instance.flow_id);
          }
          if (!instance.campaign_id) continue;
          await supabase.from('campaigns').update({ is_active: dbUpdates.is_active }).eq('id', instance.campaign_id);
          await (supabase as any).from('agent_instances').update({ status: dbUpdates.is_active ? 'active' : 'paused' }).eq('id', instance.id);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['flows'] });
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
