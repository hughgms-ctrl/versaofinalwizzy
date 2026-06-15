-- Fase 2 (perf): índice de FK flow_node_logs.organization_id.
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flow_node_logs_org
  ON public.flow_node_logs(organization_id);
