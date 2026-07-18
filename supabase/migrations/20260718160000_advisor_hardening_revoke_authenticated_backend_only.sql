-- 3º lote do Advisor (2026-07-18): fecha o lint 0029 ("Signed-In Users Can Execute
-- SECURITY DEFINER Function") NAS FUNÇÕES QUE O USUÁRIO LOGADO NÃO TEM POR QUE CHAMAR,
-- e pega o último 0028 (anon) que faltou: user_org_role.
--
-- Contexto: a 20260718150000 concedeu EXECUTE a `authenticated` em tudo. Isso é CORRETO
-- para helpers de RLS e RPCs do front, mas exagerado para funções que só rodam via
-- edge function (service_role), via trigger (dono) ou manualmente no SQL editor. Para
-- essas, tiramos `authenticated` e deixamos só `service_role`.
--
-- Classificação verificada no código (quem chama):
--   - user_org_role .............. edge ai-execute-action (service_role) + wrappers
--                                   SECURITY DEFINER (rodam como dono). Não é usado
--                                   direto em policy → authenticated não precisa.
--   - check_rate_limit ........... edge _shared/middleware.ts com createServiceClient().
--   - record_conversation_origin_audit  edge zapi-webhook/sync-*/import-history.
--   - adopt_orphan_conversations_for_instance  edge zapi-check-status (o front usa a
--                                   variante _for_workspace, essa continua com authenticated).
--   - create_case_from_template .. só via PERFORM dentro de triggers (rodam como dono);
--                                   nenhum .rpc() no front.
--   - deactivate_org_instances / seed_operations_defaults / merge_* / readopt_* /
--     _wz_merge_conversation_pair  manutenção via SQL editor (service_role/dono).
--
-- Ficam COM authenticated de propósito (0029 aceito, baixo risco): helpers de RLS usados
-- direto em policies (get_user_org_id, has_role, has_org_role, has_role_in_org,
-- is_platform_admin, user_belongs_to_org, user_is_org_member, user_can_manage_org,
-- user_can_access_module, user_has_workspace_access, get_active_instance_id,
-- get_active_phone_number) e RPCs chamados pelo front (get_dashboard_metrics,
-- get_team_performance, get_pipeline_stage_distribution, search_messages,
-- adopt_orphan_conversations_for_workspace). Silenciar o 0029 nesses exigiria mover as
-- funções para um schema fora da API (refactor maior) — pode ser feito depois se quiser.
--
-- Deploy: SQL editor (produção) e/ou Lovable. Idempotente (to_regprocedure).

DO $$
DECLARE
  fn text;
  -- só backend/trigger/manutenção → sem anon, sem authenticated; mantém service_role
  backend_only_fns text[] := ARRAY[
    'public.user_org_role(uuid, uuid)',
    'public.check_rate_limit(text, text, integer, integer)',
    'public.record_conversation_origin_audit(uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb)',
    'public.adopt_orphan_conversations_for_instance(uuid)',
    'public.create_case_from_template(uuid, uuid, uuid, uuid)',
    'public.create_case_from_template(uuid, uuid, uuid, uuid, uuid)',
    'public.deactivate_org_instances(uuid)',
    'public.seed_operations_defaults(uuid)',
    'public._wz_merge_conversation_pair(uuid, uuid)',
    'public.merge_duplicate_contacts_safe(boolean)',
    'public.merge_duplicate_conversations(boolean)',
    'public.merge_orphans_into_number(boolean)',
    'public.readopt_orphan_conversations(boolean)'
  ];
BEGIN
  FOREACH fn IN ARRAY backend_only_fns LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;
