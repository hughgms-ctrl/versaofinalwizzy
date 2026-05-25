-- Allow users to delete messages from their organization's conversations
CREATE POLICY "Users can delete messages from their org conversations"
ON public.messages
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
    AND c.organization_id = get_user_org_id(auth.uid())
  )
);

-- Allow users to delete conversations in their organization
CREATE POLICY "Users can delete conversations in their organization"
ON public.conversations
FOR DELETE
USING (
  organization_id = get_user_org_id(auth.uid())
  AND (source_phone IS NULL OR source_phone = get_active_phone_number(organization_id))
);