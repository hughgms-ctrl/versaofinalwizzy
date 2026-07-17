-- O produto CRM já possui uma tabela public.user_permissions (escopo organization_id,
-- colunas can_access_conversations/pipeline/agents/etc). O Wizzy Flow, sem saber
-- disso, foi construído esperando uma tabela DIFERENTE de mesmo nome (escopo
-- workspace_id, colunas can_view_projects/can_edit_tasks/etc para as áreas do Wizzy
-- Flow). Como só pode existir uma tabela public.user_permissions, toda leitura/escrita
-- de permissões do Wizzy Flow batia na tabela errada e falhava (coluna workspace_id
-- não existe nessa tabela, por exemplo). Esta migration cria uma tabela própria para
-- o Wizzy Flow, sem mexer na tabela existente do CRM.
CREATE TABLE IF NOT EXISTS public.wizzy_flow_user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_view_projects boolean NOT NULL DEFAULT true,
  can_view_tasks boolean NOT NULL DEFAULT true,
  can_view_positions boolean NOT NULL DEFAULT true,
  can_view_analytics boolean NOT NULL DEFAULT false,
  can_view_briefings boolean NOT NULL DEFAULT true,
  can_view_culture boolean NOT NULL DEFAULT true,
  can_view_vision boolean NOT NULL DEFAULT true,
  can_view_processes boolean NOT NULL DEFAULT true,
  can_view_inventory boolean NOT NULL DEFAULT true,
  can_view_ai boolean NOT NULL DEFAULT true,
  can_view_workload boolean NOT NULL DEFAULT true,
  can_view_flows boolean NOT NULL DEFAULT false,
  can_view_notes boolean NOT NULL DEFAULT true,
  can_edit_projects boolean NOT NULL DEFAULT true,
  can_edit_tasks boolean NOT NULL DEFAULT true,
  can_edit_positions boolean NOT NULL DEFAULT true,
  can_edit_analytics boolean NOT NULL DEFAULT true,
  can_edit_briefings boolean NOT NULL DEFAULT true,
  can_edit_culture boolean NOT NULL DEFAULT true,
  can_edit_vision boolean NOT NULL DEFAULT true,
  can_edit_processes boolean NOT NULL DEFAULT true,
  can_edit_inventory boolean NOT NULL DEFAULT true,
  can_edit_flows boolean NOT NULL DEFAULT false,
  can_edit_notes boolean NOT NULL DEFAULT true,
  projects_only_assigned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wizzy_flow_user_permissions_workspace
  ON public.wizzy_flow_user_permissions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wizzy_flow_user_permissions_user
  ON public.wizzy_flow_user_permissions(user_id);

DROP TRIGGER IF EXISTS set_wizzy_flow_user_permissions_updated_at ON public.wizzy_flow_user_permissions;
CREATE TRIGGER set_wizzy_flow_user_permissions_updated_at
  BEFORE UPDATE ON public.wizzy_flow_user_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.wizzy_flow_user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wizzy Flow workspace row access" ON public.wizzy_flow_user_permissions;
CREATE POLICY "Wizzy Flow workspace row access" ON public.wizzy_flow_user_permissions
  FOR ALL TO public
  USING (public.user_has_workspace_access(auth.uid(), workspace_id))
  WITH CHECK (public.user_has_workspace_access(auth.uid(), workspace_id));
