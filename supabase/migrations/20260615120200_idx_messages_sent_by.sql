-- Fase 2 (perf): índice de FK messages.sent_by (parcial — só não-nulos).
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sent_by
  ON public.messages(sent_by)
  WHERE sent_by IS NOT NULL;
