-- Fase 2 (perf): índice composto case_activity_log(organization_id, created_at DESC) — feed de atividade.
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_case_activity_org
  ON public.case_activity_log(organization_id, created_at DESC);
