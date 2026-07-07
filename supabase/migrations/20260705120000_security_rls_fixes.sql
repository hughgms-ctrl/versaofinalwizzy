-- =============================================================================
-- Correções de RLS — Auditoria de Segurança 2026-07-05
-- =============================================================================
-- DEPLOY: aplicar PELO LOVABLE (RLS é revertida a cada sync — ver memória
-- "deploy-mechanism"). NÃO usar `supabase db push`. Idempotente.
--
-- Cobre 2 achados:
--   C4 (CRÍTICO) — signature_otp_codes: policy "Public can insert OTP verifications"
--                  é na verdade um SELECT público (USING true) → qualquer um com a
--                  anon key lê os códigos OTP via REST, derrotando a assinatura.
--   A8 (ALTO)    — flow_node_logs: policy FOR ALL USING(true) sem TO service_role
--                  → qualquer usuário autenticado lê/escreve/apaga logs (com conteúdo
--                  de mensagens) de TODAS as orgs (cross-tenant).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- C4 — Remover o SELECT público dos códigos OTP.
-- As edge functions (signature-verify-otp / send-otp / complete) usam service_role,
-- que bypassa RLS, então remover NÃO quebra o fluxo. Nenhum código cliente lê
-- signature_otp_codes via anon key (verificado na fonte em 2026-06-22).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can insert OTP verifications" ON public.signature_otp_codes;

-- Garante que RLS continua habilitado (sem policies públicas de SELECT/INSERT;
-- só service_role acessa, como em platform_job_runs).
ALTER TABLE public.signature_otp_codes ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- A8 — Restringir a policy FOR ALL de flow_node_logs a service_role.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can manage flow node logs" ON public.flow_node_logs;

CREATE POLICY "Service role can manage flow node logs"
  ON public.flow_node_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE public.flow_node_logs ENABLE ROW LEVEL SECURITY;
