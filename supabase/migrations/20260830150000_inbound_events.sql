-- B3 (docs/REVISAO_ESCALA_LANCAMENTO.md) — caixa-preta da entrada de mensagens.
--
-- O 503 já faz o provedor reenviar quando o webhook falha por infraestrutura.
-- O que faltava era a rede embaixo disso: se o isolate morre no meio (sem
-- resposta nenhuma) ou se o handler quebra por bug, a mensagem some sem deixar
-- rastro. Esta tabela guarda o payload cru de todo evento de MENSAGEM antes de
-- processar; o processamento marca 'processed' no fim, e o que ficar 'pending'
-- é reenviado ao próprio webhook por reprocess-inbound-events.
--
-- O payload é gravado sem os campos base64 (mídia é recuperável pelo msgId no
-- provedor) — senão a tabela cresceria em GB por dia com 98 números.
--
-- APLICAR À MÃO no SQL Editor (nunca supabase db push).

CREATE TABLE IF NOT EXISTS public.inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text,
  event_type text,
  instance_id text,
  instance_name text,
  provider_message_id text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  processed_at timestamptz
);

DO $$ BEGIN
  ALTER TABLE public.inbound_events ADD CONSTRAINT inbound_events_status_check
    CHECK (status IN ('pending', 'processed', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sem policy: RLS ligada e nenhuma regra = só a service role enxerga.
ALTER TABLE public.inbound_events ENABLE ROW LEVEL SECURITY;

-- A fila do reprocesso: só o que está pendente.
CREATE INDEX IF NOT EXISTS idx_inbound_events_pending
  ON public.inbound_events (created_at)
  WHERE status = 'pending';

-- A purga e a inspeção manual.
CREATE INDEX IF NOT EXISTS idx_inbound_events_done
  ON public.inbound_events (processed_at)
  WHERE status <> 'pending';

CREATE INDEX IF NOT EXISTS idx_inbound_events_provider_message_id
  ON public.inbound_events (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Claim atômico, mesmo padrão de claim_campaign_queue: dois ticks simultâneos
-- não pegam o mesmo evento porque o UPDATE reconfere o WHERE depois do lock.
-- _min_age_seconds evita competir com o processamento normal, que ainda está
-- rodando nos primeiros segundos.
DROP FUNCTION IF EXISTS public.claim_inbound_events(integer, integer);

CREATE OR REPLACE FUNCTION public.claim_inbound_events(_limit integer DEFAULT 20, _min_age_seconds integer DEFAULT 120)
RETURNS SETOF public.inbound_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH exhausted AS (
    UPDATE public.inbound_events
    SET status = 'failed',
        processed_at = now(),
        last_error = COALESCE(last_error, 'esgotou as tentativas')
    WHERE status = 'pending'
      AND attempts >= 3
      AND created_at < now() - make_interval(secs => _min_age_seconds)
    RETURNING id
  ),
  candidates AS (
    SELECT id
    FROM public.inbound_events
    WHERE status = 'pending'
      AND attempts < 3
      AND created_at < now() - make_interval(secs => _min_age_seconds)
      AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes')
      AND id NOT IN (SELECT id FROM exhausted)
    ORDER BY created_at
    LIMIT _limit
  )
  UPDATE public.inbound_events e
  SET attempts = e.attempts + 1,
      claimed_at = now()
  WHERE e.id IN (SELECT id FROM candidates)
    AND e.status = 'pending'
    AND e.attempts < 3
    AND (e.claimed_at IS NULL OR e.claimed_at < now() - interval '5 minutes')
  RETURNING e.*;
$$;

REVOKE ALL ON FUNCTION public.claim_inbound_events(integer, integer) FROM public, anon, authenticated;

-- Purga: o histórico só serve para reprocessar e depurar incidente recente.
CREATE OR REPLACE FUNCTION public.purge_inbound_events(_keep_days integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer;
BEGIN
  DELETE FROM public.inbound_events
  WHERE status <> 'pending'
    AND COALESCE(processed_at, created_at) < now() - make_interval(days => _keep_days);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_inbound_events(integer) FROM public, anon, authenticated;
