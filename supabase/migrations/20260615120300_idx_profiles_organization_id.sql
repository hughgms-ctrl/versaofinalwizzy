-- Fase 2 (perf): índice de FK profiles.organization_id (helper RLS get_user_org_id).
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_organization_id
  ON public.profiles(organization_id);
