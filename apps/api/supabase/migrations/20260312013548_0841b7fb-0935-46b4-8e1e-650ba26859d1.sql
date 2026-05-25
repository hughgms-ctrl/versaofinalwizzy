-- FIX 1: Privilege Escalation — is_platform_admin()
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
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
      AND role = 'platform_admin'
      AND organization_id IS NULL
  )
$$;

-- FIX 1b: Block org owners from inserting platform_admin role
DROP POLICY IF EXISTS "Owners can manage roles" ON public.user_roles;
CREATE POLICY "Owners can manage roles" ON public.user_roles
  FOR ALL
  TO authenticated
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND has_role(auth.uid(), 'owner'::app_role)
  )
  WITH CHECK (
    organization_id = get_user_org_id(auth.uid())
    AND has_role(auth.uid(), 'owner'::app_role)
    AND role != 'platform_admin'
  );

-- FIX 2: media_transcriptions — broken RLS
DROP POLICY IF EXISTS "Service role can manage transcriptions" ON public.media_transcriptions;
CREATE POLICY "Service role can manage transcriptions" ON public.media_transcriptions
  FOR ALL
  USING (auth.role() = 'service_role');

-- FIX 3: widget_submissions — broken RLS (PII exposed)
DROP POLICY IF EXISTS "Service role can manage submissions" ON public.widget_submissions;
CREATE POLICY "Service role can manage submissions" ON public.widget_submissions
  FOR ALL
  USING (auth.role() = 'service_role');

-- FIX 4: agent_execution_logs — broken RLS
DROP POLICY IF EXISTS "Service role can manage execution logs" ON public.agent_execution_logs;
CREATE POLICY "Service role can manage execution logs" ON public.agent_execution_logs
  FOR ALL
  USING (auth.role() = 'service_role');

-- FIX 5: integration_configs — restrict to admin/owner
DROP POLICY IF EXISTS "Users can view integration configs in their org" ON public.integration_configs;
CREATE POLICY "Admins can view integration configs" ON public.integration_configs
  FOR SELECT
  TO authenticated
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

-- FIX 6: calendar_configs — restrict OAuth tokens
DROP POLICY IF EXISTS "Users can view calendar configs in their org" ON public.calendar_configs;
CREATE POLICY "Admins can view calendar configs" ON public.calendar_configs
  FOR SELECT
  TO authenticated
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

-- FIX 7: drive_configs — restrict OAuth tokens
DROP POLICY IF EXISTS "Users can view drive configs in their org" ON public.drive_configs;
CREATE POLICY "Admins can view drive configs" ON public.drive_configs
  FOR SELECT
  TO authenticated
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

-- FIX 8: whatsapp_instances — restrict zapi_token
DROP POLICY IF EXISTS "Users can view their org WhatsApp instance" ON public.whatsapp_instances;
CREATE POLICY "Admins can view WhatsApp instances" ON public.whatsapp_instances
  FOR SELECT
  TO authenticated
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );