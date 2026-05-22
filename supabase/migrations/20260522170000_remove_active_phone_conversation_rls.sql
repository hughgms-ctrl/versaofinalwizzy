-- Conversations must not disappear when WhatsApp provider/instance changes.
-- Tenant isolation is organization-based; source_phone is historical metadata,
-- not an access-control boundary.

DROP POLICY IF EXISTS "Users can view conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Users can manage conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Users can delete conversations in their organization" ON public.conversations;

CREATE POLICY "Users can view conversations in their organization"
ON public.conversations
FOR SELECT
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage conversations in their organization"
ON public.conversations
FOR ALL
USING (organization_id = public.get_user_org_id(auth.uid()))
WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can delete conversations in their organization"
ON public.conversations
FOR DELETE
USING (organization_id = public.get_user_org_id(auth.uid()));
