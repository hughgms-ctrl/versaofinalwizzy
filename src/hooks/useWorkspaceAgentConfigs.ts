import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface WorkspaceAgentConfig {
  id: string;
  workspace_id: string;
  organization_id: string;
  agent_ids: string[];
  master_prompt_id: string | null;
  ai_provider: string;
  ai_model: string;
  created_at: string;
  updated_at: string;
}

export function useWorkspaceAgentConfigs() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['workspace-agent-configs'],
    queryFn: async (): Promise<WorkspaceAgentConfig[]> => {
      const { data, error } = await supabase
        .from('workspace_agent_configs' as any)
        .select('*')
        .order('created_at');

      if (error) throw error;
      return (data || []) as unknown as WorkspaceAgentConfig[];
    },
    enabled: !!session,
  });
}

export function useUpsertWorkspaceAgentConfig() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (config: {
      workspace_id: string;
      agent_ids: string[];
      master_prompt_id: string | null;
      ai_provider?: string;
      ai_model?: string;
    }) => {
      if (!profile?.organization_id) throw new Error('No organization');
      const { data, error } = await supabase
        .from('workspace_agent_configs' as any)
        .upsert({
          ...config,
          organization_id: profile.organization_id,
        }, { onConflict: 'workspace_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-agent-configs'] });
      toast({ title: 'Configuração do workspace atualizada' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao salvar configuração', description: error.message, variant: 'destructive' });
    },
  });
}
