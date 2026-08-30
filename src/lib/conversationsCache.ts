/**
 * Cache da lista de conversas — B12 de docs/REVISAO_ESCALA_LANCAMENTO.md.
 *
 * Antes: QUALQUER evento de `conversations` (e de `contact_presence`, ou seja,
 * cada "digitando…") invalidava a query inteira. Com 3 joins e até 1000 linhas
 * isso dava ~40 refetches por minuto por usuário, cada um refazendo a lista toda.
 *
 * Agora o evento vira uma edição cirúrgica do cache: UPDATE mescla as colunas
 * que vieram no payload na linha que já está em memória (preservando `contact` e
 * `last_message`, que o realtime não manda), e só quem realmente precisa dos
 * joins — conversa nova, conversa que ainda não estava carregada, ou mensagem
 * nova que muda o preview — dispara uma busca pontual por id.
 *
 * As funções aqui são puras de propósito: aceitam tanto o cache do `useQuery`
 * (array) quanto o do `useInfiniteQuery` (`{ pages }`) e devolvem um novo objeto,
 * nunca mutando o antigo (o React Query compara por identidade).
 */

export interface ConversationCacheRow {
  id: string;
  status?: string | null;
  workspace_id?: string | null;
  last_message_at?: string | null;
}

/** Os filtros que vivem na queryKey da lista (`['conversations', { ... }]`). */
export interface ConversationListFilters {
  includeArchived?: boolean;
  onlyArchived?: boolean;
  includeClosed?: boolean;
  onlyClosed?: boolean;
  selectedWorkspaceId?: string | null;
}

export type PagedCache<T> = { pages: T[][]; pageParams: unknown[] };
export type ConversationsCache<T extends ConversationCacheRow> = T[] | PagedCache<T> | undefined | null;

function isPaged<T extends ConversationCacheRow>(cache: ConversationsCache<T>): cache is PagedCache<T> {
  return !!cache && !Array.isArray(cache) && Array.isArray((cache as PagedCache<T>).pages);
}

/** As "páginas" do cache: uma só quando é array simples. */
function buckets<T extends ConversationCacheRow>(cache: ConversationsCache<T>): T[][] {
  if (!cache) return [];
  if (Array.isArray(cache)) return [cache];
  if (isPaged(cache)) return cache.pages;
  return [];
}

function rebuild<T extends ConversationCacheRow>(
  cache: ConversationsCache<T>,
  next: T[][]
): ConversationsCache<T> {
  if (Array.isArray(cache)) return next[0] ?? [];
  if (isPaged(cache)) return { ...cache, pages: next };
  return cache;
}

/**
 * A linha ainda pertence a esta variação da lista? Um UPDATE pode arquivar,
 * fechar ou mover de workspace — patchear em silêncio deixaria a conversa
 * visível numa aba onde ela não deveria mais aparecer.
 */
export function conversationMatchesFilters<T extends ConversationCacheRow>(
  row: T,
  filters: ConversationListFilters
): boolean {
  const status = row.status ?? null;

  if (filters.onlyArchived) {
    if (status !== 'archived') return false;
  } else if (filters.onlyClosed) {
    if (status !== 'closed') return false;
  } else {
    if (!filters.includeArchived && status === 'archived') return false;
    if (!filters.includeClosed && status === 'closed') return false;
  }

  const workspaceId = filters.selectedWorkspaceId;
  if (workspaceId === 'unassigned') {
    if (row.workspace_id) return false;
  } else if (workspaceId) {
    if (row.workspace_id !== workspaceId) return false;
  }

  return true;
}

export function findCachedConversation<T extends ConversationCacheRow>(
  cache: ConversationsCache<T>,
  id: string
): T | null {
  for (const bucket of buckets(cache)) {
    const found = bucket.find((row) => row.id === id);
    if (found) return found;
  }
  return null;
}

export function removeCachedConversation<T extends ConversationCacheRow>(
  cache: ConversationsCache<T>,
  id: string
): ConversationsCache<T> {
  const current = buckets(cache);
  if (!current.length) return cache;

  let removed = false;
  const next = current.map((bucket) => {
    if (!bucket.some((row) => row.id === id)) return bucket;
    removed = true;
    return bucket.filter((row) => row.id !== id);
  });

  return removed ? rebuild(cache, next) : cache;
}

/**
 * Mescla as colunas que vieram no payload do realtime na linha em cache.
 * `patch` traz só as colunas de `conversations` — `contact` e `last_message`
 * (os joins) ficam com o valor que já estava lá. Se a linha deixar de bater com
 * os filtros da aba, ela sai do cache em vez de continuar visível.
 */
export function patchCachedConversation<T extends ConversationCacheRow>(
  cache: ConversationsCache<T>,
  patch: Partial<T> & { id: string },
  filters: ConversationListFilters
): ConversationsCache<T> {
  const existing = findCachedConversation(cache, patch.id);
  if (!existing) return cache;

  const merged = { ...existing, ...patch } as T;
  if (!conversationMatchesFilters(merged, filters)) {
    return removeCachedConversation(cache, patch.id);
  }

  const next = buckets(cache).map((bucket) =>
    bucket.some((row) => row.id === patch.id)
      ? bucket.map((row) => (row.id === patch.id ? merged : row))
      : bucket
  );

  return rebuild(cache, next);
}

/**
 * Linha completa (com os joins), vinda da busca pontual por id: substitui a que
 * estiver em cache ou entra na primeira página. Se não bate com os filtros da
 * aba, sai — é assim que uma conversa arquivada some da caixa de entrada.
 */
export function upsertCachedConversation<T extends ConversationCacheRow>(
  cache: ConversationsCache<T>,
  row: T,
  filters: ConversationListFilters
): ConversationsCache<T> {
  if (!cache) return cache;

  if (!conversationMatchesFilters(row, filters)) {
    return removeCachedConversation(cache, row.id);
  }

  const current = buckets(cache);
  if (!current.length) return cache;

  if (findCachedConversation(cache, row.id)) {
    const next = current.map((bucket) =>
      bucket.some((item) => item.id === row.id)
        ? bucket.map((item) => (item.id === row.id ? row : item))
        : bucket
    );
    return rebuild(cache, next);
  }

  const next = current.slice();
  next[0] = [row, ...(next[0] ?? [])];
  return rebuild(cache, next);
}

const timeOf = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Mesma ordem do servidor (`last_message_at desc nullsFirst: false`), aplicada
 * na leitura: sem isso a conversa patcheada ficaria parada no lugar antigo até
 * o próximo refetch.
 */
export function sortConversationsByRecency<T extends ConversationCacheRow>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    const at = timeOf(a.last_message_at);
    const bt = timeOf(b.last_message_at);
    if (at === null && bt === null) return 0;
    if (at === null) return 1;
    if (bt === null) return -1;
    return bt - at;
  });
}

/**
 * Paginação por offset com inserção ao vivo pode repetir uma linha entre páginas
 * (a conversa sobe para o topo enquanto a página seguinte é buscada).
 */
export function dedupeConversationsById<T extends ConversationCacheRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}
