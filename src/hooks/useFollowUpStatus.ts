import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useFollowUpStatus() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  // Realtime: invalidate on any flow_executions change
  useEffect(() => {
    const channel = supabase
      .channel('follow-up-status')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'flow_executions',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['follow-up-status'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

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
    refetchInterval: 30000,
  });
}
