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
      const { data, error } = await supabase
        .from('flow_executions')
        .select('conversation_id, remarketing_step, status')
        .eq('status', 'waiting_input')
        .gt('remarketing_step', 0);

      if (error) throw error;

      const map: Record<string, number> = {};
      (data || []).forEach((row) => {
        map[row.conversation_id] = row.remarketing_step;
      });
      return map;
    },
    enabled: !!session,
    refetchInterval: 30000,
  });
}
