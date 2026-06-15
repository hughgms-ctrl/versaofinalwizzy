-- Fase 2 (perf): índice de FK conversations.contact_id (cascade-delete/JOIN).
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_contact_id
  ON public.conversations(contact_id);
