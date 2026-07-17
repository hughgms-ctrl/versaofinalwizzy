-- workspace_members estava faltando as colunas role/invited_by que o frontend do
-- Wizzy Flow espera (Gestão de Equipe, convite de membro, diálogos de atribuição de
-- responsável). Sem essas colunas, toda query que selecionava "role" falhava com
-- "column does not exist" e a Equipe aparecia vazia mesmo havendo membros reais no
-- workspace.
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'membro',
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.workspace_members
  DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_role_check CHECK (role IN ('admin', 'gestor', 'membro'));

-- Donos/admins/platform_admins de organização têm acesso implícito a todos os
-- workspaces da organização (ver user_has_workspace_access), mas isso não bastava
-- para aparecerem na Equipe de cada workspace, que lê workspace_members
-- diretamente. Preenche a linha explícita que faltava para esses usuários em todos
-- os workspaces de suas organizações.
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT w.id, om.user_id, 'admin'
FROM public.workspaces w
JOIN public.organization_members om ON om.organization_id = w.organization_id
WHERE om.role IN ('owner', 'admin', 'platform_admin')
ON CONFLICT (workspace_id, user_id) DO NOTHING;
