-- =============================================================================
-- FASE 1B — RLS: envolver auth.uid() em subquery escalar (InitPlan) — LOTE 2
-- =============================================================================
-- Mesma mudança mecânica do Lote 1: trocar auth.uid() "nu" por (select auth.uid())
-- em cada predicado. SEMANTICAMENTE IDÊNTICO — recriamos cada política vigente
-- preservando nome, comando, roles, USING e WITH CHECK exatamente como estão.
--
-- LOTE 2 (tarefas/casos): tasks, subtasks, task_assignees, task_processes,
-- task_attachments, case_tasks, cases.
-- + as 4 políticas paralelas "by workspace" de contacts/conversations.
--
-- Cada tabela pode ter MAIS DE UMA política permissiva (RLS é OR das permissivas).
-- Todas as que usam auth.uid() nu foram convertidas — caso contrário o ganho na
-- tabela não é total (mesma lição do Lote 1 com as policies paralelas).
--
-- ⚠️ INVENTÁRIO CONFERIDO CONTRA pg_policies VIVO (2026-06-15), não só a fonte:
-- `tasks` e `task_assignees` têm SÓ uma política viva cada (as "workspace ..."
-- guardadas por NOT EXISTS nas migrations nunca foram criadas no banco) — por
-- isso só recriamos a que existe de fato.
--
-- Os helpers SECURITY DEFINER (user_has_workspace_access, get_user_org_id,
-- has_role) NÃO mudam — apenas a forma como recebem o uid.
--
-- DEPLOY: aplicar via fluxo Lovable / SQL Editor do Supabase. NÃO rodar
-- `supabase db push` (ver docs/PLANO_OTIMIZACAO.md, aviso de mecanismo de deploy).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- tasks  (1 política viva: "Wizzy Flow tasks access")
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Wizzy Flow tasks access" ON public.tasks;
CREATE POLICY "Wizzy Flow tasks access"
  ON public.tasks
  FOR ALL
  USING (
    (workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), workspace_id))
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tasks.project_id
        AND p.workspace_id IS NOT NULL
        AND public.user_has_workspace_access((select auth.uid()), p.workspace_id)
    )
  )
  WITH CHECK (
    (workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), workspace_id))
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = tasks.project_id
        AND p.workspace_id IS NOT NULL
        AND public.user_has_workspace_access((select auth.uid()), p.workspace_id)
    )
  );

-- -----------------------------------------------------------------------------
-- subtasks  (1 política: child access)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Wizzy Flow task child access" ON public.subtasks;
CREATE POLICY "Wizzy Flow task child access"
  ON public.subtasks
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = subtasks.task_id
      AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), t.workspace_id))
        OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), p.workspace_id)))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = subtasks.task_id
      AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), t.workspace_id))
        OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), p.workspace_id)))
  ));

-- -----------------------------------------------------------------------------
-- task_assignees  (1 política viva: child access)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Wizzy Flow task child access" ON public.task_assignees;
CREATE POLICY "Wizzy Flow task child access"
  ON public.task_assignees
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = task_assignees.task_id
      AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), t.workspace_id))
        OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), p.workspace_id)))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = task_assignees.task_id
      AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), t.workspace_id))
        OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), p.workspace_id)))
  ));

-- -----------------------------------------------------------------------------
-- task_processes  (2 políticas)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Wizzy Flow task child access" ON public.task_processes;
CREATE POLICY "Wizzy Flow task child access"
  ON public.task_processes
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = task_processes.task_id
      AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), t.workspace_id))
        OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), p.workspace_id)))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = task_processes.task_id
      AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), t.workspace_id))
        OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), p.workspace_id)))
  ));

DROP POLICY IF EXISTS "Wizzy Flow workspace task processes access" ON public.task_processes;
CREATE POLICY "Wizzy Flow workspace task processes access"
  ON public.task_processes
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = task_processes.task_id
      AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), t.workspace_id))
        OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), p.workspace_id)))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = task_processes.task_id
      AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), t.workspace_id))
        OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), p.workspace_id)))
  ));

