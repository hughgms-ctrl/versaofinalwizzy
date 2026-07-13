-- =============================================================================
-- Correções de RLS (lote 2) — Auditoria de Segurança 2026-07
-- =============================================================================
-- DEPLOY: aplicar PELO LOVABLE (RLS é revertida a cada sync — ver memória
-- "deploy-mechanism"). NÃO usar `supabase db push`. Idempotente.
--
-- Cobre 4 achados:
--   platform_settings   — SELECT público (USING true) expõe segredos
--                         (whatsapp_connection_settings.evolution_api_key,
--                         payment_gateway_settings) via anon key.
--   signature_evidence  — INSERT anon (WITH CHECK true) permite forjar evidência.
--   organizations       — INSERT WITH CHECK(true) permite qualquer um criar org.
--   whatsapp_instances  — INSERT WITH CHECK(true) permite injetar instância em
--                         qualquer org.
--   quiz_submissions    — INSERT anon (WITH CHECK true) permite forjar submissão
--                         em qualquer org / quiz inexistente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- platform_settings — trocar SELECT público irrestrito por whitelist.
-- Reads diretos do client (verificado na fonte 2026-07-12):
--   - Sidebar lê 'show_client_plans_menu' (usuário autenticado);
--   - ToolsPage lê 'tool_release_flags' + 'internal_test_organization_ids'
--     (feature flags de ferramentas — commit 85f12275, POSTERIOR a esta migration;
--     são flags não-sensíveis e o UI precisa delas, por isso entram na whitelist);
--   - 'allow_signups' pode ser lido na tela de signup.
-- Todo o resto (payment_gateway_settings, whatsapp_connection_settings,
-- whatsapp_provider_strategy, entry_flow_*) é sensível e só deve ser lido por:
--   - platform admins (policy "Platform admins can manage settings", FOR ALL);
--   - edge functions (service_role, que bypassa RLS);
--   - triggers SECURITY DEFINER (handle_new_user lê allow_signups, bypassa RLS).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read settings" ON public.platform_settings;
DROP POLICY IF EXISTS "Public can read non-sensitive settings" ON public.platform_settings;

CREATE POLICY "Public can read non-sensitive settings"
  ON public.platform_settings
  FOR SELECT
  USING (key IN (
    'allow_signups',
    'show_client_plans_menu',
    'tool_release_flags',
    'internal_test_organization_ids'
  ));

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- signature_evidence — remover INSERT público.
-- Só a edge function signature-complete grava evidência, e ela usa service_role
-- (bypassa RLS). Nenhum código client insere signature_evidence (só SELECT/DELETE).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can insert signature evidence" ON public.signature_evidence;

ALTER TABLE public.signature_evidence ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- organizations — remover INSERT WITH CHECK(true).
-- A criação de org acontece via trigger handle_new_user (SECURITY DEFINER,
-- bypassa RLS) e edge functions (service_role). Nenhum insert client-side direto
-- (verificado na fonte). Restringe a service_role para bloquear criação arbitrária
-- de orgs por usuários autenticados/anon.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "System can insert organizations" ON public.organizations;
DROP POLICY IF EXISTS "Service role can insert organizations" ON public.organizations;

CREATE POLICY "Service role can insert organizations"
  ON public.organizations
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- whatsapp_instances — remover INSERT WITH CHECK(true).
-- Instâncias são criadas via edge functions (zapi-create-instance /
-- zapi-save-credentials, service_role). Nenhum insert client-side direto.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "System can insert whatsapp instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Service role can insert whatsapp instances" ON public.whatsapp_instances;

CREATE POLICY "Service role can insert whatsapp instances"
  ON public.whatsapp_instances
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- quiz_submissions — manter INSERT anon (a página pública insere direto), mas
-- restringir o WITH CHECK: a submissão só é aceita se apontar para um quiz
-- realmente ativo/público E cujo organization_id bata com o da submissão. Sem
-- isso, um anon pode forjar submissões em qualquer org ou para quizzes privados.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can submit quiz answers" ON public.quiz_submissions;

CREATE POLICY "Anyone can submit quiz answers"
  ON public.quiz_submissions
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = quiz_submissions.quiz_id
        AND q.is_active = true
        AND q.public_token IS NOT NULL
        AND q.organization_id = quiz_submissions.organization_id
    )
  );

ALTER TABLE public.quiz_submissions ENABLE ROW LEVEL SECURITY;
