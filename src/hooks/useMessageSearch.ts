import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useMessageSearch(searchQuery: string) {
  const { session } = useAuth();
  const trimmed = searchQuery.trim();

  return useQuery({
    queryKey: ['message-search', trimmed],
    queryFn: async (): Promise<Set<string>> => {
      if (!trimmed) return new Set();

      const { data, error } = await supabase
        .from('messages')
        .select('conversation_id')
        .ilike('content', `%${trimmed}%`)
        .limit(200);

      if (error) throw error;

      const ids = new Set<string>();
      (data || []).forEach(row => {
        if (row.conversation_id) ids.add(row.conversation_id);
      });
      return ids;
    },
    enabled: !!session && trimmed.length >= 2,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });
}
