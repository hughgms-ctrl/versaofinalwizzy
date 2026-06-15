-- Fase 2 (perf): índice de FK campaign_queue.campaign_id.
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaign_queue_campaign
  ON public.campaign_queue(campaign_id);
