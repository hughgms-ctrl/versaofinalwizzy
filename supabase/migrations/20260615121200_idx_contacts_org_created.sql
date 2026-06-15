-- Fase 2 (perf): índice composto contacts(organization_id, created_at DESC) — feed/listagem de contatos.
-- CONCURRENTLY: NÃO rodar dentro de transação. Aplicar isoladamente no SQL Editor.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_org_created
  ON public.contacts(organization_id, created_at DESC);
