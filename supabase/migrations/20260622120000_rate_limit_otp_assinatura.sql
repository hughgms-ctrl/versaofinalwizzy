-- =============================================================================
-- Rate limiting / anti-brute-force no OTP de assinatura (PRONTIDAO_PRODUCAO 5.1)
-- =============================================================================
-- Contexto: signature-verify-otp validava um codigo de 6 digitos (1M combinacoes)
-- sem limite de tentativas -> brute-force online viavel. signature-send-otp nao
-- limitava reenvios, permitindo resetar o contador de tentativas a cada reenvio.
--
-- Esta migration e ADITIVA (coluna + indice) e sobrevive ao Lovable sync.
-- DEPLOY: aplicar MANUALMENTE no SQL Editor do Supabase (projeto zaobtetbjpuzibjymhzw).
-- NAO usar `supabase db push`. Idempotente (IF NOT EXISTS).
-- =============================================================================

-- Contador de tentativas por codigo OTP, lido/incrementado pela edge function
-- signature-verify-otp. Ao atingir o teto (5) o codigo e queimado expirando-o
-- (expires_at no passado) — NUNCA via verified=true, pois em signature-complete
-- uma linha verified=true conta como canal aprovado.
ALTER TABLE public.signature_otp_codes
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;

-- Suporta a busca do OTP ativo (signature_id + created_at DESC) tanto na
-- verificacao quanto na contagem da janela de reenvio em signature-send-otp.
CREATE INDEX IF NOT EXISTS idx_signature_otp_codes_sig_created
  ON public.signature_otp_codes(signature_id, created_at DESC);

-- =============================================================================
-- ATENCAO — fix de RLS (NAO rodar aqui; aplicar PELO LOVABLE)
-- =============================================================================
-- A tabela tem uma policy permissiva critica:
--   "Public can insert OTP verifications"  FOR SELECT  USING (true)
-- O nome diz "insert" mas e SELECT publico -> qualquer um com a anon key le os
-- codigos OTP direto via REST (GET /rest/v1/signature_otp_codes?select=code),
-- derrotando o OTP sem nem precisar de brute-force.
--
-- As edge functions usam service role (bypassa RLS), entao remover essa policy
-- NAO quebra o fluxo de assinatura. O cliente nunca precisa ler codigos OTP.
--
-- RLS e REVERTIDA pelo Lovable a cada sync -> a remocao DURAVEL desta policy
-- precisa ser feita PELO LOVABLE (nao adianta DROP no SQL Editor). Mudanca alvo:
--
--   DROP POLICY IF EXISTS "Public can insert OTP verifications"
--     ON public.signature_otp_codes;
--
-- (manter a tabela com RLS habilitado e SEM policies de SELECT/INSERT publicas;
--  so service role acessa, como em platform_job_runs.)
-- =============================================================================
