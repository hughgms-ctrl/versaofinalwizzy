import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface StageHistoryEntry {
  id: string;
  conversation_id: string;
  pipeline_id: string;
  from_column_id: string | null;
  to_column_id: string;
  changed_by_type: string;
  changed_by: string | null;
  created_at: string;
  organization_id: string;
  // Joined data
  from_column?: { name: string; color: string } | null;
  to_column?: { name: string; color: string } | null;
  changed_by_profile?: { full_name: string } | null;
}

export function useStageHistory(conversationId: string | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['stage-history', conversationId],
    queryFn: async (): Promise<StageHistoryEntry[]> => {
      if (!conversationId) return [];

      const { data, error } = await (supabase as any)
        .from('conversation_stage_history')
        .select(`
          *,
          from_column:pipeline_columns!conversation_stage_history_from_column_id_fkey(name, color),
          to_column:pipeline_columns!conversation_stage_history_to_column_id_fkey(name, color),
          changed_by_profile:profiles!conversation_stage_history_changed_by_fkey(full_name)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        // Fallback without joins if FK names don't match
        const { data: fallback, error: err2 } = await (supabase as any)
          .from('conversation_stage_history')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (err2) throw err2;
        return (fallback || []) as StageHistoryEntry[];
      }

      return (data || []) as StageHistoryEntry[];
    },
    enabled: !!session && !!conversationId,
  });
}

export function useLogStageChange() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      pipelineId,
      fromColumnId,
      toColumnId,
      changedByType = 'manual',
      changedBy,
      organizationId,
    }: {
      conversationId: string;
      pipelineId: string;
      fromColumnId: string | null;
      toColumnId: string;
      changedByType?: string;
      changedBy?: string | null;
      organizationId: string;
    }) => {
      const { error } = await (supabase as any)
        .from('conversation_stage_history')
        .insert({
          conversation_id: conversationId,
          pipeline_id: pipelineId,
          from_column_id: fromColumnId,
          to_column_id: toColumnId,
          changed_by_type: changedByType,
          changed_by: changedBy,
          organization_id: organizationId,
        });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stage-history', variables.conversationId] });
    },
  });
}

export function useStageNotifications(pipelineId: string | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['stage-notifications', pipelineId],
    queryFn: async () => {
      if (!pipelineId) return [];

      const { data, error } = await (supabase as any)
        .from('stage_notifications')
        .select('*')
        .eq('pipeline_id', pipelineId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!session && !!pipelineId,
  });
}

export function useUpsertStageNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pipelineId,
      columnId,
      workspaceId,
      notifyUserIds,
      messageTemplate,
      isActive,
      organizationId,
    }: {
      pipelineId: string;
      columnId: string;
      workspaceId?: string | null;
      notifyUserIds: string[];
      messageTemplate?: string;
      isActive: boolean;
      organizationId: string;
    }) => {
      // Manual upsert: PostgREST cannot use partial unique indexes for ON CONFLICT
      const { data: existing } = await (supabase as any)
        .from('stage_notifications')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .eq('column_id', columnId)
        .is('workspace_id', workspaceId ?? null as any);

      // Workaround: PostgREST .is() requires literal null; for non-null compare via .eq
      let existingRow: any = null;
      if (workspaceId) {
        const { data } = await (supabase as any)
          .from('stage_notifications')
          .select('id')
          .eq('pipeline_id', pipelineId)
          .eq('column_id', columnId)
          .eq('workspace_id', workspaceId)
          .maybeSingle();
        existingRow = data;
      } else {
        const { data } = await (supabase as any)
          .from('stage_notifications')
          .select('id')
          .eq('pipeline_id', pipelineId)
          .eq('column_id', columnId)
          .is('workspace_id', null)
          .maybeSingle();
        existingRow = data;
      }

      const payload = {
        pipeline_id: pipelineId,
        column_id: columnId,
        workspace_id: workspaceId || null,
        notify_user_ids: notifyUserIds,
        message_template: messageTemplate || null,
        is_active: isActive,
        organization_id: organizationId,
      };

      if (existingRow?.id) {
        const { error } = await (supabase as any)
          .from('stage_notifications')
          .update(payload)
          .eq('id', existingRow.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('stage_notifications')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stage-notifications', variables.pipelineId] });
    },
  });
}
