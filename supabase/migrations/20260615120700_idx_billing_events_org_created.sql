-- Fase 2 (perf): índice composto billing_events(organization_id, created_at DESC) — feed de cobrança.
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_events_org_created
  ON public.billing_events(organization_id, created_at DESC);
