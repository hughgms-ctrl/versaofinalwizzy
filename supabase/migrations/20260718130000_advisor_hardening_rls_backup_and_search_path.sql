-- Hardening dos achados do Supabase Advisor (2026-07-18)
-- Origem: linter do Lovable/Supabase apontou (a) "RLS Disabled in Public" +
-- "Customer contact backup data publicly exposed" e (b) "Function Search Path Mutable".
--
-- Ambos são DRIFT do banco vivo (não omissão do código versionado): a auditoria
-- confirmou que TODAS as tabelas e funções SECURITY DEFINER das migrations já têm
-- RLS/search_path. Os objetos abaixo foram criados fora do fluxo versionado
-- (backup manual de 01/07; funções via SQL Editor / docs/fase1-visibilidade-execucao.sql).
--
-- Deploy: sobe PELO LOVABLE (nunca supabase db push). Guardas IF EXISTS / to_regprocedure
-- tornam a migration idempotente e segura em ambientes onde o objeto não existe.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) contacts_backup_20260701 — backup manual de PII (nome/telefone), sem RLS,
--    NÃO referenciado por nenhum código (front/edge/migration). Decisão do usuário:
--    manter os dados mas ligar RLS. Sem policies = default-deny: anon/authenticated
--    não leem nada via PostgREST; service_role (backend) continua com acesso total.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.contacts_backup_20260701 ENABLE ROW LEVEL SECURITY;

-- Defesa em profundidade: mesmo com RLS ligado, tira o GRANT direto das roles anon/authenticated.
DO $$
BEGIN
  IF to_regclass('public.contacts_backup_20260701') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.contacts_backup_20260701 FROM anon, authenticated';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Function Search Path Mutable — 3 funções SECURITY INVOKER sem search_path fixo.
--    Risco baixo (invoker), fix trivial e inofensivo. Guardado por to_regprocedure
--    para não falhar se a assinatura não existir no ambiente-alvo.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.whatsapp_phone_match_key(text)') IS NOT NULL THEN
    ALTER FUNCTION public.whatsapp_phone_match_key(text) SET search_path = public;
  END IF;

  IF to_regprocedure('public.auto_assign_workspace()') IS NOT NULL THEN
    ALTER FUNCTION public.auto_assign_workspace() SET search_path = public;
  END IF;

  IF to_regprocedure('public.sync_conversation_hidden_flag()') IS NOT NULL THEN
    ALTER FUNCTION public.sync_conversation_hidden_flag() SET search_path = public;
  END IF;
END $$;
