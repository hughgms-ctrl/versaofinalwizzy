-- Fix (plano-seguranca-storage-buckets, Fase 2 piloto task-files):
-- As 4 policies criadas em 20260710120000 referenciavam `name` SEM qualificar
-- dentro de um EXISTS que faz `LEFT JOIN public.projects p`. Como `projects` tem
-- coluna `name`, o Postgres resolveu o `name` não-qualificado para `projects.name`
-- em vez de `storage.objects.name`. Efeito: `storage.foldername(projects.name)`
-- (o nome do PROJETO) nunca bate com o task_id do caminho `<task_id>/arquivo` →
-- o EXISTS sempre dá falso → 403 (RLS) em TODO upload E leitura de task-files.
--
-- Correção: qualificar como `objects.name` (a linha da própria storage.objects) e
-- mover o `projects` para uma subquery ANINHADA, tirando `projects.name` do escopo
-- do FROM que avalia o caminho. Mesma lógica de acesso (workspace da task OU do
-- projeto), agora com a referência de caminho correta.

DROP POLICY IF EXISTS "Wizzy Flow task-files select" ON storage.objects;
DROP POLICY IF EXISTS "Wizzy Flow task-files insert" ON storage.objects;
DROP POLICY IF EXISTS "Wizzy Flow task-files update" ON storage.objects;
DROP POLICY IF EXISTS "Wizzy Flow task-files delete" ON storage.objects;

-- SELECT (assinar/ler)
CREATE POLICY "Wizzy Flow task-files select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'task-files'
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id::text = (storage.foldername(objects.name))[1]
      AND (
        (t.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), t.workspace_id))
        OR EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = t.project_id
            AND p.workspace_id IS NOT NULL
            AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
        )
      )
  )
);

-- INSERT (upload)
CREATE POLICY "Wizzy Flow task-files insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-files'
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id::text = (storage.foldername(objects.name))[1]
      AND (
        (t.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), t.workspace_id))
        OR EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = t.project_id
            AND p.workspace_id IS NOT NULL
            AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
        )
      )
  )
);

-- UPDATE (upsert)
CREATE POLICY "Wizzy Flow task-files update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'task-files'
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id::text = (storage.foldername(objects.name))[1]
      AND (
        (t.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), t.workspace_id))
        OR EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = t.project_id
            AND p.workspace_id IS NOT NULL
            AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
        )
      )
  )
);

-- DELETE
CREATE POLICY "Wizzy Flow task-files delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'task-files'
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id::text = (storage.foldername(objects.name))[1]
      AND (
        (t.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), t.workspace_id))
        OR EXISTS (
          SELECT 1 FROM public.projects p
          WHERE p.id = t.project_id
            AND p.workspace_id IS NOT NULL
            AND public.user_has_workspace_access(auth.uid(), p.workspace_id)
        )
      )
  )
);
