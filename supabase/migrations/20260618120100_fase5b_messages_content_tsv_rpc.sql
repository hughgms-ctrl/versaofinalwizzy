-- =============================================================================
-- FASE 5 — 5B: Full-Text Search em messages (coluna + trigger + RPC)
-- =============================================================================
-- Substitui o `ILIKE '%termo%'` de useMessageSearch (seq scan na maior tabela,
-- a cada tecla) por FTS com tsvector + índice GIN, via RPC isolada por org.
--
-- ESTRATÉGIA B (coluna comum + trigger + backfill em lotes) em vez de
-- GENERATED ALWAYS ... STORED, para EVITAR LOCK LONGO: o GENERATED reescreveria
-- messages inteira sob ACCESS EXCLUSIVE (trava leitura E escrita) no momento do
-- ALTER. Aqui:
--   1) ADD COLUMN nullable (instantâneo, sem reescrita) — este arquivo.
--   2) Trigger mantém o tsvector de mensagens novas/editadas — este arquivo.
--   3) Backfill das linhas antigas em LOTES (rodado manualmente, ver bloco no
--      fim deste arquivo) — fora de transação, controlado pelo dono do projeto.
--   4) Índice GIN com CREATE INDEX CONCURRENTLY — arquivo SEPARADO
--      (20260618120200), aplicar DEPOIS do backfill.
--
-- ORDEM DE APLICAÇÃO:
--   (a) Este arquivo (coluna + trigger + RPC) — transacional.
--   (b) Backfill em lotes até retornar "UPDATE 0" (bloco comentado no fim).
--   (c) 20260618120200 (índice CONCURRENTLY) — NÃO transacional.
--
-- ISOLAMENTO POR CONTA (crítico): search_messages é SECURITY DEFINER (bypassa
-- RLS), portanto valida que o caller (auth.uid()) é membro da org via
-- user_is_org_member() — mesmo helper das RPCs da Fase 4. Filtra TODAS as linhas
-- por conversations.organization_id = _org (messages não tem organization_id;
-- o vínculo é messages.conversation_id -> conversations.organization_id).
-- Sem associação válida → RAISE EXCEPTION (42501). Nunca vaza entre contas.
-- GRANT EXECUTE só para authenticated.
--
-- IDENTIDADE DE CONVERSA = (contato + organização + whatsapp_instance_id):
-- a RPC retorna conversation_id (cada mensagem pertence a 1 conversa = 1
-- instância). Não deduplica por contato; um contato com 2 números aparece em
-- até 2 conversas distintas — idêntico ao comportamento atual do hook.
--
-- SNIPPET: retorna o `content` cru (sem ts_headline/<mark>). O frontend já faz
-- stripMarkdown + highlightTerm sozinho (ConversationList.tsx). Manter paridade.
--
-- DEPLOY: aplicar este arquivo MANUALMENTE no SQL Editor do Supabase. Transacional.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Coluna tsvector — nullable, sem default → ADD COLUMN instantâneo (catálogo
--    apenas, não reescreve linhas). Linhas antigas ficam NULL até o backfill.
-- -----------------------------------------------------------------------------
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS content_tsv tsvector;

-- -----------------------------------------------------------------------------
-- 2) Trigger — mantém content_tsv de TODA mensagem nova/editada. Entra ANTES do
--    backfill para não escapar nenhuma escrita durante o processo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.messages_content_tsv_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.content_tsv := to_tsvector('portuguese', coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_content_tsv ON public.messages;
CREATE TRIGGER trg_messages_content_tsv
  BEFORE INSERT OR UPDATE OF content ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.messages_content_tsv_update();

-- -----------------------------------------------------------------------------
-- 3) RPC search_messages — busca FTS isolada por org.
--    Retorna a mensagem mais recente que casa por conversa (DISTINCT ON), até
--    200 conversas, ordenadas pela mais recente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_messages(
  _org uuid,
  _q   text
)
RETURNS TABLE (
  conversation_id uuid,
  snippet         text,
  rank            real,
  created_at      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tsq tsquery;
BEGIN
  -- ISOLAMENTO: caller precisa ser membro da org solicitada
  IF NOT public.user_is_org_member((select auth.uid()), _org) THEN
    RAISE EXCEPTION 'access denied to organization %', _org USING ERRCODE = '42501';
  END IF;

  -- termo muito curto → vazio (paridade com o hook: mínimo 2 chars)
  IF _q IS NULL OR length(btrim(_q)) < 2 THEN
    RETURN;
  END IF;

  v_tsq := websearch_to_tsquery('portuguese', _q);

  -- query sem termos pesquisáveis (ex.: só stopwords) → vazio
  IF v_tsq IS NULL OR numnode(v_tsq) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT sub.conversation_id, sub.snippet, sub.rank, sub.created_at
  FROM (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id                       AS conversation_id,
      m.content                               AS snippet,
      ts_rank(m.content_tsv, v_tsq)           AS rank,
      m.created_at                            AS created_at
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE c.organization_id = _org
      AND m.content_tsv @@ v_tsq
    ORDER BY m.conversation_id, m.created_at DESC
  ) sub
  ORDER BY sub.created_at DESC
  LIMIT 200;
END;
$$;

-- GRANT — apenas usuários autenticados (busca exige login)
GRANT EXECUTE ON FUNCTION public.search_messages(uuid, text) TO authenticated;

COMMIT;

-- =============================================================================
-- BACKFILL (passo 3) — NÃO faz parte da transação acima.
-- Rodar este UPDATE REPETIDAMENTE no SQL Editor até retornar "UPDATE 0".
-- Cada execução trava só o lote (5.000 linhas) por instantes; o chat continua.
-- Pode parar e continuar depois — a trigger já cobre as mensagens novas.
-- =============================================================================
-- UPDATE public.messages
-- SET content_tsv = to_tsvector('portuguese', coalesce(content, ''))
-- WHERE id IN (
--   SELECT id FROM public.messages
--   WHERE content_tsv IS NULL
--   LIMIT 5000
-- );
--
-- Acompanhar o progresso (quantas faltam):
--   SELECT count(*) FILTER (WHERE content_tsv IS NULL) AS faltam,
--          count(*) AS total
--   FROM public.messages;
-- =============================================================================
