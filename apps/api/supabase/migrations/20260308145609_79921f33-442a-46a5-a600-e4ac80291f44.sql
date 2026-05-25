-- Allow admins and owners to update profiles of users in their organization
CREATE POLICY "Admins can update profiles in their org"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  organization_id = get_user_org_id(auth.uid())
  AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'))
);