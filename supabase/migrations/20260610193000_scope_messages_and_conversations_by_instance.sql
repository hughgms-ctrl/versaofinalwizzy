-- Conversations belong to the WhatsApp instance that received/sent the message.
-- Keep chats separated when the same contact talks to different company numbers.

WITH instance_workspaces AS (
  SELECT
    id AS workspace_id,
    organization_id,
    whatsapp_instance_id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, whatsapp_instance_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.workspaces
  WHERE whatsapp_instance_id IS NOT NULL
)
UPDATE public.conversations c
SET workspace_id = iw.workspace_id
FROM instance_workspaces iw
WHERE iw.rn = 1
  AND c.organization_id = iw.organization_id
  AND c.whatsapp_instance_id = iw.whatsapp_instance_id
  AND c.workspace_id IS DISTINCT FROM iw.workspace_id;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY conversation_id, zapi_message_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.messages
  WHERE zapi_message_id IS NOT NULL
)
DELETE FROM public.messages m
USING ranked r
WHERE m.id = r.id
  AND r.rn > 1;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_zapi_message_id_key;

DROP INDEX IF EXISTS public.messages_zapi_message_id_key;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_conversation_zapi_message_id_key
  UNIQUE (conversation_id, zapi_message_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_zapi_message_id
  ON public.messages(conversation_id, zapi_message_id);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_instance
  ON public.conversations(workspace_id, whatsapp_instance_id);
