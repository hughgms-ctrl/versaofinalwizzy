// Paginacao de SELECT do PostgREST.
//
// O PostgREST corta a resposta no teto de linhas do projeto (1000 por padrao) e
// devolve isso como SUCESSO: um `.select()` sem paginacao some com parte dos
// dados sem erro nenhum, e tudo que e montado em cima passa a esconder linha em
// silencio.
//
// O `.order()` deterministico no `build` nao e enfeite: sem ordem estavel o
// banco pode devolver as linhas em ordens diferentes entre as paginas, e ai o
// `.range()` repete umas e pula outras.

/** Tamanho da pagina, igual ao teto do PostgREST: pagina curta encerra a varredura. */
export const POSTGREST_PAGE_SIZE = 1000;

export async function fetchAllPages<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += POSTGREST_PAGE_SIZE) {
    const { data, error } = await build(from, from + POSTGREST_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data || [];
    rows.push(...page);
    if (page.length < POSTGREST_PAGE_SIZE) return rows;
  }
}
