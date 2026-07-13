-- Fase 1.3 (plano-seguranca-storage-buckets): fechar DELETE cross-org nos buckets.
--
-- Situação: todos esses buckets deixavam QUALQUER usuário autenticado deletar
-- QUALQUER objeto (`auth.role() = 'authenticated'`, sem escopo de org). Um membro
-- da org A podia destruir mídia/arquivos da org B.
--
-- Verificação de call-sites (2026-07-09): o frontend NÃO deleta objetos de
-- chat-media, flow-media, carousel-images nem contact-avatars (task-files só apaga
-- a linha do banco, nunca o objeto). O ÚNICO delete de storage no app é
-- useContactFiles.ts:274, sobre contact-files, com path `<contactId>/<arquivo>`.
-- As edge functions escrevem/limpam via service_role, que IGNORA RLS — então
-- remover a permissão de DELETE do papel `authenticated` NÃO afeta a limpeza
-- server-side.
--
-- Estratégia:
--   * chat-media / flow-media / carousel-images: remover o DELETE aberto para
--     authenticated. Ninguém no app deleta esses; só service_role (bypass RLS).
--   * contact-files: trocar o DELETE aberto por um escopado — só o membro da org
--     dona do contato (folder[1] = contactId) pode apagar. Cobre exatamente o
--     caminho real do useContactFiles.
--   * contact-avatars: já não tinha policy de delete (só read público) — nada a fazer.
--   * task-files: bucket é schema-drift (não existe migration que o cria); tratar
--     junto do drift, fora desta migration.
--
-- Reversível: reverter = recriar as policies `auth.role() = 'authenticated'`.

-- chat-media -----------------------------------------------------------------
DROP POLICY IF EXISTS "Users can delete their chat media" ON storage.objects;

-- flow-media -----------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can delete flow media" ON storage.objects;

-- carousel-images ------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can delete carousel images" ON storage.objects;

-- contact-files: DELETE escopado por org do contato --------------------------
DROP POLICY IF EXISTS "Authenticated users can delete contact files" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete their contact files" ON storage.objects;

CREATE POLICY "Org members can delete their contact files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'contact-files'
  AND EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND c.organization_id = get_user_org_id(auth.uid())
  )
);
