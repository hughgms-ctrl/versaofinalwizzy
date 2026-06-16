-- FASE 3A — Desnormalizar a direção da última mensagem em conversations.
-- Objetivo: eliminar o OOM em `auto-close-conversations`, que hoje carrega o
-- histórico inteiro de mensagens de até 500 conversas só para descobrir a
-- direção da última. Com a coluna mantida por trigger, o fechamento vira um
-- único UPDATE sem tocar em `messages`.
--
-- Aplicação: MANUAL no SQL Editor do Supabase (regra de deploy Lovable —
-- NÃO rodar `supabase db push`). Rodar o arquivo inteiro de uma vez (é
-- transacional; não usa CREATE INDEX CONCURRENTLY).

BEGIN;

-- 1. Coluna desnormalizada.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_message_direction text;

-- 2. Trigger que mantém a coluna em sincronia a cada nova mensagem.
--    Só sobrescreve quando a mensagem inserida é, de fato, a mais recente
--    (NEW.created_at >= last_message_at vigente). Isso protege contra
--    importações de histórico (`import-whatsapp-history`, `zapi-load-older-messages`),
--    que inserem mensagens ANTIGAS e não devem alterar a "última direção".
CREATE OR REPLACE FUNCTION public.sync_conversation_last_message_direction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
     SET last_message_direction = NEW.direction
   WHERE id = NEW.conversation_id
     AND NEW.created_at >= COALESCE(last_message_at, '-infinity'::timestamptz);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_last_message_direction ON public.messages;
CREATE TRIGGER trg_sync_last_message_direction
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.sync_conversation_last_message_direction();

-- 3. Backfill único: preenche a direção da última mensagem para conversas já
--    existentes. Usa o índice (conversation_id, created_at) criado na Fase 2.
UPDATE public.conversations c
   SET last_message_direction = (
     SELECT m.direction
     FROM public.messages m
     WHERE m.conversation_id = c.id
     ORDER BY m.created_at DESC
     LIMIT 1
   )
 WHERE EXISTS (
   SELECT 1 FROM public.messages m2 WHERE m2.conversation_id = c.id
 );

COMMIT;
