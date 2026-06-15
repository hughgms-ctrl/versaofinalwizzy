-- Fase 2 (perf): índice composto calendar_bookings(organization_id, starts_at) — agenda por org.
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calendar_bookings_org
  ON public.calendar_bookings(organization_id, starts_at);
