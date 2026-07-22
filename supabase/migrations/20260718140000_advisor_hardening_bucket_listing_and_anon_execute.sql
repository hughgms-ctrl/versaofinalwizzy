-- Hardening dos achados do Supabase Advisor (2026-07-18, 2º lote)
-- Origem: linter apontou (a) "Public Bucket Allows Listing" em chat-media/flow-media
-- e (b) "Public Can Execute SECURITY DEFINER Function" para ~40 funções expostas ao role
-- `anon` via /rest/v1/rpc/*.
--
-- Deploy: sobe PELO LOVABLE (nunca supabase db push). Guardas IF EXISTS / to_regprocedure
-- tornam a migration idempotente e segura onde o objeto não existir.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Public Bucket Allows Listing — chat-media e flow-media.
--
--    Os buckets CONTINUAM public=true; a ENTREGA de mídia pelo provedor de WhatsApp usa
--    a URL pública (/storage/v1/object/public/<bucket>/...), que NÃO consulta policy de
--    SELECT — só o flag public do bucket. A policy "Public read access ..." (FOR SELECT,
--    role público) só habilita LISTAR/enumerar os arquivos via storage.list(), coisa que
--    o front nunca faz (todo uso é .upload() + .getPublicUrl()). Removê-la fecha a
--    enumeração sem afetar a entrega.
--
--    Reversível: recriar a policy FOR SELECT USING (bucket_id = '<bucket>').
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public read access for chat media" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for flow media" ON storage.objects;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Public Can Execute SECURITY DEFINER Function.
--
--    2a) Funções de TRIGGER (returns trigger): nunca precisam ser chamadas via RPC — o
--        trigger dispara com os privilégios do dono independentemente de GRANT. Tira
--        EXECUTE de anon E authenticated (defesa em profundidade). service_role/owner
--        ficam intactos.
--
--    2b) Helpers de RLS + RPCs de aplicação/manutenção: tira EXECUTE só de `anon`.
--        `authenticated` PRECISA manter EXECUTE — os helpers (get_user_org_id, has_role,
--        user_belongs_to_org, ...) são chamados dentro de policies RLS e avaliados com o
--        privilégio do usuário logado; e o front chama get_dashboard_metrics,
--        search_messages, adopt_orphan_conversations_for_workspace, is_platform_admin etc.
--        via .rpc(). service_role (edge functions) também permanece.
--
--    Nota de segurança do anon: a única superfície anônima do app é login + quiz público.
--    As policies TO anon do quiz (quiz_submissions/quizzes/quiz_questions) usam
--    is_active/public_token — não referenciam nenhum helper abaixo. Logo, remover EXECUTE
--    do anon nesses helpers não quebra a avaliação de RLS do fluxo anônimo.
--
--    Reversível: GRANT EXECUTE ON FUNCTION <assinatura> TO anon (/authenticated).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
  -- 2a) trigger functions → revoke de anon + authenticated
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
  -- 2b) helpers de RLS + RPCs → revoke só de anon
  scoped_fns text[] := ARRAY[
    -- helpers de RLS (mantêm authenticated para avaliar policies)
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
    -- RPCs de aplicação (chamados pelo front, autenticado)
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
    -- RPCs de manutenção (rodadas via SQL editor/service_role)
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
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', fn);
    END IF;
  END LOOP;

  FOREACH fn IN ARRAY scoped_fns LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    END IF;
  END LOOP;
END $$;
