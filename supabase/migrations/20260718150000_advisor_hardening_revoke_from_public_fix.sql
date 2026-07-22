-- Correção do 2º lote do Advisor (2026-07-18).
-- A migration anterior (20260718140000) usou REVOKE ... FROM anon, que é NO-OP: funções
-- em Postgres nascem com GRANT EXECUTE TO PUBLIC, e `anon` herda o EXECUTE via PUBLIC —
-- não por um grant direto. Enquanto o grant a PUBLIC existir, revogar de `anon` não muda
-- nada e o Advisor continua apontando "Public Can Execute SECURITY DEFINER Function".
--
-- Fix correto: REVOKE ... FROM PUBLIC e devolver GRANT só para quem precisa.
--
-- Deploy: sobe PELO LOVABLE (nunca supabase db push). Precisa chegar ao banco VIVO — se a
-- 20260718140000 não alterou nada em produção, confirme que o sync do Lovable rodou.
-- Guardas to_regprocedure / IF EXISTS mantêm a migration idempotente.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Public Bucket Allows Listing — chat-media e flow-media (re-aplicado; idempotente).
--    Buckets seguem public=true; a URL pública ignora policy de SELECT, então a entrega
--    de mídia não é afetada — só a enumeração via .list() é fechada.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read access for chat media" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for flow media" ON storage.objects;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Public Can Execute SECURITY DEFINER Function.
--
--    2a) TRIGGERS (returns trigger): REVOKE FROM PUBLIC e não devolve nada. Triggers
--        disparam com o privilégio do dono, sem depender de EXECUTE — ninguém precisa
--        chamá-las via RPC.
--
--    2b) Helpers de RLS + RPCs de app/manutenção: REVOKE FROM PUBLIC e GRANT de volta a
--        authenticated + service_role. `authenticated` precisa para avaliar policies RLS
--        (get_user_org_id, has_role, ...) e para os .rpc() do front (dashboard, search,
--        adopt_orphan_conversations_for_workspace, is_platform_admin, ...). service_role
--        (edge functions) também precisa porque, ao revogar de PUBLIC, ele perderia o
--        EXECUTE herdado. anon fica de fora — é isso que o Advisor exige.
--
--    A única superfície anônima do app (login + quiz público) usa policies TO anon do quiz
--    que não referenciam nenhum helper abaixo, então remover o anon não quebra o fluxo.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
  trigger_fns text[] := ARRAY[
    'public.apply_column_auto_tags()',
    'public.auto_assign_workspace_on_tag()',
    'public.check_suspicious_activity()',
    'public.copy_task_notifications_from_template()',
    'public.handle_contact_tag_added_campaign()',
    'public.handle_new_user()',
    'public.reopen_conversation_on_inbound()',
    'public.sync_conversation_last_message_direction()',
    'public.sync_organization_member_role()',
    'public.trg_case_from_pipeline_move()',
    'public.trg_seed_operations_on_new_org()'
  ];
  scoped_fns text[] := ARRAY[
    -- helpers de RLS
    'public.get_user_org_id(uuid)',
    'public.has_role(uuid, public.app_role)',
    'public.has_org_role(uuid, uuid, public.app_role)',
    'public.has_role_in_org(uuid, public.app_role, uuid)',
    'public.is_platform_admin(uuid)',
    'public.user_belongs_to_org(uuid, uuid)',
    'public.user_is_org_member(uuid, uuid)',
    'public.user_can_manage_org(uuid, uuid)',
    'public.user_can_access_module(uuid, text)',
    'public.user_has_workspace_access(uuid, uuid)',
    'public.get_active_instance_id(uuid)',
    'public.get_active_phone_number(uuid)',
    -- RPCs de aplicação (front, autenticado)
    'public.get_dashboard_metrics(uuid, uuid, timestamptz, timestamptz)',
    'public.get_team_performance(uuid, uuid, timestamptz, timestamptz, uuid)',
    'public.get_pipeline_stage_distribution(uuid)',
    'public.search_messages(uuid, text)',
    'public.create_case_from_template(uuid, uuid, uuid, uuid)',
    'public.create_case_from_template(uuid, uuid, uuid, uuid, uuid)',
    'public.adopt_orphan_conversations_for_workspace(uuid, uuid, boolean)',
    'public.adopt_orphan_conversations_for_instance(uuid)',
    'public.check_rate_limit(text, text, integer, integer)',
    'public.record_conversation_origin_audit(uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb)',
    -- RPCs de manutenção (SQL editor / service_role)
    'public.deactivate_org_instances(uuid)',
    'public.seed_operations_defaults(uuid)',
    'public._wz_merge_conversation_pair(uuid, uuid)',
    'public.merge_duplicate_contacts_safe(boolean)',
    'public.merge_duplicate_conversations(boolean)',
    'public.merge_orphans_into_number(boolean)',
    'public.readopt_orphan_conversations(boolean)'
  ];
BEGIN
  FOREACH fn IN ARRAY trigger_fns LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', fn);
    END IF;
  END LOOP;

  FOREACH fn IN ARRAY scoped_fns LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
    END IF;
  END LOOP;
END $$;
