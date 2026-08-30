import { useQuery, useInfiniteQuery, useQueryClient, useMutation, QueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannel } from '@/lib/realtimeChannel';
import { useSharedRealtimeSubscription } from '@/lib/sharedRealtime';
import { useAuth } from './useAuth';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { withCountryCode } from '@/lib/phoneVariants';
import {
  ConversationListFilters,
  ConversationsCache,
  dedupeConversationsById,
  findCachedConversation,
  patchCachedConversation,
  removeCachedConversation,
  sortConversationsByRecency,
  upsertCachedConversation,
} from '@/lib/conversationsCache';

const CONVERSATION_LIST_LIMIT = 1000;

// Um unico lugar para a forma da linha: a busca pontual do realtime precisa
// devolver exatamente o mesmo shape da listagem, senao a linha hidratada entra
// no cache sem os joins e a lista pisca.
//
// `contact_presence` saiu do embed de proposito (B12): o indicador de
// "digitando..." agora vem do PresenceStore (useContactPresence), que ja mantem
// UM canal por organizacao. Enquanto o dado vinha no join, cada evento de
// presenca precisava invalidar a lista inteira para nao ficar velho.
const CONVERSATION_SELECT = `
  *,
  contact:contacts(id, name, phone, avatar_url, email, workspace_id, created_at, metadata),
  last_message:messages(id, content, type, direction, is_from_bot, read_at, delivered_at)
`;

export interface DbConversation {
  id: string;
  contact_id: string;
  organization_id: string;
  status: 'open' | 'pending' | 'resolved' | 'closed' | 'archived';
  unread_count: number;
  last_message_at: string | null;
  assigned_to: string | null;
  ai_agent_id: string | null;
  metadata: Record<string, any> | null;
  closed_at: string | null;
  workspace_id?: string | null;
  source_phone?: string | null;
  whatsapp_instance_id?: string | null;
  created_at: string;
  updated_at: string;
  contact: {
    id: string;
    name: string | null;
    phone: string;
    avatar_url: string | null;
    email: string | null;
    workspace_id?: string | null;
    created_at: string;
    metadata: { note?: string; description?: string } | null;
  } | null;
  last_message: {
    id: string;
    content: string | null;
    type: string;
    direction: 'inbound' | 'outbound';
    is_from_bot: boolean;
    read_at: string | null;
    delivered_at: string | null;
  }[] | null;
}

