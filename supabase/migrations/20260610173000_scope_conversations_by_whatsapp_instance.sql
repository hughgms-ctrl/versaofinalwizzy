-- A contact can have separate conversations with different company WhatsApp numbers.
-- Keep uniqueness scoped by organization and receiving WhatsApp instance instead of
-- collapsing every conversation for the same contact into one row.
DROP INDEX IF EXISTS public.idx_conversations_contact_org_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_contact_org_instance_unique
ON public.conversations (
  contact_id,
  organization_id,
  COALESCE(whatsapp_instance_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE INDEX IF NOT EXISTS idx_conversations_org_contact_instance
ON public.conversations (organization_id, contact_id, whatsapp_instance_id);
