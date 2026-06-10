-- Base schema for Wizzy Flow. Some later migrations/policies assumed these
-- tables already existed; keep this idempotent for environments created from
-- the merged product repository.

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text DEFAULT 'active',
  color text,
  start_date date,
  end_date date,
  archived boolean NOT NULL DEFAULT false,
  is_template boolean NOT NULL DEFAULT false,
  is_standalone_folder boolean NOT NULL DEFAULT false,
  is_draft boolean NOT NULL DEFAULT false,
  pending_notifications boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  invited_by uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.project_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.process_documentation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  area text NOT NULL DEFAULT 'Geral',
  content text NOT NULL DEFAULT '',
  objective text,
  responsible text,
  approver text,
  frequency text,
  materials text,
  tools text,
  steps text,
  checklist text,
  observations text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.positions(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  recurrence_type text NOT NULL DEFAULT 'daily',
  recurrence_config jsonb,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recurring_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.positions(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  process_id uuid REFERENCES public.process_documentation(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  priority text,
  recurrence_type text NOT NULL DEFAULT 'daily',
  recurrence_config jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  routine_id uuid REFERENCES public.routines(id) ON DELETE SET NULL,
  recurring_task_id uuid REFERENCES public.recurring_tasks(id) ON DELETE SET NULL,
  process_id uuid REFERENCES public.process_documentation(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  documentation text,
  status text DEFAULT 'todo',
  priority text,
  setor text,
  assigned_to uuid,
  due_date date,
  start_date date,
  task_order integer DEFAULT 0,
  completed_verified boolean DEFAULT false,
  requires_approval boolean DEFAULT false,
  approval_status text,
  approval_reviewer_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  completed boolean DEFAULT false,
  subtask_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.task_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  process_id uuid NOT NULL REFERENCES public.process_documentation(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(task_id, process_id)
);

CREATE TABLE IF NOT EXISTS public.task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.routine_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id uuid NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  process_id uuid REFERENCES public.process_documentation(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  documentation text,
  status text DEFAULT 'todo',
  priority text,
  setor text,
  assigned_to uuid,
  start_date date,
  task_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.routine_task_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_task_id uuid NOT NULL REFERENCES public.routine_tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  completed boolean DEFAULT false,
  subtask_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.template_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  documentation text,
  priority text,
  setor text,
  process_id uuid REFERENCES public.process_documentation(id) ON DELETE SET NULL,
  task_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.template_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_task_id uuid NOT NULL REFERENCES public.template_tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  task_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.template_task_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_task_id uuid NOT NULL REFERENCES public.template_tasks(id) ON DELETE CASCADE,
  process_id uuid NOT NULL REFERENCES public.process_documentation(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_task_id, process_id)
);

CREATE TABLE IF NOT EXISTS public.template_task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_task_id uuid NOT NULL REFERENCES public.template_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_task_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.external_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_external_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.external_participants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, participant_id)
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_documentation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_task_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_task_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_external_assignees ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_table text;
BEGIN
  FOREACH policy_table IN ARRAY ARRAY[
    'projects',
    'project_templates',
    'positions',
    'process_documentation',
    'routines',
    'recurring_tasks',
    'external_participants'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = policy_table
        AND policyname = 'Wizzy Flow workspace row access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Wizzy Flow workspace row access" ON public.%I FOR ALL USING (workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), workspace_id)) WITH CHECK (workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), workspace_id))',
        policy_table
      );
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Wizzy Flow project members access" ON public.project_members;
CREATE POLICY "Wizzy Flow project members access"
  ON public.project_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_members.project_id
        AND p.workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_members.project_id
        AND p.workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Wizzy Flow tasks access" ON public.tasks;
CREATE POLICY "Wizzy Flow tasks access"
  ON public.tasks
  FOR ALL
  USING (
    (workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), workspace_id))
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tasks.project_id
        AND p.workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
    )
  )
  WITH CHECK (
    (workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), workspace_id))
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tasks.project_id
        AND p.workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
    )
  );

