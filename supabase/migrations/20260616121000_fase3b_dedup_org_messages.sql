-- FASE 3B — Dedup de mensagens no banco (em vez de carregar tudo no worker).
-- `zapi-cleanup` carregava TODAS as mensagens da org (sem limite) e deduplicava
-- em memória via Map (risco de OOM). Esta RPC faz o dedup em um único DELETE,
-- escopado por organização, mantendo a 1ª cópia de cada (conversation_id,
-- zapi_message_id) — o mesmo par usado como chave de upsert na ingestão.
--
-- Aplicação: MANUAL no SQL Editor do Supabase (regra de deploy Lovable).

CREATE OR REPLACE FUNCTION public.dedup_org_messages(_organization_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH del AS (
    DELETE FROM public.messages a
    USING public.messages b
    WHERE a.conversation_id = b.conversation_id
      AND a.zapi_message_id = b.zapi_message_id
      AND a.zapi_message_id IS NOT NULL
      AND a.ctid > b.ctid
      AND a.conversation_id IN (
        SELECT id FROM public.conversations WHERE organization_id = _organization_id
      )
    RETURNING a.id
  )
  SELECT count(*) INTO deleted_count FROM del;
  RETURN deleted_count;
END;
$$;

-- Apenas service role / definer executa esta limpeza administrativa.
REVOKE ALL ON FUNCTION public.dedup_org_messages(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dedup_org_messages(uuid) FROM anon, authenticated;
