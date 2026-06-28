-- Corrige a EXCLUSÃO de instâncias WhatsApp travada por colisão de índice único.
--
-- Sintoma (confirmado 2026-06-28): ao deletar uma instância em
-- Configurações > Conexões WhatsApp, o banco retorna
--   "duplicate key value violates unique constraint
--    idx_conversations_contact_org_instance_unique"
-- e a instância nunca é removida.
--
-- Causa-raiz:
--   • O FK conversations.whatsapp_instance_id é ON DELETE SET NULL. Ao deletar a
--     instância, TODAS as suas conversas têm whatsapp_instance_id zerado de uma vez.
--   • O índice único atual indexa COALESCE(whatsapp_instance_id, UUID-zero), ou seja
--     trata NULL como um valor concreto e força UNICIDADE entre conversas órfãs.
--   • Se o mesmo contato falou com 2 números (ou já tinha conversa órfã/IA com
--     instância NULL), o SET NULL colapsa as duas para (contato, org, UUID-zero)
--     → colisão 23505 → o DELETE inteiro faz rollback.
--
-- Correção: índice PARCIAL — só impõe unicidade quando há instância real
-- (whatsapp_instance_id IS NOT NULL). Conversas órfãs (NULL) ficam isentas, então
-- o SET NULL deixa de colidir. A regra de negócio permanece:
--   • (contato, org, instância) continua único → "2 números = 2 chats" preservado;
--   • 1 conversa por contato dentro do mesmo número continua garantida.
-- O zapi-webhook cria conversa por lookup-then-insert (não usa ON CONFLICT neste
-- índice), então a mudança não afeta o caminho de criação de conversas.
--
-- Não-destrutivo: o histórico de conversas é preservado (apenas fica sem instância).
--
-- Aplicação: MANUAL no SQL Editor do Supabase (regra de deploy Lovable).

BEGIN;

DROP INDEX IF EXISTS public.idx_conversations_contact_org_instance_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_contact_org_instance_unique
ON public.conversations (
  contact_id,
  organization_id,
  whatsapp_instance_id
)
WHERE whatsapp_instance_id IS NOT NULL;

COMMIT;
