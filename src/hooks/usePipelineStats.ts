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

      // Get columns
      const { data: columns } = await supabase
        .from('pipeline_columns')
        .select('id, name, color, "order"')
        .eq('pipeline_id', pipelineId)
        .order('"order"', { ascending: true });

      if (!columns || columns.length === 0) return [];

      // Get positions for this pipeline
      const { data: positions } = await supabase
        .from('conversation_pipeline_positions')
        .select('column_id')
        .eq('pipeline_id', pipelineId);

      const countMap: Record<string, number> = {};
      (positions || []).forEach(p => {
        countMap[p.column_id] = (countMap[p.column_id] || 0) + 1;
      });

      return columns.map(col => ({
        name: col.name,
        value: countMap[col.id] || 0,
        color: col.color,
        columnId: col.id,
      }));
    },
    enabled: !!profile?.organization_id && !!pipelineId,
    refetchInterval: 30000,
  });
}

export function useTeamPerformanceByPipeline(pipelineId: string | null) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['team-performance-pipeline', profile?.organization_id, pipelineId],
    queryFn: async () => {
      if (!profile?.organization_id) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, avatar_url')
        .eq('organization_id', profile.organization_id);

      if (!profiles) return [];

      // Get conversation IDs filtered by pipeline
      let convIds: string[] | null = null;
      if (pipelineId) {
        const { data: positions } = await supabase
          .from('conversation_pipeline_positions')
          .select('conversation_id')
          .eq('pipeline_id', pipelineId);
        convIds = positions?.map(p => p.conversation_id) || [];
        if (convIds.length === 0) return [];
      }

      const result = [];
      for (const member of profiles) {
        let query = supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', profile.organization_id)
          .eq('assigned_to', member.user_id);

        if (convIds) query = query.in('id', convIds);

        const { count } = await query;

        if ((count || 0) > 0) {
          result.push({
            id: member.id,
            name: member.full_name,
            avatar_url: member.avatar_url,
            conversationsHandled: count || 0,
          });
        }
      }

      return result.sort((a, b) => b.conversationsHandled - a.conversationsHandled);
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 60000,
  });
}
