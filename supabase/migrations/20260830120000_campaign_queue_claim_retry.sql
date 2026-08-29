-- B8 (docs/REVISAO_ESCALA_LANCAMENTO.md): fila de campanha com claim atômico,
-- tentativas limitadas e justiça por organização no lote.
--
-- A Semana 1 já criou claim_campaign_queue(int) e a coluna claimed_at. Esta
-- migration TROCA a função (assinatura nova: DROP antes, senão o PostgREST vê
-- duas sobrecargas e recusa a chamada por ambiguidade) e adiciona o contador
-- de tentativas. process-campaign-queue funciona com ou sem esta migration
-- aplicada (sem ela: sem retry, item falho vai direto para 'failed').
--
-- APLICAR À MÃO no SQL Editor (nunca supabase db push).

ALTER TABLE public.campaign_queue ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.campaign_queue ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.campaign_queue ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS idx_campaign_queue_pending_scheduled
  ON public.campaign_queue (scheduled_for)
  WHERE status IN ('pending', 'processing');

DROP FUNCTION IF EXISTS public.claim_campaign_queue(integer);

-- Regras:
--  * elegível = pending com hora chegada, ou processing abandonado (claim há
--    mais de 10 min sem processed_at — isolate morreu no meio);
--  * quem já tentou 3x é fechado como failed em vez de reclamado de novo;
--  * no máximo _per_org itens por organização por lote, ordenados por
--    scheduled_for — uma org com 5k contatos não monopoliza o tick;
--  * o UPDATE reconfere a elegibilidade na hora de gravar (READ COMMITTED
--    reavalia o WHERE após esperar o lock), então dois ticks simultâneos não
--    reclamam o mesmo item.
CREATE OR REPLACE FUNCTION public.claim_campaign_queue(_limit integer DEFAULT 50, _per_org integer DEFAULT 10)
RETURNS SETOF public.campaign_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH exhausted AS (
    UPDATE public.campaign_queue
    SET status = 'failed',
        processed_at = now(),
        last_error = COALESCE(last_error, 'esgotou as tentativas')
    WHERE status IN ('pending', 'processing')
      AND attempts >= 3
      AND (status = 'pending' OR claimed_at < now() - interval '10 minutes')
    RETURNING id
  ),
  candidates AS (
    SELECT id
    FROM (
      SELECT id,
             row_number() OVER (PARTITION BY organization_id ORDER BY scheduled_for, id) AS rn
      FROM public.campaign_queue
      WHERE attempts < 3
        AND ((status = 'pending' AND scheduled_for <= now())
          OR (status = 'processing' AND claimed_at < now() - interval '10 minutes'))
        AND id NOT IN (SELECT id FROM exhausted)
    ) ranked
    WHERE rn <= _per_org
    ORDER BY rn, id
    LIMIT _limit
  )
  UPDATE public.campaign_queue q
  SET status = 'processing',
      claimed_at = now(),
      attempts = q.attempts + 1
  WHERE q.id IN (SELECT id FROM candidates)
    AND q.attempts < 3
    AND ((q.status = 'pending' AND q.scheduled_for <= now())
      OR (q.status = 'processing' AND q.claimed_at < now() - interval '10 minutes'))
  RETURNING q.*;
$$;

REVOKE ALL ON FUNCTION public.claim_campaign_queue(integer, integer) FROM public, anon, authenticated;
