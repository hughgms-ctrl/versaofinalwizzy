DO $$
BEGIN
  IF to_regclass('public.conversations') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_conversations_org_workspace_last_message
      ON public.conversations(organization_id, workspace_id, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_org_status_last_message
      ON public.conversations(organization_id, status, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_org_instance_contact
      ON public.conversations(organization_id, whatsapp_instance_id, contact_id);
  END IF;

  IF to_regclass('public.messages') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_desc
      ON public.messages(conversation_id, created_at DESC);
  END IF;

  IF to_regclass('public.contact_presence') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_contact_presence_org_contact
      ON public.contact_presence(organization_id, contact_id);
  END IF;

  IF to_regclass('public.flows') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_flows_org_position_updated
      ON public.flows(organization_id, position, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_flows_org_visible_active
      ON public.flows(organization_id, visible_in_chat, is_active);
  END IF;

  IF to_regclass('public.document_templates') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_document_templates_org_created
      ON public.document_templates(organization_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_document_templates_org_folder_created
      ON public.document_templates(organization_id, folder_id, created_at DESC);
  END IF;
END $$;
