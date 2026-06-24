-- FIX 1: has_role needs org scoping - create org-scoped version
CREATE OR REPLACE FUNCTION public.has_role_in_org(_user_id uuid, _role app_role, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND organization_id = _org_id
  )
$$;

-- FIX 2: Update integration_configs to use org-scoped check
DROP POLICY IF EXISTS "Admins can view integration configs" ON public.integration_configs;
CREATE POLICY "Admins can view integration configs" ON public.integration_configs
  FOR SELECT TO authenticated
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND (has_role_in_org(auth.uid(), 'owner'::app_role, organization_id) OR has_role_in_org(auth.uid(), 'admin'::app_role, organization_id))
  );

-- FIX 3: calendar_configs
DROP POLICY IF EXISTS "Admins can view calendar configs" ON public.calendar_configs;
CREATE POLICY "Admins can view calendar configs" ON public.calendar_configs
  FOR SELECT TO authenticated
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND (has_role_in_org(auth.uid(), 'owner'::app_role, organization_id) OR has_role_in_org(auth.uid(), 'admin'::app_role, organization_id))
  );

-- FIX 4: drive_configs
DROP POLICY IF EXISTS "Admins can view drive configs" ON public.drive_configs;
CREATE POLICY "Admins can view drive configs" ON public.drive_configs
  FOR SELECT TO authenticated
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND (has_role_in_org(auth.uid(), 'owner'::app_role, organization_id) OR has_role_in_org(auth.uid(), 'admin'::app_role, organization_id))
  );

-- FIX 5: whatsapp_instances SELECT
DROP POLICY IF EXISTS "Admins can view WhatsApp instances" ON public.whatsapp_instances;
CREATE POLICY "Admins can view WhatsApp instances" ON public.whatsapp_instances
  FOR SELECT TO authenticated
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND (has_role_in_org(auth.uid(), 'owner'::app_role, organization_id) OR has_role_in_org(auth.uid(), 'admin'::app_role, organization_id))
  );

-- FIX 6: whatsapp_instances INSERT - was wide open
DROP POLICY IF EXISTS "Users can insert whatsapp instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Admins can manage WhatsApp instance" ON public.whatsapp_instances;
CREATE POLICY "Admins can manage WhatsApp instances" ON public.whatsapp_instances
  FOR ALL TO authenticated
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND (has_role_in_org(auth.uid(), 'owner'::app_role, organization_id) OR has_role_in_org(auth.uid(), 'admin'::app_role, organization_id))
  )
  WITH CHECK (
    organization_id = get_user_org_id(auth.uid())
    AND (has_role_in_org(auth.uid(), 'owner'::app_role, organization_id) OR has_role_in_org(auth.uid(), 'admin'::app_role, organization_id))
  );

-- FIX 7: profiles INSERT - restrict org_id to user's own org
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      organization_id IS NULL
      OR organization_id = get_user_org_id(auth.uid())
      OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid())
    )
  );;
