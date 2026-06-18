-- =============================================================================
-- FASE 5 — 5B: Índice GIN para a busca FTS (content_tsv)
-- =============================================================================
-- Índice que faz a busca usar Bitmap Index Scan em vez de Seq Scan.
--
-- CREATE INDEX CONCURRENTLY NÃO PODE rodar em bloco transacional — por isso este
-- arquivo é SEPARADO e NÃO tem BEGIN/COMMIT. Colar SOZINHO no SQL Editor.
--
-- ORDEM: aplicar DEPOIS do backfill (20260618120100, passo 3) estar completo
-- (SELECT count(*) FILTER (WHERE content_tsv IS NULL) = 0), para o índice já
-- nascer completo. CONCURRENTLY não bloqueia escritas durante a construção.
--
-- Se a sessão cair no meio, o índice pode ficar INVÁLIDO. Para refazer:
--   DROP INDEX IF EXISTS public.idx_messages_content_tsv;
--   (e rodar o CREATE INDEX CONCURRENTLY novamente)
--
-- DEPLOY: aplicar este arquivo MANUALMENTE no SQL Editor, isolado.
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_content_tsv
  ON public.messages USING gin (content_tsv);

-- Verificação:
--   SELECT indexname, indisvalid
--   FROM pg_indexes JOIN pg_class ON pg_class.relname = indexname
--   ... ou simplesmente:
--   \d+ public.messages   (no psql)  /  conferir em Database → Indexes no painel.
