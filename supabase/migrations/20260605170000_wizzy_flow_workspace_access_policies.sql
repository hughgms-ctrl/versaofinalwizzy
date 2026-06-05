DO $$
BEGIN
  IF to_regclass('public.projects') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'projects'
      AND policyname = 'Wizzy Flow workspace projects access'
  ) THEN
    CREATE POLICY "Wizzy Flow workspace projects access"
      ON public.projects
      FOR ALL
      USING (
        workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), workspace_id)
      )
      WITH CHECK (
        workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), workspace_id)
      );
  END IF;

  IF to_regclass('public.tasks') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tasks'
      AND policyname = 'Wizzy Flow workspace tasks access'
  ) THEN
    CREATE POLICY "Wizzy Flow workspace tasks access"
      ON public.tasks
      FOR ALL
      USING (
        (
          workspace_id IS NOT NULL
          AND public.user_has_workspace_access(auth.uid(), workspace_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.projects p
          WHERE p.id = tasks.project_id
            AND p.workspace_id IS NOT NULL
            AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
        )
      )
      WITH CHECK (
        (
          workspace_id IS NOT NULL
          AND public.user_has_workspace_access(auth.uid(), workspace_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.projects p
          WHERE p.id = tasks.project_id
            AND p.workspace_id IS NOT NULL
            AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
        )
      );
  END IF;

  IF to_regclass('public.notes') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notes'
      AND policyname = 'Wizzy Flow workspace notes access'
  ) THEN
    CREATE POLICY "Wizzy Flow workspace notes access"
      ON public.notes
      FOR ALL
      USING (
        workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), workspace_id)
      )
      WITH CHECK (
        workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), workspace_id)
      );
  END IF;

  IF to_regclass('public.note_folders') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'note_folders'
      AND policyname = 'Wizzy Flow workspace note folders access'
  ) THEN
    CREATE POLICY "Wizzy Flow workspace note folders access"
      ON public.note_folders
      FOR ALL
      USING (
        workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), workspace_id)
      )
      WITH CHECK (
        workspace_id IS NOT NULL
        AND public.user_has_workspace_access(auth.uid(), workspace_id)
      );
  END IF;

  IF to_regclass('public.task_assignees') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'task_assignees'
      AND policyname = 'Wizzy Flow workspace task assignees access'
  ) THEN
    CREATE POLICY "Wizzy Flow workspace task assignees access"
      ON public.task_assignees
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.tasks t
          WHERE t.id = task_assignees.task_id
            AND (
              (
                t.workspace_id IS NOT NULL
                AND public.user_has_workspace_access(auth.uid(), t.workspace_id)
              )
              OR EXISTS (
                SELECT 1
                FROM public.projects p
                WHERE p.id = t.project_id
                  AND p.workspace_id IS NOT NULL
                  AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
              )
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.tasks t
          WHERE t.id = task_assignees.task_id
            AND (
              (
                t.workspace_id IS NOT NULL
                AND public.user_has_workspace_access(auth.uid(), t.workspace_id)
              )
              OR EXISTS (
                SELECT 1
                FROM public.projects p
                WHERE p.id = t.project_id
                  AND p.workspace_id IS NOT NULL
                  AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
              )
            )
        )
      );
  END IF;

  IF to_regclass('public.task_processes') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'task_processes'
      AND policyname = 'Wizzy Flow workspace task processes access'
  ) THEN
    CREATE POLICY "Wizzy Flow workspace task processes access"
      ON public.task_processes
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.tasks t
          WHERE t.id = task_processes.task_id
            AND t.workspace_id IS NOT NULL
            AND public.user_has_workspace_access(auth.uid(), t.workspace_id)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.tasks t
          WHERE t.id = task_processes.task_id
            AND t.workspace_id IS NOT NULL
            AND public.user_has_workspace_access(auth.uid(), t.workspace_id)
        )
      );
  END IF;
END $$;
