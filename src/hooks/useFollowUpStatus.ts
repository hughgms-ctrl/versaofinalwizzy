import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useFollowUpStatus() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['follow-up-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flow_executions')
        .select('conversation_id, remarketing_step, current_node_id, status')
        .in('status', ['waiting_input'])
        .gt('remarketing_step', 0);

      if (error) throw error;
      
      // Map conversation_id -> remarketing_step for quick lookup
      const map: Record<string, number> = {};
      (data || []).forEach((row) => {
        map[row.conversation_id] = row.remarketing_step;
      });
      return map;
    },
    enabled: !!session,
    refetchInterval: 30000, // refresh every 30s
  });
}
