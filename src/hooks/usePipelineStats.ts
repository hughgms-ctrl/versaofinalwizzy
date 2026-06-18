import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface PipelineStageCount {
  name: string;
  value: number;
  color: string;
  columnId: string;
}

export function usePipelineStageDistribution(pipelineId: string | null) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['pipeline-stage-distribution', profile?.organization_id, pipelineId],
    queryFn: async (): Promise<PipelineStageCount[]> => {
      if (!profile?.organization_id || !pipelineId) return [];

      // FASE 4 (4B): GROUP BY column_id na RPC (substitui colunas + positions +
      // contagem em memória). Isolamento por org derivado do pipeline na RPC.
      const { data, error } = await (supabase as any).rpc('get_pipeline_stage_distribution', {
        _pipeline_id: pipelineId,
      });
      if (error) throw error;

      return (data ?? []).map((r: any) => ({
        name: r.name,
        value: Number(r.value) || 0,
        color: r.color,
        columnId: r.columnId,
      })) as PipelineStageCount[];
    },
    enabled: !!profile?.organization_id && !!pipelineId,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
}

export function useTeamPerformanceByPipeline(pipelineId: string | null) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['team-performance-pipeline', profile?.organization_id, pipelineId],
    queryFn: async () => {
      if (!profile?.organization_id) return [];

      // FASE 4 (4B): GROUP BY assigned_to na RPC, com filtro opcional por pipeline
      // (substitui o loop de 1 count por membro). Já vem ordenado DESC.
      const { data, error } = await (supabase as any).rpc('get_team_performance', {
        _org: profile.organization_id,
        _workspace_id: null,
        _since: null,
        _until: null,
        _pipeline_id: pipelineId ?? null,
      });
      if (error) throw error;

      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        avatar_url: r.avatar_url,
        conversationsHandled: Number(r.conversationsHandled) || 0,
      }));
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
}
