-- Conversations have one owner workspace. The workspace_ids array caused
-- schema-cache errors and made routing ambiguous for shared WhatsApp numbers.

ALTER TABLE public.conversations
  DROP COLUMN IF EXISTS workspace_ids;