export interface DbProfile {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

export interface DbMessage {
  id: string;
  conversation_id: string;
  content: string | null;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location';
  direction: 'inbound' | 'outbound';
  is_from_bot: boolean;
  sent_by: string | null;
  created_at: string;
  read_at: string | null;
  delivered_at: string | null;
  media_url: string | null;
  zapi_message_id: string | null;
  failed_at: string | null;
  error_message: string | null;
  metadata?: any;
}

type ConversationsQueryRoot = 'conversations' | 'conversations-paginated';

/** Janela para agrupar as buscas pontuais das linhas que precisam dos joins. */
const HYDRATE_DEBOUNCE_MS = 600;

/**
 * Procura uma conversa nos caches da lista (paginada e completa) sem ir ao banco.
 * Usado pelas notificacoes (B11) para nao fazer um SELECT por mensagem recebida.
 */
export function findConversationInListCache(
  queryClient: QueryClient,
  conversationId: string
): DbConversation | null {
  const roots: ConversationsQueryRoot[] = ['conversations-paginated', 'conversations'];
  for (const root of roots) {
    for (const entry of queryClient.getQueryCache().findAll({ queryKey: [root] })) {
      const cached = queryClient.getQueryData<ConversationsCache<DbConversation>>(entry.queryKey);
      const hit = findCachedConversation(cached, conversationId);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Aplica um patch em uma conversa nos caches da lista (paginada e completa),
 * como o realtime faz. Serve para a acao local do usuario aparecer na hora —
 * marcar como lida, por exemplo — sem refazer a lista inteira.
 */
export function applyConversationPatch(
  queryClient: QueryClient,
  patch: Partial<DbConversation> & { id: string }
) {
  const roots: ConversationsQueryRoot[] = ['conversations-paginated', 'conversations'];
  for (const root of roots) {
    for (const entry of queryClient.getQueryCache().findAll({ queryKey: [root] })) {
      queryClient.setQueryData<ConversationsCache<DbConversation>>(entry.queryKey, (old) =>
        patchCachedConversation(old, patch, (entry.queryKey[1] as ConversationListFilters) ?? {})
      );
    }
  }
}

/**
 * B12 — realtime da lista de conversas sem invalidar a query.
 *
 * Um unico binding por organizacao. UPDATE vira patch no cache (as colunas do
 * payload por cima da linha que ja esta la, preservando `contact` e
 * `last_message`); so cai para a rede quem precisa dos joins:
 *
 *   - conversa nova (INSERT);
 *   - conversa que ainda nao esta carregada (fora das paginas em memoria);
 *   - `last_message_at` mudou, ou seja, o preview da lista ficou velho.
 *
 * Essas buscas sao agrupadas por HYDRATE_DEBOUNCE_MS e saem num `.in('id', ...)`
 * so — uma consulta pequena, nao a lista inteira.
 *
 * `contact_presence` nao e mais assinado aqui: era ele quem gerava a enxurrada
 * de refetches ("digitando..." a cada tecla do contato).
 */
function startConversationsSync(
  queryClient: QueryClient,
  organizationId: string,
  queryKeyRoot: ConversationsQueryRoot
): () => void {
  let cancelled = false;

  const listQueries = () => queryClient.getQueryCache().findAll({ queryKey: [queryKeyRoot] });
  const filtersOf = (queryKey: readonly unknown[]): ConversationListFilters =>
    (queryKey[1] as ConversationListFilters) ?? {};

  const patchEverywhere = (patch: Partial<DbConversation> & { id: string }) => {
    let previous: DbConversation | null = null;

    for (const entry of listQueries()) {
      const cached = queryClient.getQueryData<ConversationsCache<DbConversation>>(entry.queryKey);
      const hit = findCachedConversation(cached, patch.id);
      if (!hit) continue;
      previous = previous ?? hit;
      queryClient.setQueryData<ConversationsCache<DbConversation>>(entry.queryKey, (old) =>
        patchCachedConversation(old, patch, filtersOf(entry.queryKey))
      );
    }

    return previous;
  };

  const upsertEverywhere = (row: DbConversation) => {
    for (const entry of listQueries()) {
      queryClient.setQueryData<ConversationsCache<DbConversation>>(entry.queryKey, (old) =>
        upsertCachedConversation(old, row, filtersOf(entry.queryKey))
      );
    }
  };

  const removeEverywhere = (id: string) => {
    for (const entry of listQueries()) {
      queryClient.setQueryData<ConversationsCache<DbConversation>>(entry.queryKey, (old) =>
        removeCachedConversation(old, id)
      );
    }
  };

  const pendingIds = new Set<string>();
  let hydrateTimer: ReturnType<typeof setTimeout> | null = null;

  const hydrate = async () => {
    hydrateTimer = null;
    const ids = Array.from(pendingIds);
    pendingIds.clear();
    if (!ids.length || cancelled) return;

    const { data, error } = await supabase
      .from('conversations')
      .select(CONVERSATION_SELECT)
      .eq('organization_id', organizationId)
      .in('id', ids)
      .order('created_at', { referencedTable: 'messages', ascending: false })
      .limit(1, { referencedTable: 'messages' });

    if (cancelled || error || !data) return;
    for (const row of data as unknown as DbConversation[]) upsertEverywhere(row);
  };

  const scheduleHydrate = (id: string) => {
    pendingIds.add(id);
    if (!hydrateTimer) hydrateTimer = setTimeout(hydrate, HYDRATE_DEBOUNCE_MS);
  };

  const channel = createRealtimeChannel(`${queryKeyRoot}-realtime-${organizationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `organization_id=eq.${organizationId}`,
      },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          const removed = payload.old as { id?: string };
          if (removed?.id) removeEverywhere(removed.id);
          return;
        }

        const row = payload.new as (Partial<DbConversation> & { id?: string }) | null;
        if (!row?.id) return;

        if (payload.eventType === 'INSERT') {
          scheduleHydrate(row.id);
          return;
        }

        const previous = patchEverywhere(row as Partial<DbConversation> & { id: string });
        const previewChanged = previous?.last_message_at !== row.last_message_at;
        if (!previous || previewChanged) scheduleHydrate(row.id);
      }
    )
    .subscribe();

  return () => {
    cancelled = true;
    if (hydrateTimer) clearTimeout(hydrateTimer);
    supabase.removeChannel(channel);
  };
}

/**
 * Um canal por (organizacao x lista), independente de quantos componentes
 * montarem o hook. `useConversations` e montado tambem por dialogos e pelo
 * pipeline: sem o refcount, cada mensagem recebida viraria uma busca pontual
 * POR MONTAGEM — trocando a invalidacao antiga por um punhado de requisicoes.
 */
function useConversationsRealtimeSync(
  userId: string | undefined,
  organizationId: string | undefined,
  queryKeyRoot: ConversationsQueryRoot
) {
  const queryClient = useQueryClient();

  useSharedRealtimeSubscription(
    userId && organizationId ? `${queryKeyRoot}:${organizationId}` : null,
    () => startConversationsSync(queryClient, organizationId!, queryKeyRoot)
  );
}

const CONVERSATIONS_PAGE_SIZE = 100;

function buildConversationsPageQuery(
  organizationId: string,
  selectedWorkspaceId: string | null | undefined,
  opts: { includeArchived: boolean; onlyArchived: boolean; includeClosed: boolean; onlyClosed: boolean }
) {
  let query = supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .eq('organization_id', organizationId)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (opts.onlyArchived) {
    query = query.eq('status', 'archived');
  } else if (opts.onlyClosed) {
    query = query.eq('status', 'closed' as any);
  } else {
    if (!opts.includeArchived) query = query.neq('status', 'archived');
    if (!opts.includeClosed) query = query.neq('status', 'closed' as any);
  }

  if (selectedWorkspaceId) {
    if (selectedWorkspaceId === 'unassigned') {
      query = query.is('workspace_id', null);
    } else {
      query = query.eq('workspace_id', selectedWorkspaceId);
    }
  }

  return query;
}

export function useConversations(options?: { includeArchived?: boolean; onlyArchived?: boolean; includeClosed?: boolean; onlyClosed?: boolean }) {
  const { session, profile } = useAuth();
  const { selectedWorkspaceId } = useWorkspaceContext();
  const includeArchived = options?.includeArchived ?? false;
  const onlyArchived = options?.onlyArchived ?? false;
  const includeClosed = options?.includeClosed ?? false;
  const onlyClosed = options?.onlyClosed ?? false;

  const query = useQuery({
    queryKey: ['conversations', { includeArchived, onlyArchived, includeClosed, onlyClosed, selectedWorkspaceId, orgId: profile?.organization_id }],
    queryFn: async (): Promise<DbConversation[]> => {
      const { data, error } = await buildConversationsPageQuery(profile!.organization_id, selectedWorkspaceId, {
        includeArchived,
        onlyArchived,
        includeClosed,
        onlyClosed,
      })
        .range(0, CONVERSATION_LIST_LIMIT - 1)
        .order('created_at', { referencedTable: 'messages', ascending: false })
        .limit(1, { referencedTable: 'messages' });

      if (error) throw error;
      return (data || []) as unknown as DbConversation[];
    },
    enabled: !!session && !!profile?.organization_id,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000, // Poll every 30s as fallback when realtime fails
  });

  useConversationsRealtimeSync(session?.user?.id, profile?.organization_id, 'conversations');

  // A ordem vem do servidor, mas o patch do realtime muda `last_message_at` no
  // cache: reordenar na leitura e o que faz a conversa subir sem refetch.
  const conversations = useMemo(
    () => (query.data ? sortConversationsByRecency(query.data) : query.data),
    [query.data]
  );

  return { ...query, data: conversations };
}

// Paginated version of useConversations for the main inbox list: fetching
// all ~1000 conversations with embedded contact/last-message joins in one
// request took 4+ seconds. This fetches CONVERSATIONS_PAGE_SIZE at a time
// and grows via fetchNextPage(), so the inbox opens fast and only pulls
// more as the user scrolls. Kept separate from useConversations (used by
// Pipeline boards and dialogs, which need the full set for their own
// grouping/lookups) to avoid changing behavior there.
export function usePaginatedConversations(options?: { includeArchived?: boolean; onlyArchived?: boolean; includeClosed?: boolean; onlyClosed?: boolean }) {
  const { session, profile } = useAuth();
  const { selectedWorkspaceId } = useWorkspaceContext();
  const includeArchived = options?.includeArchived ?? false;
  const onlyArchived = options?.onlyArchived ?? false;
  const includeClosed = options?.includeClosed ?? false;
  const onlyClosed = options?.onlyClosed ?? false;

  const queryKey = ['conversations-paginated', { includeArchived, onlyArchived, includeClosed, onlyClosed, selectedWorkspaceId, orgId: profile?.organization_id }];

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }): Promise<DbConversation[]> => {
      const { data, error } = await buildConversationsPageQuery(profile!.organization_id, selectedWorkspaceId, {
        includeArchived,
        onlyArchived,
        includeClosed,
        onlyClosed,
      })
        .range(pageParam, pageParam + CONVERSATIONS_PAGE_SIZE - 1)
        .order('created_at', { referencedTable: 'messages', ascending: false })
        .limit(1, { referencedTable: 'messages' });

      if (error) throw error;
      return (data || []) as unknown as DbConversation[];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < CONVERSATIONS_PAGE_SIZE ? undefined : allPages.length * CONVERSATIONS_PAGE_SIZE,
    enabled: !!session && !!profile?.organization_id,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  useConversationsRealtimeSync(session?.user?.id, profile?.organization_id, 'conversations-paginated');

  // A linha hidratada pelo realtime entra na primeira pagina; a paginacao por
  // offset pode repeti-la enquanto a pagina seguinte nao e rebuscada.
  const conversations = useMemo(
    () => dedupeConversationsById(sortConversationsByRecency(query.data?.pages.flat() ?? [])),
    [query.data]
  );

  return {
    ...query,
    data: conversations,
  };
}


const MESSAGES_PAGE_SIZE = 50;

export function useMessages(conversationId: string | null) {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  // Paginação keyset por `created_at` (NUNCA offset). A página 0 traz as 50
  // mensagens mais novas; "carregar mais antigas" busca o lote anterior usando
  // o `created_at` da mensagem mais antiga já carregada como cursor.
  const query = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: async ({ pageParam }): Promise<DbMessage[]> => {
      if (!conversationId) return [];

      let q = supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PAGE_SIZE);

      // `.lte` (e não `.lt`) + dedup por id garante que mensagens com o MESMO
      // created_at (ex.: histórico sincronizado, que arredonda o timestamp para
      // segundos) não sejam puladas na borda da página.
      if (pageParam) {
        q = q.lte('created_at', pageParam);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as DbMessage[]; // página em ordem DESC (mais nova primeiro)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage, _allPages, lastPageParam): string | undefined => {
      // "Próxima página" = mensagens MAIS ANTIGAS no banco.
      if (lastPage.length < MESSAGES_PAGE_SIZE) return undefined;
      const oldest = lastPage[lastPage.length - 1].created_at;
      // Bloco de mesmo timestamp maior que a página: para de paginar para não
      // entrar em loop (o sync do WhatsApp cobre o histórico além disso).
      if (oldest === lastPageParam) return undefined;
      return oldest;
    },
    enabled: !!session && !!conversationId,
    staleTime: 0, // Always refetch on mount to catch missed realtime events
    refetchOnMount: 'always',
    refetchOnWindowFocus: true, // Refetch when tab regains focus
    refetchInterval: 15_000, // Poll every 15s as fallback when realtime fails
  });

  // Achata as páginas (cada uma DESC) em uma lista ASC dedupada por id.
  const messages = useMemo<DbMessage[]>(() => {
    const seen = new Set<string>();
    const out: DbMessage[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const m of page) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          out.push(m);
        }
      }
    }
    out.sort((a, b) => {
      if (a.created_at < b.created_at) return -1;
      if (a.created_at > b.created_at) return 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return out;
  }, [query.data]);

  // Realtime: atualiza o cache cirurgicamente (sem re-buscar a página inteira).
  // INSERT entra no topo da página mais nova; UPDATE corrige a mensagem por id.
  // DELETE continua via invalidate manual no chamador (o evento de DELETE não
  // chega pelo filtro sem REPLICA IDENTITY FULL).
  useEffect(() => {
    if (!session?.user?.id || !conversationId) return;

    const channel = createRealtimeChannel(`messages-realtime-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const incoming = payload.new as DbMessage;
          queryClient.setQueryData(['messages', conversationId], (old: any) => {
            if (!old?.pages?.length) return old; // sem cache ainda: deixa a query buscar
            const exists = old.pages.some((pg: DbMessage[]) => pg.some((m) => m.id === incoming.id));
            if (exists) return old;
            const pages = old.pages.slice();
            pages[0] = [incoming, ...pages[0]]; // página 0 = mais novas
            return { ...old, pages };
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const incoming = payload.new as DbMessage;
          queryClient.setQueryData(['messages', conversationId], (old: any) => {
            if (!old?.pages?.length) return old;
            const pages = old.pages.map((pg: DbMessage[]) =>
              pg.map((m) => (m.id === incoming.id ? { ...m, ...incoming } : m))
            );
            return { ...old, pages };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, conversationId, queryClient]);

  return {
    data: messages,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    fetchOlderFromDb: query.fetchNextPage,
    hasOlderInDb: query.hasNextPage,
    isFetchingOlderFromDb: query.isFetchingNextPage,
  };
}

export function useProfiles() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['profiles'],
    queryFn: async (): Promise<DbProfile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, avatar_url')
        .order('full_name', { ascending: true });

      if (error) throw error;
      return (data || []) as DbProfile[];
    },
    enabled: !!session,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  const { session, profile } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      phone?: string;
      contactId?: string;
      /** O telefone ja veio em E.164 (pais escolhido na tela): nao adivinhar. */
      phoneIsE164?: boolean;
      name?: string | null,
      workspaceId?: string | null,
    }) => {
      if (!profile?.organization_id) throw new Error('Organization ID is required');
      if (!data.contactId && !data.phone) throw new Error('Informe um contato ou um telefone');

      // Aqui saia um 55 na frente de TODO numero com 10 ou 11 digitos, o que
      // transformava celular estrangeiro em numero brasileiro inexistente
      // (+1 469 988 0705 virava 5514699880705, jid que nao existe no WhatsApp).
      // Com o pais escolhido na tela nao ha o que inferir; sem ele, o
      // withCountryCode preserva quem ja traz o codigo de outro pais.
      let formattedPhone = (data.phone || '').replace(/\D/g, '');
      if (formattedPhone && !data.phoneIsE164) {
        formattedPhone = withCountryCode(formattedPhone);
      }

      // 1. Check if contact exists. Quando o chamador já sabe qual é o contato
      // (atalho "Iniciar conversa" na agenda), buscamos pelo id: passar pelo
      // telefone re-normalizaria o número e corromperia contato estrangeiro.
      let contactId = null;
      let contactQuery = supabase
        .from('contacts')
        .select('id, workspace_id')
        .eq('organization_id', profile.organization_id);

      contactQuery = data.contactId
        ? contactQuery.eq('id', data.contactId)
        : contactQuery.eq('phone', formattedPhone);

      const { data: existingContact } = await contactQuery.limit(1).maybeSingle();

      if (!existingContact && data.contactId) {
        throw new Error('Contato não encontrado');
      }

      if (existingContact) {
        contactId = existingContact.id;
        const contactUpdates: Record<string, any> = {};
        if (data.name) contactUpdates.name = data.name;
        if (data.workspaceId && !(existingContact as any).workspace_id) contactUpdates.workspace_id = data.workspaceId;
        if (Object.keys(contactUpdates).length > 0) {
          await supabase.from('contacts').update(contactUpdates).eq('id', contactId);
        }
      } else {
        // 2. Create contact if doesn't exist
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            phone: formattedPhone,
            name: data.name ?? null,
            organization_id: profile.organization_id,
            workspace_id: data.workspaceId || null,
          } as any)
          .select()
          .single();

        if (contactError) throw new Error(`Erro ao criar contato: ${contactError.message}`);
        contactId = newContact.id;
      }

      // Regra "workspace = número": se o workspace escolhido atende um número,
      // a conversa nasce NESSE número. Pegar "a última instância conectada da
      // org" criava a conversa no número de outro workspace — ela caía no
      // workspace errado (ou, com a guarda no banco, sem workspace nenhum) e
      // ainda sairia pelo número errado.
      let workspaceInstanceId: string | null = null;
      if (data.workspaceId) {
        const { data: workspaceRow } = await supabase
          .from('workspaces')
          .select('whatsapp_instance_id')
          .eq('id', data.workspaceId)
          .maybeSingle();
        workspaceInstanceId = (workspaceRow as any)?.whatsapp_instance_id || null;
      }

      let instanceQuery = supabase
        .from('whatsapp_instances')
        .select('id, phone_number')
        .eq('organization_id', profile.organization_id);

      instanceQuery = workspaceInstanceId
        ? instanceQuery.eq('id', workspaceInstanceId)
        : instanceQuery.eq('status', 'connected').eq('is_active', true);

      const { data: activeInstance } = await instanceQuery
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 3. Check for an existing conversation for this exact company number.
      let existingConvQuery = supabase
        .from('conversations')
        .select('*, contact:contacts(*)')
        .eq('contact_id', contactId)
        .in('status', ['open', 'pending', 'closed'] as any);

      existingConvQuery = activeInstance?.id
        ? existingConvQuery.eq('whatsapp_instance_id', activeInstance.id)
        : existingConvQuery.is('whatsapp_instance_id', null);

      existingConvQuery = data.workspaceId
        ? existingConvQuery.eq('workspace_id', data.workspaceId)
        : existingConvQuery.is('workspace_id', null);

      const { data: existingConv } = await existingConvQuery.maybeSingle();

      if (existingConv) {
        if (data.workspaceId && !(existingConv as any).workspace_id) {
          await supabase
            .from('conversations')
            .update({ workspace_id: data.workspaceId } as any)
            .eq('id', existingConv.id);
          (existingConv as any).workspace_id = data.workspaceId;
        }
        return {
          conversation: { ...existingConv, last_message: [] } as unknown as DbConversation,
          isNew: false
        };
      }

      // 4. Create new conversation
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          contact_id: contactId,
          organization_id: profile.organization_id,
          status: 'open',
          service_mode: 'ativo', // Outbound feature starts as "ativo" generally
          unread_count: 0,
          workspace_id: data.workspaceId || null,
          whatsapp_instance_id: activeInstance?.id || null,
          source_phone: activeInstance?.phone_number || null,
        } as any)
        .select('*, contact:contacts(*)')
        .single();

      if (convError) throw new Error(`Erro ao criar conversa: ${convError.message}`);
      return {
        conversation: { ...newConv, last_message: [] } as unknown as DbConversation,
        isNew: true
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (error: any) => {
      // toast or error reporting can be handled where the hook is used
      throw error;
    }
  });
}
