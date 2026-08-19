import { describe, expect, it, vi, beforeEach } from 'vitest';

// Cada chamada devolve uma "página" conforme o .range() pedido, imitando o
// comportamento do PostgREST: nunca mais que PAGE_SIZE linhas, e sem erro
// quando corta.
const state = {
  rows: [] as { id: string; contact_id: string; tag_id: string }[],
  calls: [] as { table: string; range: [number, number]; inFilter?: [string, string[]] }[],
};

const PAGE_CAP = 1000;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      let inFilter: [string, string[]] | undefined;
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        in: (column: string, values: string[]) => {
          inFilter = [column, values];
          return builder;
        },
        range: (from: number, to: number) => {
          state.calls.push({ table, range: [from, to], inFilter });
          let rows = state.rows;
          if (inFilter) {
            const [column, values] = inFilter;
            rows = rows.filter((r) => values.includes((r as never as Record<string, string>)[column]));
          }
          const size = Math.min(to - from + 1, PAGE_CAP);
          return Promise.resolve({ data: rows.slice(from, from + size), error: null });
        },
      };
      return builder;
    },
  },
}));

const { fetchAllContactTagLinks, fetchContactIdsByTags } = await import('@/lib/contactTagLinks');

const makeRows = (n: number, tagId = 'tag-a') =>
  Array.from({ length: n }, (_, i) => ({
    id: `row-${String(i).padStart(6, '0')}`,
    contact_id: `contact-${i}`,
    tag_id: tagId,
  }));

describe('contactTagLinks', () => {
  beforeEach(() => {
    state.rows = [];
    state.calls = [];
  });

  it('traz TODAS as ligações quando passa do teto de linhas do PostgREST', async () => {
    state.rows = makeRows(2350);

    const links = await fetchAllContactTagLinks();

    // O bug original: uma única página de 1000 e o resto sumia em silêncio.
    expect(links).toHaveLength(2350);
    expect(state.calls).toHaveLength(3);
  });

  it('para de paginar na primeira página curta', async () => {
    state.rows = makeRows(120);

    const links = await fetchAllContactTagLinks();

    expect(links).toHaveLength(120);
    expect(state.calls).toHaveLength(1);
  });

  it('devolve lista vazia sem ir ao banco quando não há tags', async () => {
    state.rows = makeRows(50);

    await expect(fetchContactIdsByTags([])).resolves.toEqual([]);
    expect(state.calls).toHaveLength(0);
  });

  it('deduplica contatos que têm mais de uma das tags pedidas', async () => {
    state.rows = [
      { id: 'r1', contact_id: 'c1', tag_id: 'tag-a' },
      { id: 'r2', contact_id: 'c1', tag_id: 'tag-b' },
      { id: 'r3', contact_id: 'c2', tag_id: 'tag-b' },
    ];

    const ids = await fetchContactIdsByTags(['tag-a', 'tag-b']);

    expect(ids.sort()).toEqual(['c1', 'c2']);
  });

  it('quebra a lista de tags em lotes para não estourar a URL do GET', async () => {
    state.rows = [];
    const tagIds = Array.from({ length: 450 }, (_, i) => `tag-${i}`);

    await fetchContactIdsByTags(tagIds);

    // 450 ids / 200 por lote = 3 requisições.
    expect(state.calls).toHaveLength(3);
    expect(state.calls[0].inFilter?.[1]).toHaveLength(200);
    expect(state.calls[2].inFilter?.[1]).toHaveLength(50);
  });
});