-- -----------------------------------------------------------------------------
-- task_attachments  (1 política: child access)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Wizzy Flow task child access" ON public.task_attachments;
CREATE POLICY "Wizzy Flow task child access"
  ON public.task_attachments
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = task_attachments.task_id
      AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), t.workspace_id))
        OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), p.workspace_id)))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = task_attachments.task_id
      AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), t.workspace_id))
        OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), p.workspace_id)))
  ));

-- -----------------------------------------------------------------------------
-- cases  (2 políticas, FOR ALL TO authenticated)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "cases_admin_full_access" ON public.cases;
CREATE POLICY "cases_admin_full_access" ON public.cases
  FOR ALL TO authenticated
  USING (
    organization_id = public.get_user_org_id((select auth.uid()))
    AND (public.has_role((select auth.uid()), 'owner') OR public.has_role((select auth.uid()), 'admin'))
  )
  WITH CHECK (
    organization_id = public.get_user_org_id((select auth.uid()))
    AND (public.has_role((select auth.uid()), 'owner') OR public.has_role((select auth.uid()), 'admin'))
  );

DROP POLICY IF EXISTS "cases_member_workspace_access" ON public.cases;
CREATE POLICY "cases_member_workspace_access" ON public.cases
  FOR ALL TO authenticated
  USING (
    organization_id = public.get_user_org_id((select auth.uid()))
    AND (workspace_id IS NULL OR public.user_has_workspace_access((select auth.uid()), workspace_id))
  )
  WITH CHECK (
    organization_id = public.get_user_org_id((select auth.uid()))
    AND (workspace_id IS NULL OR public.user_has_workspace_access((select auth.uid()), workspace_id))
  );

-- -----------------------------------------------------------------------------
-- case_tasks  (1 política, FOR ALL TO authenticated)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "case_tasks_org_access" ON public.case_tasks;
CREATE POLICY "case_tasks_org_access" ON public.case_tasks
  FOR ALL TO authenticated
  USING (
    organization_id = public.get_user_org_id((select auth.uid()))
    AND EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id
                AND (public.has_role((select auth.uid()), 'owner') OR public.has_role((select auth.uid()), 'admin')
                     OR c.workspace_id IS NULL OR public.user_has_workspace_access((select auth.uid()), c.workspace_id)))
  )
  WITH CHECK (organization_id = public.get_user_org_id((select auth.uid())));

-- =============================================================================
-- Políticas paralelas "by workspace" de contacts/conversations
-- =============================================================================
-- Definições copiadas LITERALMENTE do pg_policies vivo (2026-06-15) — não há
-- registro delas no versionamento (criadas via Lovable/dashboard). Role {public}
-- (sem cláusula TO). As políticas "...in their organization" dessas tabelas JÁ
-- foram convertidas no Lote 1 — não são tocadas aqui.

-- -----------------------------------------------------------------------------
-- contacts
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage contacts by workspace" ON public.contacts;
CREATE POLICY "Users can manage contacts by workspace"
ON public.contacts FOR ALL
USING (
    organization_id = public.get_user_org_id((select auth.uid()))
    AND (workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), workspace_id))
)
WITH CHECK (
    organization_id = public.get_user_org_id((select auth.uid()))
    AND (workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), workspace_id))
);

DROP POLICY IF EXISTS "Users can view contacts by workspace" ON public.contacts;
CREATE POLICY "Users can view contacts by workspace"
ON public.contacts FOR SELECT
USING (
    organization_id = public.get_user_org_id((select auth.uid()))
    AND (workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), workspace_id))
);

-- -----------------------------------------------------------------------------
-- conversations
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage conversations by workspace" ON public.conversations;
CREATE POLICY "Users can manage conversations by workspace"
ON public.conversations FOR ALL
USING (
    organization_id = public.get_user_org_id((select auth.uid()))
    AND (workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), workspace_id))
)
WITH CHECK (
    organization_id = public.get_user_org_id((select auth.uid()))
    AND (workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), workspace_id))
);

DROP POLICY IF EXISTS "Users can view conversations by workspace" ON public.conversations;
CREATE POLICY "Users can view conversations by workspace"
ON public.conversations FOR SELECT
USING (
    organization_id = public.get_user_org_id((select auth.uid()))
    AND (workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), workspace_id))
);

