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
      // Include both chat follow-ups (step 0) and flow remarketing (step > 0)
      const { data, error } = await supabase
        .from('flow_executions')
        .select('conversation_id, remarketing_step, status, variables, current_node_id')
        .eq('status', 'waiting_input');

      if (error) throw error;

      const map: Record<string, number> = {};
      (data || []).forEach((row) => {
        const vars = row.variables as Record<string, any> | null;
        const isChatFollowUp = vars?.source === 'chat_follow_up' || row.current_node_id === 'chat-follow-up';
        
        // Show badge for:
        // 1. Chat follow-ups at any step (including step 0)
        // 2. Flow remarketing only after step 0 (step > 0)
        if (isChatFollowUp || row.remarketing_step > 0) {
          map[row.conversation_id] = Math.max(row.remarketing_step, 1);
        }
      });
      return map;
    },
    enabled: !!session,
    refetchInterval: 30000,
  });
}
