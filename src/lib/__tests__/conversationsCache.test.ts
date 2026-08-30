import { describe, it, expect } from 'vitest';
import {
  conversationMatchesFilters,
  dedupeConversationsById,
  findCachedConversation,
  patchCachedConversation,
  removeCachedConversation,
  sortConversationsByRecency,
  upsertCachedConversation,
} from '../conversationsCache';

interface Row {
  id: string;
  status?: string | null;
  workspace_id?: string | null;
  last_message_at?: string | null;
  unread_count?: number;
  contact?: { name: string } | null;
}

const row = (id: string, extra: Partial<Row> = {}): Row => ({
  id,
  status: 'open',
  workspace_id: null,
  last_message_at: '2026-08-30T10:00:00Z',
  unread_count: 0,
  contact: { name: `contato ${id}` },
  ...extra,
});

const paged = (...pages: Row[][]) => ({ pages, pageParams: pages.map((_, i) => i * 100) });

describe('conversationMatchesFilters', () => {
  it('esconde arquivada e fechada por padrao', () => {
    expect(conversationMatchesFilters(row('a', { status: 'archived' }), {})).toBe(false);
    expect(conversationMatchesFilters(row('a', { status: 'closed' }), {})).toBe(false);
    expect(conversationMatchesFilters(row('a'), {})).toBe(true);
  });

  it('respeita as abas dedicadas', () => {
    expect(conversationMatchesFilters(row('a', { status: 'archived' }), { onlyArchived: true })).toBe(true);
    expect(conversationMatchesFilters(row('a'), { onlyArchived: true })).toBe(false);
    expect(conversationMatchesFilters(row('a', { status: 'closed' }), { onlyClosed: true })).toBe(true);
  });

  it('filtra por workspace, inclusive o sentinela "unassigned"', () => {
    expect(conversationMatchesFilters(row('a', { workspace_id: 'w1' }), { selectedWorkspaceId: 'w1' })).toBe(true);
    expect(conversationMatchesFilters(row('a', { workspace_id: 'w2' }), { selectedWorkspaceId: 'w1' })).toBe(false);
    expect(conversationMatchesFilters(row('a', { workspace_id: null }), { selectedWorkspaceId: 'unassigned' })).toBe(true);
    expect(conversationMatchesFilters(row('a', { workspace_id: 'w1' }), { selectedWorkspaceId: 'unassigned' })).toBe(false);
  });
});

describe('patchCachedConversation', () => {
  it('preserva os joins que o realtime nao manda', () => {
    const cache = [row('a'), row('b')];
    const next = patchCachedConversation(cache, { id: 'a', unread_count: 3 }, {}) as Row[];

    expect(next[0].unread_count).toBe(3);
    expect(next[0].contact).toEqual({ name: 'contato a' });
    expect(next).not.toBe(cache);
    expect(cache[0].unread_count).toBe(0); // nao mutou o cache antigo
  });

  it('acha e patcheia numa pagina do meio', () => {
    const cache = paged([row('a')], [row('b')]);
    const next = patchCachedConversation(cache, { id: 'b', unread_count: 7 }, {}) as ReturnType<typeof paged>;

    expect(next.pages[1][0].unread_count).toBe(7);
    expect(next.pages[0]).toBe(cache.pages[0]); // pagina intocada mantem identidade
  });

  it('tira do cache a conversa que deixou de bater com o filtro', () => {
    const cache = [row('a'), row('b')];
    const next = patchCachedConversation(cache, { id: 'a', status: 'archived' }, {}) as Row[];

    expect(next.map((r) => r.id)).toEqual(['b']);
  });

  it('ignora conversa que nao esta carregada', () => {
    const cache = [row('a')];
    expect(patchCachedConversation(cache, { id: 'z', unread_count: 1 }, {})).toBe(cache);
  });
});

describe('upsertCachedConversation', () => {
  it('insere a conversa nova na primeira pagina', () => {
    const cache = paged([row('a')], [row('b')]);
    const next = upsertCachedConversation(cache, row('c'), {}) as ReturnType<typeof paged>;

    expect(next.pages[0].map((r) => r.id)).toEqual(['c', 'a']);
    expect(next.pages[1].map((r) => r.id)).toEqual(['b']);
  });

  it('substitui no lugar quando ja existe', () => {
    const cache = paged([row('a')], [row('b')]);
    const next = upsertCachedConversation(cache, row('b', { unread_count: 9 }), {}) as ReturnType<typeof paged>;

    expect(next.pages[0].map((r) => r.id)).toEqual(['a']);
    expect(next.pages[1][0].unread_count).toBe(9);
  });

  it('nao insere quem nao bate com o filtro da aba', () => {
    const cache = paged([row('a')]);
    const next = upsertCachedConversation(cache, row('c', { status: 'archived' }), {}) as ReturnType<typeof paged>;

    expect(next.pages[0].map((r) => r.id)).toEqual(['a']);
  });
});

describe('removeCachedConversation / findCachedConversation', () => {
  it('remove por id em qualquer pagina', () => {
    const cache = paged([row('a')], [row('b')]);
    const next = removeCachedConversation(cache, 'b') as ReturnType<typeof paged>;

    expect(next.pages[1]).toEqual([]);
    expect(findCachedConversation(next, 'b')).toBeNull();
    expect(findCachedConversation(next, 'a')?.id).toBe('a');
  });

  it('devolve o mesmo cache quando nao ha o que remover', () => {
    const cache = paged([row('a')]);
    expect(removeCachedConversation(cache, 'z')).toBe(cache);
  });
});

describe('sortConversationsByRecency', () => {
  it('mais recente primeiro, sem data por ultimo', () => {
    const rows = [
      row('antiga', { last_message_at: '2026-08-01T10:00:00Z' }),
      row('sem-data', { last_message_at: null }),
      row('nova', { last_message_at: '2026-08-30T10:00:00Z' }),
    ];

    expect(sortConversationsByRecency(rows).map((r) => r.id)).toEqual(['nova', 'antiga', 'sem-data']);
  });
});

describe('dedupeConversationsById', () => {
  it('mantem a primeira ocorrencia', () => {
    const rows = [row('a', { unread_count: 1 }), row('b'), row('a', { unread_count: 0 })];
    const out = dedupeConversationsById(rows);

    expect(out.map((r) => r.id)).toEqual(['a', 'b']);
    expect(out[0].unread_count).toBe(1);
  });
});
