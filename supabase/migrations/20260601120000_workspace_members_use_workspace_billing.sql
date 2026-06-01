CREATE OR REPLACE FUNCTION public.user_is_workspace_member(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.user_id = _user_id
      AND wm.workspace_id = _workspace_id
  )
$$;

CREATE OR REPLACE FUNCTION public.user_has_workspace_org_access(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_org_id(_user_id) = _org_id
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      JOIN public.workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = _user_id
        AND w.organization_id = _org_id
        AND w.is_active = true
    )
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workspaces'
      AND policyname = 'Workspace members can view own workspaces'
  ) THEN
    CREATE POLICY "Workspace members can view own workspaces"
      ON public.workspaces
      FOR SELECT
      USING (public.user_is_workspace_member(auth.uid(), id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workspace_members'
      AND policyname = 'Users can view own workspace membership rows'
  ) THEN
    CREATE POLICY "Users can view own workspace membership rows"
      ON public.workspace_members
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Users can view own roles'
  ) THEN
    CREATE POLICY "Users can view own roles"
      ON public.user_roles
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_plans'
      AND policyname = 'Workspace members can view workspace organization plan'
  ) THEN
    CREATE POLICY "Workspace members can view workspace organization plan"
      ON public.organization_plans
      FOR SELECT
      USING (public.user_has_workspace_org_access(auth.uid(), organization_id));
  END IF;
END $$;
