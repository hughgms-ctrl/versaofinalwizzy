import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { normalizeWorkspaceId } from '@/lib/workspaceId';
import { toast } from './use-toast';

export interface FunnelConfig {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  pipeline_id: string;
  column_ids: string[];
}

/**
 * Fetches the funnel configuration for the current scope.
 * - If a workspace is selected → returns config for that workspace
 * - If "All workspaces" (selectedWorkspaceId === null) → returns the org-wide config (workspace_id IS NULL)
 */
export function useFunnelConfig() {
  const { profile } = useAuth();
  const { selectedWorkspaceId } = useWorkspaceContext();

  return useQuery({
    queryKey: ['funnel-config', profile?.organization_id, selectedWorkspaceId],
    queryFn: async (): Promise<FunnelConfig | null> => {
      if (!profile?.organization_id) return null;

      let query = (supabase as any)
        .from('workspace_funnel_configs')
        .select('*')
        .eq('organization_id', profile.organization_id);

      // 'unassigned' e sentinela de "Sem Workspace", nao um uuid: mandada ao
      // PostgREST derrubava a consulta inteira.
      const workspaceId = normalizeWorkspaceId(selectedWorkspaceId);
      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      } else {
        query = query.is('workspace_id', null);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data as FunnelConfig | null;
    },
    enabled: !!profile?.organization_id,
  });
}

export function useSaveFunnelConfig() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { selectedWorkspaceId } = useWorkspaceContext();

  return useMutation({
    mutationFn: async ({ pipeline_id, column_ids }: { pipeline_id: string; column_ids: string[] }) => {
      if (!profile?.organization_id) throw new Error('Sem organização');

      // Try update existing
      let existingQuery = (supabase as any)
        .from('workspace_funnel_configs')
        .select('id')
        .eq('organization_id', profile.organization_id);

      const workspaceId = normalizeWorkspaceId(selectedWorkspaceId);
      if (workspaceId) {
        existingQuery = existingQuery.eq('workspace_id', workspaceId);
      } else {
        existingQuery = existingQuery.is('workspace_id', null);
      }

      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        const { error } = await (supabase as any)
          .from('workspace_funnel_configs')
          .update({ pipeline_id, column_ids })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('workspace_funnel_configs')
          .insert({
            organization_id: profile.organization_id,
            workspace_id: workspaceId,
            pipeline_id,
            column_ids,
            created_by: profile.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funnel-config'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-data'] });
      toast({ title: 'Configuração do funil salva!' });
    },
    onError: (e: any) => {
      toast({ title: 'Erro ao salvar', description: e?.message, variant: 'destructive' });
    },
  });
}