DO $$
DECLARE
  policy_target text[];
BEGIN
  FOREACH policy_target SLICE 1 IN ARRAY ARRAY[
    ARRAY['subtasks', 'task_id'],
    ARRAY['task_assignees', 'task_id'],
    ARRAY['task_processes', 'task_id'],
    ARRAY['task_attachments', 'task_id'],
    ARRAY['task_external_assignees', 'task_id']
  ]::text[][] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Wizzy Flow task child access" ON public.%I', policy_target[1]);
    EXECUTE format(
      'CREATE POLICY "Wizzy Flow task child access" ON public.%I FOR ALL USING (EXISTS (SELECT 1 FROM public.tasks t LEFT JOIN public.projects p ON p.id = t.project_id WHERE t.id = %I.%I AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), t.workspace_id)) OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), p.workspace_id))))) WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t LEFT JOIN public.projects p ON p.id = t.project_id WHERE t.id = %I.%I AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), t.workspace_id)) OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), p.workspace_id)))))',
      policy_target[1],
      policy_target[1],
      policy_target[2],
      policy_target[1],
      policy_target[2]
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Wizzy Flow routine tasks access" ON public.routine_tasks;
CREATE POLICY "Wizzy Flow routine tasks access"
  ON public.routine_tasks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.routines r
      WHERE r.id = routine_tasks.routine_id
        AND r.workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), r.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.routines r
      WHERE r.id = routine_tasks.routine_id
        AND r.workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), r.workspace_id)
    )
  );

DROP POLICY IF EXISTS "Wizzy Flow routine subtasks access" ON public.routine_task_subtasks;
CREATE POLICY "Wizzy Flow routine subtasks access"
  ON public.routine_task_subtasks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.routine_tasks rt
      JOIN public.routines r ON r.id = rt.routine_id
      WHERE rt.id = routine_task_subtasks.routine_task_id
        AND r.workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), r.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.routine_tasks rt
      JOIN public.routines r ON r.id = rt.routine_id
      WHERE rt.id = routine_task_subtasks.routine_task_id
        AND r.workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), r.workspace_id)
    )
  );

DO $$
DECLARE
  policy_target text[];
BEGIN
  FOREACH policy_target SLICE 1 IN ARRAY ARRAY[
    ARRAY['template_tasks', 'template_id'],
    ARRAY['template_subtasks', 'template_task_id'],
    ARRAY['template_task_processes', 'template_task_id'],
    ARRAY['template_task_assignees', 'template_task_id']
  ]::text[][] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Wizzy Flow template child access" ON public.%I', policy_target[1]);
    IF policy_target[1] = 'template_tasks' THEN
      EXECUTE 'CREATE POLICY "Wizzy Flow template child access" ON public.template_tasks FOR ALL USING (EXISTS (SELECT 1 FROM public.project_templates pt WHERE pt.id = template_tasks.template_id AND pt.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), pt.workspace_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.project_templates pt WHERE pt.id = template_tasks.template_id AND pt.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), pt.workspace_id)))';
    ELSE
      EXECUTE format(
        'CREATE POLICY "Wizzy Flow template child access" ON public.%I FOR ALL USING (EXISTS (SELECT 1 FROM public.template_tasks tt JOIN public.project_templates pt ON pt.id = tt.template_id WHERE tt.id = %I.%I AND pt.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), pt.workspace_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.template_tasks tt JOIN public.project_templates pt ON pt.id = tt.template_id WHERE tt.id = %I.%I AND pt.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), pt.workspace_id)))',
        policy_target[1],
        policy_target[1],
        policy_target[2],
        policy_target[1],
        policy_target[2]
      );
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_workspace_created ON public.projects(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_created ON public.tasks(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_project_created ON public.tasks(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task_user ON public.task_assignees(task_id, user_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_order ON public.subtasks(task_id, subtask_order);
CREATE INDEX IF NOT EXISTS idx_project_templates_workspace_created ON public.project_templates(workspace_id, created_at DESC);
