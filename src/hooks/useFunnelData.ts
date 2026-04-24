import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { startOfDay, subDays, endOfDay } from 'date-fns';

export interface FunnelStageData {
  column_id: string;
  count: number;
}

export type FunnelPresetPeriod = 'today' | '7d' | '30d' | '90d';
export type FunnelPeriod = FunnelPresetPeriod | { from: string; to: string };

/**
 * Counts conversations that ENTERED each chosen column within the selected period.
 * Uses conversation_stage_history (every move into a column = 1 count).
 * Respects workspace filter (via contact tags), or counts org-wide if no workspace selected.
 */
export function useFunnelData(
  pipelineId: string | null,
  columnIds: string[],
  period: FunnelPeriod
) {
  const { profile } = useAuth();
  const { selectedWorkspaceId, workspaces } = useWorkspaceContext();

  const periodKey = typeof period === 'string' ? period : `custom:${period.from}:${period.to}`;

  return useQuery({
    queryKey: [
      'funnel-data',
      profile?.organization_id,
      selectedWorkspaceId,
      pipelineId,
      columnIds.join(','),
      periodKey,
    ],
    queryFn: async (): Promise<FunnelStageData[]> => {
      if (!profile?.organization_id || !pipelineId || columnIds.length === 0) {
        return columnIds.map((id) => ({ column_id: id, count: 0 }));
      }

      // Period → since/until ISO
      let since: string;
      let until: string | null = null;
      if (typeof period === 'string') {
        const daysMap: Record<FunnelPresetPeriod, number> = { today: 0, '7d': 7, '30d': 30, '90d': 90 };
        const days = daysMap[period] ?? 7;
        since = days === 0 ? startOfDay(new Date()).toISOString() : subDays(new Date(), days).toISOString();
      } else {
        since = startOfDay(new Date(period.from)).toISOString();
        until = endOfDay(new Date(period.to)).toISOString();
      }

      // Workspace filter: get allowed conversation IDs (or null = all)
      let allowedConvIds: string[] | null = null;
      if (selectedWorkspaceId) {
        const ws = workspaces.find((w: any) => w.id === selectedWorkspaceId);
        const tagIds: string[] = ws?.filter_tag_ids || [];
        if (tagIds.length === 0) {
          allowedConvIds = [];
        } else {
          const { data: contactTags } = await supabase
            .from('contact_tags')
            .select('contact_id')
            .in('tag_id', tagIds);
          const contactIds = [...new Set((contactTags || []).map((c: any) => c.contact_id))];
          if (contactIds.length === 0) {
            allowedConvIds = [];
          } else {
            const { data: convs } = await supabase
              .from('conversations')
              .select('id')
              .eq('organization_id', profile.organization_id)
              .in('contact_id', contactIds);
            allowedConvIds = (convs || []).map((c: any) => c.id);
          }
        }
      }

      if (allowedConvIds && allowedConvIds.length === 0) {
        return columnIds.map((id) => ({ column_id: id, count: 0 }));
      }

      // Query stage history for the chosen columns within period
      let query = (supabase as any)
        .from('conversation_stage_history')
        .select('to_column_id, conversation_id')
        .eq('organization_id', profile.organization_id)
        .eq('pipeline_id', pipelineId)
        .in('to_column_id', columnIds)
        .gte('created_at', since);

      if (until) query = query.lte('created_at', until);

      if (allowedConvIds) {
        query = query.in('conversation_id', allowedConvIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Count distinct conversations per column (a conversation that bounced
      // back and forth still counts only once per stage in the period)
      const seen: Record<string, Set<string>> = {};
      columnIds.forEach((cid) => (seen[cid] = new Set()));
      (data || []).forEach((row: any) => {
        if (seen[row.to_column_id]) seen[row.to_column_id].add(row.conversation_id);
      });

      return columnIds.map((id) => ({ column_id: id, count: seen[id]?.size || 0 }));
    },
    enabled: !!profile?.organization_id && !!pipelineId && columnIds.length > 0,
    refetchInterval: 60000,
  });
}
