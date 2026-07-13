-- Fase 2 — PILOTO (plano-seguranca-storage-buckets): bucket `task-files` privado.
--
-- task-files é interno (anexos de tarefa): sem fetch externo do provedor de
-- WhatsApp, sem leitura pública não-autenticada. É o piloto mais seguro pra provar
-- o padrão "bucket privado + signed URL" antes de aplicar nos buckets de risco
-- (chat-media/contact-files).
--
-- Modelo de acesso: NÃO mudamos a convenção de path (segue `<task_id>/<arquivo>`),
-- então NENHUM arquivo existente precisa ser migrado. O escopo vem de um JOIN na
-- tabela `tasks` — o objeto (folder[1] = task_id) tem de pertencer a uma task cujo
-- workspace o usuário acessa. Espelha exatamente a policy de tabela
-- "Wizzy Flow task child access" (migration 20260610183000).
--
-- Leitura: o front deixa de usar getPublicUrl e passa a gerar signed URL
-- (createSignedUrl), autorizado pela policy SELECT abaixo. Arquivos antigos, cujo
-- file_url guardado é uma URL pública, continuam funcionando: o helper do front
-- extrai o path de dentro da URL e assina.
--
-- IMPORTANTE: esta migration e o deploy do FRONT novo têm de subir juntos —
-- ao virar public=false, as URLs públicas antigas param de resolver na hora.

-- Bucket privado (o bucket foi criado via painel = drift; versionamos aqui) -----
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-files', 'task-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Remove QUALQUER policy pré-existente de task-files (nomes desconhecidos por ser
-- drift) pra não deixar uma regra permissiva antiga furando o escopo por workspace.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (qual LIKE '%task-files%' OR with_check LIKE '%task-files%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- SELECT: assinar/ler só quem acessa o workspace da task dona do objeto.
CREATE POLICY "Wizzy Flow task-files select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'task-files'
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id::text = (storage.foldername(name))[1]
      AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), t.workspace_id))
        OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), p.workspace_id)))
  )
);

-- INSERT: upload só na pasta de uma task que o usuário acessa (a task já existe
-- no momento do upload, tanto em CreateTaskDialog quanto em TaskAttachments).
CREATE POLICY "Wizzy Flow task-files insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-files'
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id::text = (storage.foldername(name))[1]
      AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), t.workspace_id))
        OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), p.workspace_id)))
  )
);

-- UPDATE: idem (cobre upsert).
CREATE POLICY "Wizzy Flow task-files update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'task-files'
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id::text = (storage.foldername(name))[1]
      AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), t.workspace_id))
        OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), p.workspace_id)))
  )
);

-- DELETE: só quem acessa o workspace da task.
CREATE POLICY "Wizzy Flow task-files delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'task-files'
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.id::text = (storage.foldername(name))[1]
      AND ((t.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), t.workspace_id))
        OR (p.workspace_id IS NOT NULL AND public.user_has_workspace_access(auth.uid(), p.workspace_id)))
  )
);
