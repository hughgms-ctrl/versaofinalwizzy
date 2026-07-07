-- =============================================================================
-- Rate limiting server-side (fixed window, atômico) — Auditoria 2026-07-05
-- =============================================================================
-- DEPLOY: aplicar PELO LOVABLE (não usar `supabase db push` — ver memória
-- "deploy-mechanism"). Idempotente.
--
-- Motivação: os endpoints públicos (OTP, formulários, quiz, assinatura) não têm
-- limite por IP. O rate limiter in-memory das edge functions é por-isolate e
-- efêmero (cold start zera; isolates diferentes não compartilham contador), então
-- não protege de verdade. Este contador vive no Postgres e é compartilhado entre
-- todos os isolates.
--
-- Uso na edge function (via service_role, que bypassa RLS):
--   const ok = await supabase.rpc('check_rate_limit', {
--     p_bucket: 'signature-send-otp', p_identifier: ip,
--     p_max_requests: 10, p_window_seconds: 60 });
--   if (!ok) return 429;
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tabela do contador. Sem policies de RLS => nenhum acesso anon/authenticated
-- direto; só a RPC (SECURITY DEFINER) e o service_role tocam nela.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket       text        NOT NULL,
  identifier   text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, identifier, window_start)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RPC atômica: incrementa o contador da janela atual e devolve TRUE se ainda
-- está dentro do limite. O INSERT ... ON CONFLICT DO UPDATE torna o incremento
-- atômico (sem race entre requisições concorrentes). Fixed window: a janela é
-- "arredondada" para múltiplos de p_window_seconds.
--
-- Também faz uma limpeza barata e escopada: apaga janelas antigas do MESMO
-- (bucket, identifier), mantendo a tabela pequena sem precisar de cron.
-- ---------------------------------------------------------------------------
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
    -- Sem identificador confiável não dá para limitar; falha aberto (permite).
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

  -- Limpeza oportunista das janelas antigas deste mesmo identificador (barato,
  -- usa a PK). Evita crescimento ilimitado da tabela sem depender de cron.
  DELETE FROM public.rate_limits
  WHERE bucket = p_bucket
    AND identifier = p_identifier
    AND window_start < v_window_start;

  RETURN v_count <= p_max_requests;
END;
$$;

-- anon/authenticated podem CHAMAR a RPC (as edge functions públicas rodam com
-- service_role, mas concedemos a todos por robustez). A função é SECURITY
-- DEFINER e só mexe em rate_limits, então não expõe nada além do próprio limite.
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer)
  TO anon, authenticated, service_role;
