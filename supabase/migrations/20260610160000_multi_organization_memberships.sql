CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'agent',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

INSERT INTO public.organization_members (organization_id, user_id, role, created_at)
SELECT
  p.organization_id,
  p.user_id,
  COALESCE(ur.role, 'agent'::public.app_role),
  p.created_at
FROM public.profiles p
LEFT JOIN public.user_roles ur
  ON ur.user_id = p.user_id
 AND ur.organization_id = p.organization_id
ON CONFLICT (organization_id, user_id) DO UPDATE
SET role = EXCLUDED.role;

CREATE OR REPLACE FUNCTION public.user_is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.user_id = _user_id
      AND om.organization_id = _org_id
  )
$$;

CREATE OR REPLACE FUNCTION public.user_org_role(_user_id uuid, _org_id uuid)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.role
  FROM public.organization_members om
  WHERE om.user_id = _user_id
    AND om.organization_id = _org_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.user_can_manage_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.user_org_role(_user_id, _org_id) IN ('owner'::public.app_role, 'admin'::public.app_role, 'platform_admin'::public.app_role), false)
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_org_role(_user_id, _org_id) = _role
$$;

CREATE OR REPLACE FUNCTION public.user_has_workspace_access(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = _workspace_id
      AND (
        public.user_can_manage_org(_user_id, w.organization_id)
        OR EXISTS (
          SELECT 1
          FROM public.workspace_members wm
          WHERE wm.user_id = _user_id
            AND wm.workspace_id = w.id
        )
      )
  )
$$;

DROP POLICY IF EXISTS "Organization members can view organizations" ON public.organizations;
CREATE POLICY "Organization members can view organizations"
ON public.organizations
FOR SELECT
USING (public.user_is_org_member(auth.uid(), id));

DROP POLICY IF EXISTS "Organization owners and admins can update organizations" ON public.organizations;
CREATE POLICY "Organization owners and admins can update organizations"
ON public.organizations
FOR UPDATE
USING (public.user_can_manage_org(auth.uid(), id))
WITH CHECK (public.user_can_manage_org(auth.uid(), id));

DROP POLICY IF EXISTS "Users can view own organization memberships" ON public.organization_members;
CREATE POLICY "Users can view own organization memberships"
ON public.organization_members
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Organization managers can view organization memberships" ON public.organization_members;
CREATE POLICY "Organization managers can view organization memberships"
ON public.organization_members
FOR SELECT
USING (public.user_can_manage_org(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Organization owners and admins manage organization memberships" ON public.organization_members;
CREATE POLICY "Organization owners and admins manage organization memberships"
ON public.organization_members
FOR ALL
USING (public.user_can_manage_org(auth.uid(), organization_id))
WITH CHECK (public.user_can_manage_org(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Organization members can view workspaces" ON public.workspaces;
CREATE POLICY "Organization members can view workspaces"
ON public.workspaces
FOR SELECT
USING (public.user_is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Organization owners and admins manage workspaces" ON public.workspaces;
CREATE POLICY "Organization owners and admins manage workspaces"
ON public.workspaces
FOR ALL
USING (public.user_can_manage_org(auth.uid(), organization_id))
WITH CHECK (public.user_can_manage_org(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Organization managers can view workspace members" ON public.workspace_members;
CREATE POLICY "Organization managers can view workspace members"
ON public.workspace_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = workspace_members.workspace_id
      AND public.user_can_manage_org(auth.uid(), w.organization_id)
  )
);

DROP POLICY IF EXISTS "Workspace members can view same workspace memberships" ON public.workspace_members;
CREATE POLICY "Workspace members can view same workspace memberships"
ON public.workspace_members
FOR SELECT
USING (public.user_has_workspace_access(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "Organization owners and admins manage workspace members" ON public.workspace_members;
CREATE POLICY "Organization owners and admins manage workspace members"
ON public.workspace_members
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = workspace_members.workspace_id
      AND public.user_can_manage_org(auth.uid(), w.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = workspace_members.workspace_id
      AND public.user_can_manage_org(auth.uid(), w.organization_id)
  )
);

DROP POLICY IF EXISTS "Organization members can view organization plan" ON public.organization_plans;
CREATE POLICY "Organization members can view organization plan"
ON public.organization_plans
FOR SELECT
USING (public.user_is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Organization members can view profiles in their organizations" ON public.profiles;
CREATE POLICY "Organization members can view profiles in their organizations"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members viewer
    JOIN public.organization_members target
      ON target.organization_id = viewer.organization_id
    WHERE viewer.user_id = auth.uid()
      AND target.user_id = profiles.user_id
  )
);

CREATE OR REPLACE FUNCTION public.sync_organization_member_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organization_members (organization_id, user_id, role, created_at)
  VALUES (NEW.organization_id, NEW.user_id, NEW.role, COALESCE(NEW.created_at, now()))
  ON CONFLICT (organization_id, user_id) DO UPDATE
  SET role = EXCLUDED.role,
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_organization_member_role_trigger ON public.user_roles;
CREATE TRIGGER sync_organization_member_role_trigger
AFTER INSERT OR UPDATE OF role, organization_id, user_id
ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_member_role();
