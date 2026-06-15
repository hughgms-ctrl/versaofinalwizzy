-- Fase 2 (perf): índice composto conversation_stage_history(conversation_id, created_at DESC) — histórico de etapas.
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stage_history_conv_created
  ON public.conversation_stage_history(conversation_id, created_at DESC);
