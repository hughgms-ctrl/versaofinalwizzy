-- Permitir agendamento de mensagens para grupos de WhatsApp.
-- 'group'  -> um único grupo (group_jids com 1 item)
-- 'groups' -> envio em massa para vários grupos (group_jids com N itens)
ALTER TABLE public.scheduled_messages
  DROP CONSTRAINT IF EXISTS scheduled_messages_target_type_check;

ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT scheduled_messages_target_type_check
  CHECK (target_type IN ('single', 'tag', 'manual', 'group', 'groups'));

-- JIDs dos grupos alvo (ex: ["120363...@g.us", ...])
ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS group_jids JSONB NOT NULL DEFAULT '[]';
