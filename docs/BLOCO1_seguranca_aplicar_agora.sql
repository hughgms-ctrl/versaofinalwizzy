-- =====================================================================
-- BLOCO 1 — Migrations de segurança seguras para aplicar AGORA
-- Rodar no SQL editor do Supabase (prod). Tudo idempotente, ordem preservada.
-- NÃO inclui a task-files (20260710) — essa exige o front novo em prod ANTES.
-- =====================================================================


-- #####################################################################
-- 1/5  20260705120000_security_rls_fixes  (OTP público + flow_node_logs)
-- #####################################################################

DROP POLICY IF EXISTS "Public can insert OTP verifications" ON public.signature_otp_codes;
ALTER TABLE public.signature_otp_codes ENABLE ROW LEVEL SECURITY;

-- Escrita só service_role; LEITURA org-scoped (membros veem os logs da própria
-- org — mantém o painel do ContactLogsSection funcionando).
DROP POLICY IF EXISTS "Service role can manage flow node logs" ON public.flow_node_logs;
CREATE POLICY "Service role can manage flow node logs"
  ON public.flow_node_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view flow node logs in their organization" ON public.flow_node_logs;
CREATE POLICY "Users can view flow node logs in their organization"
  ON public.flow_node_logs
  FOR SELECT
  USING (organization_id = get_user_org_id((select auth.uid())));

ALTER TABLE public.flow_node_logs ENABLE ROW LEVEL SECURITY;


-- #####################################################################
-- 2/5  20260705130000_rate_limit  (tabela + RPC check_rate_limit)
-- #####################################################################

CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket       text        NOT NULL,
  identifier   text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, identifier, window_start)
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket         text,
  p_identifier     text,
  p_max_requests   integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count        integer;
BEGIN
  IF p_identifier IS NULL OR p_identifier = '' THEN
    RETURN true;
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limits (bucket, identifier, window_start, count)
  VALUES (p_bucket, p_identifier, v_window_start, 1)
  ON CONFLICT (bucket, identifier, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO v_count;

  DELETE FROM public.rate_limits
  WHERE bucket = p_bucket
    AND identifier = p_identifier
    AND window_start < v_window_start;

  RETURN v_count <= p_max_requests;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer)
  TO anon, authenticated, service_role;


-- #####################################################################
-- 3/5  20260706120000_security_rls_fixes_lote2
--       (platform_settings / signature_evidence / organizations /
--        whatsapp_instances / quiz_submissions)
-- #####################################################################

-- whitelist inclui as feature-flags do ToolsPage (tool_release_flags /
-- internal_test_organization_ids) — não-sensíveis, o UI precisa lê-las.
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

DROP POLICY IF EXISTS "Public can insert signature evidence" ON public.signature_evidence;
ALTER TABLE public.signature_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "System can insert organizations" ON public.organizations;
DROP POLICY IF EXISTS "Service role can insert organizations" ON public.organizations;
CREATE POLICY "Service role can insert organizations"
  ON public.organizations
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "System can insert whatsapp instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Service role can insert whatsapp instances" ON public.whatsapp_instances;
CREATE POLICY "Service role can insert whatsapp instances"
  ON public.whatsapp_instances
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

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


-- #####################################################################
-- 4/5  20260709120000_storage_quiz_upload_active_only
-- #####################################################################

DROP POLICY IF EXISTS "Public users can upload quiz files" ON storage.objects;
CREATE POLICY "Public users can upload quiz files"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'contact-files'
  AND name LIKE 'quiz-uploads/%'
  AND EXISTS (
    SELECT 1
    FROM public.quizzes q
    WHERE q.id::text = (storage.foldername(name))[2]
      AND q.is_active = true
      AND q.public_token IS NOT NULL
  )
);


-- #####################################################################
-- 5/5  20260709121000_storage_delete_hardening
-- #####################################################################

DROP POLICY IF EXISTS "Users can delete their chat media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete flow media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete carousel images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete contact files" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete their contact files" ON storage.objects;

CREATE POLICY "Org members can delete their contact files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'contact-files'
  AND EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND c.organization_id = get_user_org_id(auth.uid())
  )
);

-- =====================================================================
-- FIM DO BLOCO 1
-- =====================================================================
