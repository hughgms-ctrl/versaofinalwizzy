-- Corrige "Salvar em anexos" (Wizzy Sign -> Contratos) deixando PDFs assinados
-- ilegíveis depois do flip de 20260715120000_storage_contact_files_private_flip.sql.
--
-- Contexto: ContactContractsSection.saveSignedGroupToFiles copia o PDF assinado
-- (que mora em signatures/... ou generated/... no bucket contact-files -- paths
-- de propósito SEM policy de storage pra usuário autenticado, só service_role via
-- edge) pra um registro de contact_files, mas sempre gravou storage_path = null.
-- Sem storage_path, a policy (a) de contact-files ("...via contact org", que exige
-- folder[1] = contact_id) nunca bate pra esses paths -> createSignedUrl falha
-- (400) -> "não foi possível baixar/pré-visualizar".
--
-- Fix: (1) popula storage_path retroativamente pras linhas já salvas assim; (2)
-- adiciona uma policy de SELECT que autoriza pela própria linha de contact_files
-- (JOIN contacts pra checar a org), igual já existe pra quiz-uploads (policy b da
-- migration 20260715120000) -- só que sem restringir ao prefixo 'quiz-uploads',
-- pra cobrir também as cópias de signatures/... e generated/....
--
-- QUALIFICANDO objects.name em todo lugar (lição da 20260713120000 sobre
-- name-shadowing com JOIN em contacts, que também tem coluna `name`).

-- 1) Backfill: extrai o path da file_url pública pras linhas sem storage_path.
UPDATE public.contact_files
SET storage_path = split_part(
  split_part(file_url, '/storage/v1/object/public/contact-files/', 2),
  '?', 1
)
WHERE storage_path IS NULL
  AND file_url LIKE '%/storage/v1/object/public/contact-files/%';

-- 2) SELECT — autoriza via contact_files (org do contato dono do registro), pra
--    objetos referenciados por storage_path que NÃO estão sob <contact_id>/...
--    (esses já são cobertos pela policy "contact-files select via contact org").
CREATE POLICY "contact-files select doc copies via contact_files org"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'contact-files'
  AND EXISTS (
    SELECT 1
    FROM public.contact_files cf
    JOIN public.contacts c ON c.id = cf.contact_id
    WHERE cf.storage_path = objects.name
      AND c.organization_id = public.get_user_org_id(auth.uid())
  )
);
