import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from './useAuth';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

export function useFollowUpStatus() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const { selectedOrganizationId } = useWorkspaceContext();

  // Realtime: invalidate on flow_executions changes scoped to the current org.
  // O canal é único por org (recria ao trocar) e cobre as atualizações em tempo
  // real — o antigo refetchInterval de 30s foi removido por ser redundante.
  useEffect(() => {
    if (!selectedOrganizationId) return;

    const channel = createRealtimeChannel(`follow-up-status:${selectedOrganizationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'flow_executions',
        filter: `organization_id=eq.${selectedOrganizationId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['follow-up-status'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient, selectedOrganizationId]);

  return useQuery({
    queryKey: ['follow-up-status'],
    queryFn: async () => {
      // Get all active follow-ups (waiting_input)
      const { data, error } = await supabase
        .from('flow_executions')
        .select('conversation_id, remarketing_step, status, variables, current_node_id')
        .eq('status', 'waiting_input');

      if (error) throw error;

      const map: Record<string, { step: number; triggerMessageId?: string }> = {};
      (data || []).forEach((row) => {
        const vars = row.variables as Record<string, any> | null;
        const isChatFollowUp = vars?.source === 'chat_follow_up' || row.current_node_id === 'chat-follow-up';
        
        if (isChatFollowUp || row.remarketing_step > 0) {
          map[row.conversation_id] = {
            step: Math.max(row.remarketing_step, 1),
            triggerMessageId: vars?.triggerMessageId || undefined,
          };
        }
      });
      return map;
    },
    enabled: !!session,
  });
}
