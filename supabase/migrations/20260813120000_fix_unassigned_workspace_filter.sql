-- =============================================================================
-- Corrige filtro de workspace "Não atribuído" nas RPCs do dashboard
-- =============================================================================
-- Bug: o front-end manda a string literal 'unassigned' (não um uuid) no
-- parâmetro _workspace_id quando o usuário filtra pelo workspace "Não
-- atribuído" (ver src/contexts/WorkspaceContext.tsx e as chamadas de
-- get_dashboard_metrics / get_team_performance em useDashboardData.ts).
-- Como _workspace_id é tipado uuid, isso derruba a RPC com
-- "invalid input syntax for type uuid" sempre que esse filtro é usado.
--
-- Fix: novo parâmetro _unassigned_only boolean (default false, backward
-- compatible com quem já chama sem ele). Quando true, filtra
-- c.workspace_id IS NULL (conversas sem workspace) em vez de comparar com
-- _workspace_id. O front-end passa _workspace_id: null junto.
--
-- Como isso muda a assinatura (novo parâmetro), CREATE OR REPLACE criaria um
-- overload extra em vez de substituir — por isso o DROP FUNCTION explícito
-- das assinaturas antigas antes de recriar. REVOKE/GRANT reaplicados porque
-- toda função nova nasce com EXECUTE para PUBLIC (mesma pegadinha das
-- migrations de hardening de 2026-07-18).
--
-- DEPLOY: aplicar manualmente no SQL Editor do Supabase (mesma regra das
-- migrations anteriores de RPC — NÃO usar `supabase db push`).
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_dashboard_metrics(uuid, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_team_performance(uuid, uuid, timestamptz, timestamptz, uuid);

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  _org uuid,
  _workspace_id uuid DEFAULT NULL,
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL,
  _unassigned_only boolean DEFAULT false
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
    AND (
      (_unassigned_only AND c.workspace_id IS NULL)
      OR (NOT _unassigned_only AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id))
    )
    AND (_since IS NULL OR c.last_message_at >= _since)
    AND (_until IS NULL OR c.last_message_at <= _until);

  -- encerradas no período (status closed + closed_at no range)
  SELECT count(*) INTO v_closed
  FROM public.conversations c
  WHERE c.organization_id = _org
    AND (
      (_unassigned_only AND c.workspace_id IS NULL)
      OR (NOT _unassigned_only AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id))
    )
    AND c.status = 'closed'
    AND (_since IS NULL OR c.closed_at >= _since)
    AND (_until IS NULL OR c.closed_at <= _until);

  -- arquivadas no período (status archived + updated_at no range)
  SELECT count(*) INTO v_archived
  FROM public.conversations c
  WHERE c.organization_id = _org
    AND (
      (_unassigned_only AND c.workspace_id IS NULL)
      OR (NOT _unassigned_only AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id))
    )
    AND c.status = 'archived'
    AND (_since IS NULL OR c.updated_at >= _since)
    AND (_until IS NULL OR c.updated_at <= _until);

  -- abertas: snapshot ATUAL (sem filtro de período) — ativas cuja última
  -- mensagem é inbound (aguardando resposta da empresa)
  SELECT count(*) INTO v_open
  FROM public.conversations c
  WHERE c.organization_id = _org
    AND (
      (_unassigned_only AND c.workspace_id IS NULL)
      OR (NOT _unassigned_only AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id))
    )
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
    AND (
      (_unassigned_only AND c.workspace_id IS NULL)
      OR (NOT _unassigned_only AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id))
    )
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

CREATE OR REPLACE FUNCTION public.get_team_performance(
  _org uuid,
  _workspace_id uuid DEFAULT NULL,
  _since timestamptz DEFAULT NULL,
  _until timestamptz DEFAULT NULL,
  _pipeline_id uuid DEFAULT NULL,
  _unassigned_only boolean DEFAULT false
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
      AND (
        (_unassigned_only AND c.workspace_id IS NULL)
        OR (NOT _unassigned_only AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id))
      )
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

REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(uuid, uuid, timestamptz, timestamptz, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(uuid, uuid, timestamptz, timestamptz, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(uuid, uuid, timestamptz, timestamptz, boolean) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_team_performance(uuid, uuid, timestamptz, timestamptz, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_team_performance(uuid, uuid, timestamptz, timestamptz, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_team_performance(uuid, uuid, timestamptz, timestamptz, uuid, boolean) TO authenticated, service_role;

COMMIT;
