-- Ativa o ESCOPO DE CONVERSA POR INSTÂNCIA (número da empresa).
--
-- Regra de negócio (confirmada 2026-06-16):
--   • A identidade da conversa é (contact_id, organization_id, whatsapp_instance_id).
--     → Mesmo cliente falando com DOIS números da empresa = DOIS chats separados.
--   • Workspace NÃO faz parte da identidade — é rótulo móvel; trocar de workspace
--     mantém o MESMO chat (o código já faz UPDATE de workspace_id na conversa existente).
--   • Isolamento por conta (organization_id) preservado — RLS inalterado.
--
-- Contexto: a migration 20260610173000 introduziu este modelo mas seu DROP do
-- índice legado NUNCA foi aplicado no banco vivo (drift). O índice antigo
-- `idx_conversations_contact_org_unique (contact_id, organization_id)` forçava
-- 1 conversa por contato/org e fazia o `zapi-webhook` CRASHAR (23505) ao tentar
-- criar a 2ª conversa de um contato (2º número) → mensagens RECEBIDAS eram perdidas
-- ("handleMessage crashed but returning 200", confirmado em log 2026-06-16).
--
-- Pré-requisito de segurança: o código já está preparado (lookups de conversa
-- filtram por whatsapp_instance_id — auditoria 2026-06-16). Hoje há no máx. 1
-- conversa por (contato, org), então o índice por instância não pode ter duplicatas.
--
-- Aplicação: MANUAL no SQL Editor do Supabase (regra de deploy Lovable).

BEGIN;

-- 1. Garante o índice único por instância (uniqueness correta do novo modelo).
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_contact_org_instance_unique
ON public.conversations (
  contact_id,
  organization_id,
  COALESCE(whatsapp_instance_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- 2. Remove o índice legado que forçava 1 conversa por (contato, org) e
--    bloqueava conversas separadas por número.
DROP INDEX IF EXISTS public.idx_conversations_contact_org_unique;

COMMIT;
