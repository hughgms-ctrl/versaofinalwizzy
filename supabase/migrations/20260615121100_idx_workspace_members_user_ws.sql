-- Fase 2 (perf): índice workspace_members(user_id, workspace_id) — helper user_has_workspace_access
-- (o UNIQUE existente lidera por workspace_id, não serve lookup por user_id).
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workspace_members_user_ws
  ON public.workspace_members(user_id, workspace_id);
