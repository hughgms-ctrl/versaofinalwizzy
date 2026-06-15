-- Fase 2 (perf): índice composto entry_flow_events(event_name, user_id, created_at)
-- — process-checkout-recovery e analytics de entry flow.
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entry_flow_events_name_user
  ON public.entry_flow_events(event_name, user_id, created_at);
