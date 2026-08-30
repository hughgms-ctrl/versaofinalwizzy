import { supabase } from '@/integrations/supabase/client';
import { fetchAllPages } from '@/lib/fetchAllPages';

// Acesso em lote a contact_tags, a tabela de ligação contato↔tag.
//
// O PostgREST corta a resposta no teto de linhas do projeto (1000 por padrão) e
// devolve isso como SUCESSO. Um `.select()` sem paginação some com parte das
// ligações sem erro nenhum, e todo filtro por tag montado em cima passa a
// esconder card/contato em silêncio — que é exatamente o que acontecia no board
// do funil, na lista de conversas e na contagem do funil.
//
// contact_tags não tem organization_id (só contact_id e tag_id), então não há
// filtro de org a aplicar aqui: o escopo vem da RLS da tabela.

export interface ContactTagLink {
  contact_id: string;
  tag_id: string;
}

// Lote de ids por requisição. Os ids viajam na querystring de um GET, então um
// `.in()` com milhares de uuids monta uma URL grande demais.
const ID_CHUNK_SIZE = 200;


const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Todas as ligações contato↔tag visíveis para o usuário (escopo = RLS). */
export async function fetchAllContactTagLinks(): Promise<ContactTagLink[]> {
  return fetchAllPages<ContactTagLink>((from, to) =>
    supabase
      .from('contact_tags')
      .select('contact_id, tag_id')
      .order('id')
      .range(from, to),
  );
}

/** Ids de contato que têm ao menos uma das tags informadas, sem repetição. */
export async function fetchContactIdsByTags(tagIds: string[]): Promise<string[]> {
  if (tagIds.length === 0) return [];

  const batches = await Promise.all(
    chunk(tagIds, ID_CHUNK_SIZE).map((ids) =>
      fetchAllPages<{ contact_id: string }>((from, to) =>
        supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', ids)
          .order('id')
          .range(from, to),
      ),
    ),
  );

  return [...new Set(batches.flat().map((row) => row.contact_id))];
}
