-- Fase 2 (perf): índice organization_members(user_id) — acelera helpers RLS de membership
-- (o UNIQUE existente lidera por organization_id, não serve lookup por user_id).
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_user
  ON public.organization_members(user_id);
