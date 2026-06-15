-- Fase 2 (perf): índice composto flow_executions(status, remarketing_step, timeout_at)
-- — varredura de timeouts em process-flow-timeouts (Fase 3E).
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flow_executions_timeout
  ON public.flow_executions(status, remarketing_step, timeout_at);
