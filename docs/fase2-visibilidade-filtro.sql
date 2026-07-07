-- ============================================================================
-- FASE 2 — LIGAR O FILTRO no back-end. É AQUI que as conversas escondidas
-- (hidden_by_disconnect = true) deixam de chegar ao front.
-- ----------------------------------------------------------------------------
--   1) RLS RESTRITIVA em conversations (SELECT) → cobre TODA leitura autenticada
--      via PostgREST (lista de chats, pipeline, contatos, contagens diretas).
--      service_role (webhook/edge) fura RLS e continua vendo tudo (readoção ok).
--   2) Filtro DENTRO das RPCs SECURITY DEFINER (furam RLS): get_dashboard_metrics,
--      get_team_performance, get_pipeline_stage_distribution, search_messages.
--
-- Pré-requisito: FASE 1 aplicada (coluna hidden_by_disconnect + trigger + PASSO 6
-- conferido). Só ligue depois de validar as contagens.
-- Reversível: DROP da policy + reaplicar as RPCs das migrations originais.
-- Aplicação: MANUAL no SQL Editor do Supabase. Transacional.
-- ============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) RLS RESTRITIVA — o "não chega no front" geral.
--    Restritiva = AND com as políticas permissivas existentes (só restringe,
--    nunca concede). Autenticado só enxerga conversa visível.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS conversations_hide_disconnected ON public.conversations;
CREATE POLICY conversations_hide_disconnected
  ON public.conversations
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (hidden_by_disconnect = false);

-- -----------------------------------------------------------------------------
-- 2a) get_dashboard_metrics — + AND NOT c.hidden_by_disconnect nas 4 contagens
--     de conversa e no JOIN de mensagens.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  _org uuid,
  _workspace_id uuid DEFAULT NULL,
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversations_today bigint;
  v_closed              bigint;
  v_archived            bigint;
  v_open                bigint;
  v_total_messages      bigint;
  v_ai_messages         bigint;
  v_ai_pct              int;
