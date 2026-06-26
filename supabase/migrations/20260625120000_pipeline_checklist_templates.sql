-- Pipeline checklist templates (modelos reutilizáveis) + mapeamento de
-- checklist automático por coluna. Antes ficavam só no localStorage do
-- navegador, então não sincronizavam entre máquinas/usuários. Agora vivem no
-- banco, compartilhados por workspace.

-- Modelos de checklist reutilizáveis, por workspace.
CREATE TABLE IF NOT EXISTS public.pipeline_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Mapeamento "ao entrar nesta coluna, aplique este modelo", por workspace.
CREATE TABLE IF NOT EXISTS public.pipeline_column_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES public.pipeline_columns(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.pipeline_checklist_templates(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, column_id)
);

ALTER TABLE public.pipeline_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_column_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Checklist templates workspace access" ON public.pipeline_checklist_templates;
CREATE POLICY "Checklist templates workspace access"
  ON public.pipeline_checklist_templates
  FOR ALL
  USING (workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "Column checklists workspace access" ON public.pipeline_column_checklists;
CREATE POLICY "Column checklists workspace access"
  ON public.pipeline_column_checklists
  FOR ALL
  USING (workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), workspace_id));

CREATE INDEX IF NOT EXISTS idx_pipeline_checklist_templates_workspace
  ON public.pipeline_checklist_templates(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_column_checklists_pipeline
  ON public.pipeline_column_checklists(pipeline_id);
