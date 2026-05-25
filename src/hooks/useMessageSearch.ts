import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface MessageSearchResult {
  matchIds: Set<string>;
  snippets: Map<string, string>;
}

export function useMessageSearch(searchQuery: string) {
  const { session } = useAuth();
  const trimmed = searchQuery.trim();

  return useQuery({
    queryKey: ['message-search', trimmed],
    queryFn: async (): Promise<MessageSearchResult> => {
      if (!trimmed) return { matchIds: new Set(), snippets: new Map() };

      const { data, error } = await supabase
        .from('messages')
        .select('conversation_id, content')
        .ilike('content', `%${trimmed}%`)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const matchIds = new Set<string>();
      const snippets = new Map<string, string>();
      (data || []).forEach(row => {
        if (row.conversation_id) {
          matchIds.add(row.conversation_id);
          // Keep the first (most recent) matching snippet per conversation
          if (!snippets.has(row.conversation_id) && row.content) {
            snippets.set(row.conversation_id, row.content);
          }
        }
      });
      return { matchIds, snippets };
    },
    enabled: !!session && trimmed.length >= 2,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });
}
