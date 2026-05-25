-- Tabela para guardar a configuração do funil de cada workspace
CREATE TABLE public.workspace_funnel_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  column_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Garante uma config por (org, workspace) — workspace_id NULL = "todos os workspaces"
CREATE UNIQUE INDEX workspace_funnel_configs_unique_scope
  ON public.workspace_funnel_configs (organization_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE public.workspace_funnel_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users in org can view funnel configs"
ON public.workspace_funnel_configs FOR SELECT
USING (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users in org can insert funnel configs"
ON public.workspace_funnel_configs FOR INSERT
WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users in org can update funnel configs"
ON public.workspace_funnel_configs FOR UPDATE
USING (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users in org can delete funnel configs"
ON public.workspace_funnel_configs FOR DELETE
USING (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE TRIGGER update_workspace_funnel_configs_updated_at
BEFORE UPDATE ON public.workspace_funnel_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();