-- Fase 2 (perf): índice de FK conversations.assigned_to (parcial — só não-nulos).
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_assigned_to
  ON public.conversations(assigned_to)
  WHERE assigned_to IS NOT NULL;
