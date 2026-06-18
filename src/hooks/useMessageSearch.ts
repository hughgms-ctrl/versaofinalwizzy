import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

export interface MessageSearchResult {
  matchIds: Set<string>;
  snippets: Map<string, string>;
}

interface SearchMessagesRow {
  conversation_id: string | null;
  snippet: string | null;
  rank: number | null;
  created_at: string | null;
}

const EMPTY: MessageSearchResult = { matchIds: new Set(), snippets: new Map() };

export function useMessageSearch(searchQuery: string) {
  const { session, profile } = useAuth();
  const { selectedOrganizationId } = useWorkspaceContext();
  const organizationId = selectedOrganizationId || profile?.organization_id || null;

  // FASE 5 (5B): debounce de 300ms — evita disparar a busca a cada tecla.
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const trimmed = debouncedQuery.trim();

  return useQuery({
    queryKey: ['message-search', organizationId, trimmed],
    queryFn: async (): Promise<MessageSearchResult> => {
      if (!trimmed || !organizationId) return EMPTY;

      // FASE 5 (5B): FTS via RPC (tsvector + GIN) com isolamento por org no
      // servidor, substitui o ILIKE '%termo%' (seq scan na maior tabela).
      const { data, error } = await (supabase as any).rpc('search_messages', {
        _org: organizationId,
        _q: trimmed,
      });
      if (error) throw error;

      const matchIds = new Set<string>();
      const snippets = new Map<string, string>();
      ((data as SearchMessagesRow[]) || []).forEach(row => {
        if (row.conversation_id) {
          matchIds.add(row.conversation_id);
          // A RPC já retorna 1 linha por conversa (a mais recente que casa).
          if (!snippets.has(row.conversation_id) && row.snippet) {
            snippets.set(row.conversation_id, row.snippet);
          }
        }
      });
      return { matchIds, snippets };
    },
    enabled: !!session && !!organizationId && trimmed.length >= 2,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });
}
