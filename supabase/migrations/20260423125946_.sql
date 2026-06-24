-- 1. Add closed_at column to conversations (NULL = not closed)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_conversations_closed_at
  ON public.conversations (organization_id, closed_at);

-- 2. Add auto_close_hours to organizations (default 24h, 0 = disabled)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS auto_close_hours integer NOT NULL DEFAULT 24;

-- 3. Trigger function: when a new inbound message arrives in a closed conversation,
-- reopen it (set status='open' and clear closed_at).
CREATE OR REPLACE FUNCTION public.reopen_conversation_on_inbound()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE public.conversations
    SET status = 'open',
        closed_at = NULL,
        updated_at = now()
    WHERE id = NEW.conversation_id
      AND status = 'closed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reopen_conversation_on_inbound ON public.messages;
CREATE TRIGGER trg_reopen_conversation_on_inbound
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.reopen_conversation_on_inbound();;
