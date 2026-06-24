-- 1. Add control flags to platform_packages
ALTER TABLE public.platform_packages
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_clonable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_post_edit boolean NOT NULL DEFAULT true;

-- 2. Create workspace_templates table
CREATE TABLE IF NOT EXISTS public.workspace_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  icon text,
  color text,
  description text,
  master_prompt text,
  agents_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  flows_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  pipeline_template jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'scratch' CHECK (source IN ('scratch','workspace_export','cloned_from_package')),
  source_package_id uuid REFERENCES public.platform_packages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_templates_org ON public.workspace_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_workspace_templates_workspace ON public.workspace_templates(workspace_id);

-- 3. updated_at trigger
DROP TRIGGER IF EXISTS trg_workspace_templates_updated_at ON public.workspace_templates;
CREATE TRIGGER trg_workspace_templates_updated_at
  BEFORE UPDATE ON public.workspace_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Enable RLS
ALTER TABLE public.workspace_templates ENABLE ROW LEVEL SECURITY;

-- 5. Policies — only owner/admin of the owning org, and workspace must belong to same org
CREATE POLICY "Owners/admins view workspace templates in their org"
ON public.workspace_templates FOR SELECT
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR (
    public.user_belongs_to_org(auth.uid(), organization_id)
    AND (
      public.has_role_in_org(auth.uid(), 'owner', organization_id)
      OR public.has_role_in_org(auth.uid(), 'admin', organization_id)
    )
  )
);

CREATE POLICY "Owners/admins create workspace templates in their org"
ON public.workspace_templates FOR INSERT
TO authenticated
WITH CHECK (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (
    public.has_role_in_org(auth.uid(), 'owner', organization_id)
    OR public.has_role_in_org(auth.uid(), 'admin', organization_id)
  )
  AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workspace_id AND w.organization_id = workspace_templates.organization_id
  )
);

CREATE POLICY "Owners/admins update workspace templates in their org"
ON public.workspace_templates FOR UPDATE
TO authenticated
USING (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (
    public.has_role_in_org(auth.uid(), 'owner', organization_id)
    OR public.has_role_in_org(auth.uid(), 'admin', organization_id)
  )
);

CREATE POLICY "Owners/admins delete workspace templates in their org"
ON public.workspace_templates FOR DELETE
TO authenticated
USING (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (
    public.has_role_in_org(auth.uid(), 'owner', organization_id)
    OR public.has_role_in_org(auth.uid(), 'admin', organization_id)
  )
);

CREATE POLICY "Platform admins manage all workspace templates"
ON public.workspace_templates FOR ALL
TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));;
