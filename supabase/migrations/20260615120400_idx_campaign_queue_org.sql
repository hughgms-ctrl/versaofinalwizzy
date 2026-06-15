-- Fase 2 (perf): índice de FK campaign_queue.organization_id.
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaign_queue_org
  ON public.campaign_queue(organization_id);
