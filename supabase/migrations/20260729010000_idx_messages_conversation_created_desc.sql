-- Perf: última mensagem de cada conversa (embed `last_message:messages(...)`
-- em useConversations/usePaginatedConversations) fazia Seq Scan em messages
-- por conversa (confirmado via EXPLAIN ANALYZE: ~7ms x 100 loops = ~725ms,
-- praticamente 100% do tempo da query principal da tela de Conversas).
-- A migration 20260610213000_add_performance_indexes.sql já pretendia criar
-- este índice, mas ele nunca existiu no banco (confirmado via pg_indexes).
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_created_desc
  ON public.messages(conversation_id, created_at DESC);
