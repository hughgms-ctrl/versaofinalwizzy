-- Allow authenticated users to view campaign_queue items in their organization
CREATE POLICY "Users can view campaign queue in their org"
ON public.campaign_queue
FOR SELECT
TO authenticated
USING (organization_id = get_user_org_id(auth.uid()));