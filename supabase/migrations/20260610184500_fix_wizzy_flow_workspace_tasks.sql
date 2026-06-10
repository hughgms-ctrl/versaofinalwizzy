-- Keep Wizzy Flow tasks attached to their workspace and make common Flow/Sign
-- list queries cheaper after the organization/workspace access migration.

DO $$
BEGIN
  IF to_regclass('public.tasks') IS NOT NULL AND to_regclass('public.projects') IS NOT NULL THEN
    UPDATE public.tasks t
    SET workspace_id = p.workspace_id
    FROM public.projects p
    WHERE t.project_id = p.id
      AND t.workspace_id IS NULL
      AND p.workspace_id IS NOT NULL;
  END IF;

  IF to_regclass('public.task_processes') IS NOT NULL
    AND to_regclass('public.tasks') IS NOT NULL
    AND to_regclass('public.projects') IS NOT NULL
  THEN
    DROP POLICY IF EXISTS "Wizzy Flow workspace task processes access" ON public.task_processes;

    CREATE POLICY "Wizzy Flow workspace task processes access"
      ON public.task_processes
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.tasks t
          LEFT JOIN public.projects p ON p.id = t.project_id
          WHERE t.id = task_processes.task_id
            AND (
              (
                t.workspace_id IS NOT NULL
                AND public.user_has_workspace_access(auth.uid(), t.workspace_id)
              )
              OR (
                p.workspace_id IS NOT NULL
                AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
              )
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.tasks t
          LEFT JOIN public.projects p ON p.id = t.project_id
          WHERE t.id = task_processes.task_id
            AND (
              (
                t.workspace_id IS NOT NULL
                AND public.user_has_workspace_access(auth.uid(), t.workspace_id)
              )
              OR (
                p.workspace_id IS NOT NULL
                AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
              )
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.projects') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_projects_workspace_created
      ON public.projects(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_projects_workspace_state
      ON public.projects(workspace_id, archived, is_draft, is_standalone_folder);
  END IF;

  IF to_regclass('public.tasks') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tasks_workspace_created
      ON public.tasks(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_created
      ON public.tasks(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_workspace_assigned
      ON public.tasks(workspace_id, assigned_to);
    CREATE INDEX IF NOT EXISTS idx_tasks_workspace_due_open
      ON public.tasks(workspace_id, due_date)
      WHERE status IS DISTINCT FROM 'completed';
  END IF;

  IF to_regclass('public.task_assignees') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_task_assignees_user_task
      ON public.task_assignees(user_id, task_id);
    CREATE INDEX IF NOT EXISTS idx_task_assignees_task_user
      ON public.task_assignees(task_id, user_id);
  END IF;

  IF to_regclass('public.subtasks') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_subtasks_task_id
      ON public.subtasks(task_id);
  END IF;

  IF to_regclass('public.task_processes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_task_processes_task_id
      ON public.task_processes(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_processes_process_id
      ON public.task_processes(process_id);
  END IF;

  IF to_regclass('public.task_attachments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id
      ON public.task_attachments(task_id);
  END IF;

  IF to_regclass('public.process_documentation') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_process_documentation_workspace_title
      ON public.process_documentation(workspace_id, title);
  END IF;

  IF to_regclass('public.document_signatures') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_document_signatures_org_created
      ON public.document_signatures(organization_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_document_signatures_org_archived_created
      ON public.document_signatures(organization_id, archived_at, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_document_signatures_generated_document
      ON public.document_signatures(generated_document_id);
  END IF;

  IF to_regclass('public.generated_documents') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_generated_documents_org_created
      ON public.generated_documents(organization_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generated_documents_org_status_created
      ON public.generated_documents(organization_id, status, created_at DESC);
  END IF;
END $$;
