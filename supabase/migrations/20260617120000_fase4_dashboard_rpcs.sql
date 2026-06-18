-- =============================================================================
-- FASE 4 — 4A: RPCs server-side do Dashboard
-- =============================================================================
-- Substitui o N+1 dos hooks useDashboardData.ts / usePipelineStats.ts por
-- agregação no servidor.
--
-- ISOLAMENTO POR CONTA (crítico): todas as funções são SECURITY DEFINER (bypassam
-- RLS para agregar com eficiência), portanto cada uma valida que o caller
-- (auth.uid()) é membro da organização solicitada via user_is_org_member() —
-- mesmo helper usado pelas políticas RLS (lê organization_members, multi-org).
-- Sem associação válida → RAISE EXCEPTION (42501). Nunca vaza entre contas.
--
-- IDENTIDADE DE CONVERSA = (contato + organização + whatsapp_instance_id):
-- todas as contagens contam CONVERSAS (linhas de public.conversations), nunca
-- deduplicam por contato. Um contato com 2 números = 2 conversas = contadas
-- separadamente — idêntico ao comportamento atual dos hooks.
--
-- DEPLOY: aplicar este arquivo MANUALMENTE no SQL Editor do Supabase
-- (regra do projeto: NÃO usar `supabase db push`). Transacional (roda inteiro).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) get_dashboard_metrics — substitui useDashboardMetrics (:107-213)
--    Retorna todos os números num único JSON.
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
  -- ISOLAMENTO: caller precisa ser membro da org solicitada
  IF NOT public.user_is_org_member((select auth.uid()), _org) THEN
    RAISE EXCEPTION 'access denied to organization %', _org USING ERRCODE = '42501';
  END IF;

  -- conversas com atividade no período (last_message_at no range)
  SELECT count(*) INTO v_conversations_today
  FROM public.conversations c
  WHERE c.organization_id = _org
    AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id)
    AND (_since IS NULL OR c.last_message_at >= _since)
    AND (_until IS NULL OR c.last_message_at <= _until);

  -- encerradas no período (status closed + closed_at no range)
  SELECT count(*) INTO v_closed
  FROM public.conversations c
  WHERE c.organization_id = _org
    AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id)
    AND c.status = 'closed'
    AND (_since IS NULL OR c.closed_at >= _since)
    AND (_until IS NULL OR c.closed_at <= _until);

  -- arquivadas no período (status archived + updated_at no range)
  SELECT count(*) INTO v_archived
  FROM public.conversations c
  WHERE c.organization_id = _org
    AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id)
    AND c.status = 'archived'
    AND (_since IS NULL OR c.updated_at >= _since)
    AND (_until IS NULL OR c.updated_at <= _until);

  -- abertas: snapshot ATUAL (sem filtro de período) — ativas cuja última
  -- mensagem é inbound (aguardando resposta da empresa)
  SELECT count(*) INTO v_open
  FROM public.conversations c
  WHERE c.organization_id = _org
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

  -- mensagens no período (apenas das conversas da org/ws)
  SELECT
    count(*),
    count(*) FILTER (WHERE m.is_from_bot)
  INTO v_total_messages, v_ai_messages
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE c.organization_id = _org
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
-- 2) get_team_performance — substitui os loops N+1 por GROUP BY assigned_to:
--      - useReportsAgentPerformance (useDashboardData.ts :789-849) — filtra por created_at
--      - useTeamPerformanceByPipeline (usePipelineStats.ts :52-105) — filtra por pipeline
--    Conta CONVERSAS distintas atribuídas (assigned_to) por membro.
--    NOTA: a useTeamPerformance do dashboard (:484, attribution por intervened_by)
--    tem semântica diferente e NÃO é N+1 — não é coberta aqui (segue como está).
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
  -- ISOLAMENTO
  IF NOT public.user_is_org_member((select auth.uid()), _org) THEN
    RAISE EXCEPTION 'access denied to organization %', _org USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH per_user AS (
    SELECT c.assigned_to AS user_id, count(*) AS handled
    FROM public.conversations c
    WHERE c.organization_id = _org
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
-- 3) get_pipeline_stage_distribution — substitui usePipelineStageDistribution
--    (usePipelineStats.ts :12-50). GROUP BY column_id no servidor.
--    Isolamento: org derivada do pipeline; valida membership do caller.
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
    RETURN; -- pipeline inexistente → vazio (igual ao hook atual)
  END IF;

  -- ISOLAMENTO: caller precisa ser membro da org dona do pipeline
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
    WHERE cpp.pipeline_id = _pipeline_id
    GROUP BY cpp.column_id
  ) cnt ON cnt.column_id = pc.id
  WHERE pc.pipeline_id = _pipeline_id
  ORDER BY pc."order" ASC;
END;
$$;

-- -----------------------------------------------------------------------------
-- GRANTs — apenas usuários autenticados (dashboard exige login)
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(uuid, uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_performance(uuid, uuid, timestamptz, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pipeline_stage_distribution(uuid) TO authenticated;

COMMIT;