BEGIN
  IF NOT public.user_is_org_member((select auth.uid()), _org) THEN
    RAISE EXCEPTION 'access denied to organization %', _org USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_conversations_today
  FROM public.conversations c
  WHERE c.organization_id = _org
    AND NOT c.hidden_by_disconnect
    AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id)
    AND (_since IS NULL OR c.last_message_at >= _since)
    AND (_until IS NULL OR c.last_message_at <= _until);

  SELECT count(*) INTO v_closed
  FROM public.conversations c
  WHERE c.organization_id = _org
    AND NOT c.hidden_by_disconnect
    AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id)
    AND c.status = 'closed'
    AND (_since IS NULL OR c.closed_at >= _since)
    AND (_until IS NULL OR c.closed_at <= _until);

  SELECT count(*) INTO v_archived
  FROM public.conversations c
  WHERE c.organization_id = _org
    AND NOT c.hidden_by_disconnect
    AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id)
    AND c.status = 'archived'
    AND (_since IS NULL OR c.updated_at >= _since)
    AND (_until IS NULL OR c.updated_at <= _until);

  SELECT count(*) INTO v_open
  FROM public.conversations c
  WHERE c.organization_id = _org
    AND NOT c.hidden_by_disconnect
    AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id)
    AND c.status <> 'archived'
    AND c.status <> 'closed'
    AND c.closed_at IS NULL
    AND (
      SELECT m.direction
      FROM public.messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ) = 'inbound';

  SELECT
    count(*),
    count(*) FILTER (WHERE m.is_from_bot)
  INTO v_total_messages, v_ai_messages
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE c.organization_id = _org
    AND NOT c.hidden_by_disconnect
    AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id)
    AND (_since IS NULL OR m.created_at >= _since)
    AND (_until IS NULL OR m.created_at <= _until);

  v_ai_pct := CASE
    WHEN COALESCE(v_total_messages, 0) > 0
    THEN round((v_ai_messages::numeric / v_total_messages) * 100)::int
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'conversationsToday',  COALESCE(v_conversations_today, 0),
    'resolvedToday',       COALESCE(v_closed, 0) + COALESCE(v_archived, 0),
    'totalMessages',       COALESCE(v_total_messages, 0),
    'avgResponseTime',     0,
    'aiHandledPercentage', COALESCE(v_ai_pct, 0),
    'openConversations',   COALESCE(v_open, 0)
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2b) get_team_performance — + AND NOT c.hidden_by_disconnect no per_user.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_team_performance(
  _org uuid,
  _workspace_id uuid DEFAULT NULL,
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL,
  _pipeline_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id                    uuid,
  name                  text,
  avatar_url            text,
  "conversationsHandled" bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.user_is_org_member((select auth.uid()), _org) THEN
    RAISE EXCEPTION 'access denied to organization %', _org USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH per_user AS (
    SELECT c.assigned_to AS user_id, count(*) AS handled
    FROM public.conversations c
    WHERE c.organization_id = _org
      AND NOT c.hidden_by_disconnect
      AND c.assigned_to IS NOT NULL
      AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id)
      AND (_since IS NULL OR c.created_at >= _since)
      AND (_until IS NULL OR c.created_at <= _until)
      AND (
        _pipeline_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.conversation_pipeline_positions cpp
          WHERE cpp.conversation_id = c.id
            AND cpp.pipeline_id = _pipeline_id
        )
      )
    GROUP BY c.assigned_to
  )
  SELECT p.id, p.full_name, p.avatar_url, pu.handled
  FROM public.profiles p
  JOIN per_user pu ON pu.user_id = p.user_id
  WHERE p.organization_id = _org
    AND pu.handled > 0
  ORDER BY pu.handled DESC;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2c) get_pipeline_stage_distribution — exclui posições de conversa escondida.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pipeline_stage_distribution(
  _pipeline_id uuid
)
RETURNS TABLE (
  "columnId" uuid,
  name       text,
  color      text,
  value      bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pipelines p
  WHERE p.id = _pipeline_id;

  IF v_org IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.user_is_org_member((select auth.uid()), v_org) THEN
    RAISE EXCEPTION 'access denied to pipeline %', _pipeline_id USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    pc.id,
    pc.name,
    pc.color,
    COALESCE(cnt.value, 0)::bigint
  FROM public.pipeline_columns pc
  LEFT JOIN (
    SELECT cpp.column_id, count(*) AS value
    FROM public.conversation_pipeline_positions cpp
    JOIN public.conversations c
      ON c.id = cpp.conversation_id AND NOT c.hidden_by_disconnect
    WHERE cpp.pipeline_id = _pipeline_id
    GROUP BY cpp.column_id
  ) cnt ON cnt.column_id = pc.id
  WHERE pc.pipeline_id = _pipeline_id
  ORDER BY pc."order" ASC;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2d) search_messages — + AND NOT c.hidden_by_disconnect.
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
  IF NOT public.user_is_org_member((select auth.uid()), _org) THEN
    RAISE EXCEPTION 'access denied to organization %', _org USING ERRCODE = '42501';
  END IF;

  IF _q IS NULL OR length(btrim(_q)) < 2 THEN
    RETURN;
  END IF;

  v_tsq := websearch_to_tsquery('portuguese', _q);

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
      AND NOT c.hidden_by_disconnect
      AND m.content_tsv @@ v_tsq
    ORDER BY m.conversation_id, m.created_at DESC
  ) sub
  ORDER BY sub.created_at DESC
  LIMIT 200;
END;
$$;

COMMIT;

-- ============================================================================
-- VALIDAÇÃO (rode como usuário logado no app, não no SQL Editor com service_role):
--   • Org a0a518a0 (número removido) → lista de conversas deve ficar VAZIA.
--   • Org principal → some as 7 vazias; o resto continua.
--   • Reconectar o número da a0a518a0 → as 10 devem VOLTAR (readoção no connect).
--     (a readoção robusta no reconnect é a Fase 3.)
-- ROLLBACK rápido se algo parecer errado:
--   DROP POLICY IF EXISTS conversations_hide_disconnected ON public.conversations;
-- ============================================================================
