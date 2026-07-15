-- Fase B (plano-seguranca-storage-buckets, BUCKET 4): FLIP do bucket `contact-files`
-- para PRIVADO (public=false) + policies org-scoped no storage.objects.
--
-- Contexto: a Fase A (commit 098ca41d) já converteu TODOS os leitores para signed
-- URL / storage.download, backward-compatible com o bucket ainda público. Esta
-- migration fecha o gap: read/write deixam de ser abertos e passam a exigir org.
--
-- ⚠️ Deploy COORDENADO: esta migration e o bundle FRONT/EDGE novo têm de subir
-- JUNTOS. Ao virar public=false, toda URL pública (`/object/public/contact-files/`)
-- morre na hora — só resolve via signed URL (front + fluxos públicos) ou
-- storage.download (edges service_role).
--
-- ⚠️ ARMADILHA name-shadowing (lição de task-files, 20260713120000): `contacts` TEM
-- coluna `name`. Dentro de um EXISTS que faz JOIN em `contacts`, um `name` sem
-- qualificar resolve para `contacts.name`, NÃO `storage.objects.name` → a policy
-- nunca bate o path → 403 em tudo. Por isso QUALIFICAMOS `objects.name` em TODA
-- policy abaixo. (A policy DELETE antiga — 20260709121000 — tinha exatamente esse
-- bug latente: `name` sem qualificar dentro do EXISTS de `contacts`. Recriada aqui
-- corrigida.)
--
-- Convenções de path no bucket (levantadas 2026-07-15):
--   * `<contact_id>/<ts>-<rand>.<ext>`        → CRM (useContactFiles) — folder[1]=contact_id
--   * `quiz-uploads/<quiz_id>/<arquivo>`      → resposta de quiz (anon) — folder[1]='quiz-uploads'
--   * `<org_id>/templates/<...>`              → doc bruto p/ IA (UploadTemplateDialog)
--   * `<org_id>/template-logos/<...>`         → logo de template (TemplateEditor)
--   * `<org_id>/document-images/<...>`        → imagem embutida no content_html (RichTextEditor)
--   * `signatures/<...>`, `generated/<...>`   → só service_role (edges) — sem policy authenticated
--
-- Reversível: `UPDATE storage.buckets SET public=true WHERE id='contact-files'` +
-- recriar a SELECT pública `USING (bucket_id='contact-files')`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Limpeza drift-safe: dropa QUALQUER policy de storage.objects referente a
--    contact-files (nomes com drift do SQL Editor), EXCETO a INSERT anon do quiz
--    (`Public users can upload quiz files`, 20260709120500) que deve sobreviver.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname <> 'Public users can upload quiz files'
      AND (
        COALESCE(qual, '')       LIKE '%contact-files%'
        OR COALESCE(with_check, '') LIKE '%contact-files%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Rede de segurança: dropa por nome conhecido caso o drift tenha alterado o
-- predicado de tal forma que o LIKE acima não pegue (idempotente).
DROP POLICY IF EXISTS "Users can view contact files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload contact files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update contact files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete contact files" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete their contact files" ON storage.objects;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) SELECT — leitura org-scoped (o front assina on-read via createSignedUrl)
-- ─────────────────────────────────────────────────────────────────────────────

-- (a) Arquivos de CRM: `<contact_id>/...` → org dona do contato.
CREATE POLICY "contact-files select via contact org"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'contact-files'
  AND EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.organization_id = public.get_user_org_id(auth.uid())
  )
);

-- (b) Arquivos de resposta de QUIZ: `quiz-uploads/<quiz_id>/...`. O folder[1] é
--     literalmente 'quiz-uploads' (não um contact_id), então a policy (a) NÃO os
--     cobre. São indexados em contact_files.storage_path pelo edge quiz-actions;
--     autorizamos pela org da linha em contact_files (JOIN contacts).
CREATE POLICY "contact-files select quiz-uploads via contact_files org"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'contact-files'
  AND (storage.foldername(objects.name))[1] = 'quiz-uploads'
  AND EXISTS (
    SELECT 1
    FROM public.contact_files cf
    JOIN public.contacts c ON c.id = cf.contact_id
    WHERE cf.storage_path = objects.name
      AND c.organization_id = public.get_user_org_id(auth.uid())
  )
);

-- (c) Assets de design (logo de template + imagem embutida): `<org_id>/template-logos/...`
--     e `<org_id>/document-images/...` → folder[1] = org do usuário. Exibidos só em
--     telas autenticadas; o front assina on-read (display-only).
CREATE POLICY "contact-files select design assets via org"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'contact-files'
  AND (storage.foldername(objects.name))[1] = public.get_user_org_id(auth.uid())::text
  AND (storage.foldername(objects.name))[2] IN ('template-logos', 'document-images')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) INSERT / UPDATE — escrita org-scoped (uploads do front autenticado)
--    Uploads via edge (service_role) IGNORAM RLS → não dependem destas policies.
--    A INSERT anon do quiz (`Public users can upload quiz files`) segue intacta.
-- ─────────────────────────────────────────────────────────────────────────────

-- (d) CRM: upload/atualização de arquivo de contato (`<contact_id>/...`).
CREATE POLICY "contact-files insert via contact org"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'contact-files'
  AND EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.organization_id = public.get_user_org_id(auth.uid())
  )
);

CREATE POLICY "contact-files update via contact org"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'contact-files'
  AND EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.organization_id = public.get_user_org_id(auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'contact-files'
  AND EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.organization_id = public.get_user_org_id(auth.uid())
  )
);

-- (e) Assets de design + doc bruto de template: `<org_id>/...` (templates,
--     template-logos, document-images) → folder[1] = org do usuário.
CREATE POLICY "contact-files insert org assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'contact-files'
  AND (storage.foldername(objects.name))[1] = public.get_user_org_id(auth.uid())::text
  AND (storage.foldername(objects.name))[2] IN ('templates', 'template-logos', 'document-images')
);

CREATE POLICY "contact-files update org assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'contact-files'
  AND (storage.foldername(objects.name))[1] = public.get_user_org_id(auth.uid())::text
  AND (storage.foldername(objects.name))[2] IN ('templates', 'template-logos', 'document-images')
)
WITH CHECK (
  bucket_id = 'contact-files'
  AND (storage.foldername(objects.name))[1] = public.get_user_org_id(auth.uid())::text
  AND (storage.foldername(objects.name))[2] IN ('templates', 'template-logos', 'document-images')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) DELETE — recriada escopada por org do contato, QUALIFICANDO objects.name
--    (corrige o bug de shadowing latente da 20260709121000). Só o front deleta
--    contact-files, sempre em `<contact_id>/...` (useContactFiles.ts).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "contact-files delete via contact org"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'contact-files'
  AND EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.organization_id = public.get_user_org_id(auth.uid())
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) O FLIP — bucket privado. A partir daqui as URLs públicas param de resolver;
--    o bundle front/edge desta mesma release passa a assinar/baixar por path.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets SET public = false WHERE id = 'contact-files';
