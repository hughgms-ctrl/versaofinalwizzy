-- Fase 2 (plano-seguranca-storage-buckets): bucket `contact-avatars` privado.
--
-- contact-avatars guarda as fotos de perfil dos contatos, baixadas do WhatsApp e
-- persistidas por edge functions (backfill-contact-avatars, zapi-contact-profile).
-- Leitura é 100% pelo FRONT autenticado (componente <ContactAvatar> nas telas de
-- conversas/CRM/pipeline). NÃO há fetch externo do provedor nem publicação lendo a
-- URL (verificado: nenhuma edge function faz fetch da URL de storage do avatar para
-- entregar; o provedor só nos DÁ a foto, nunca a busca de volta). Por isso dá pra
-- privatizar — igual carousel-images, diferente de chat-media/flow-media.
--
-- Modelo de acesso: NÃO mudamos a convenção de path (segue `<contact_id>/<ts>.<ext>`,
-- ver backfill-contact-avatars/index.ts + zapi-contact-profile/index.ts), então
-- NENHUM arquivo existente precisa ser migrado. O escopo vem de um JOIN na tabela
-- `contacts`: o objeto (folder[1] = contact_id) tem de pertencer a um contato da org
-- do usuário. Espelha a policy de tabela "contacts SELECT" (get_user_org_id).
--
-- ⚠️ contacts.avatar_url é COLUNA MISTA: além da URL do nosso storage, guarda a URL
-- CRUA do WhatsApp (pps.whatsapp.net/...), escrita por zapi-webhook/zapi-sync-chats.
-- SÓ as URLs de storage viram 404 ao privatizar; as cruas continuam resolvendo. O
-- front (helper contactAvatars.ts) só assina URLs do nosso bucket; o resto passa direto.
--
-- Escrita: os uploads são service_role (imunes a RLS) e o bucket JÁ não tinha policy
-- de INSERT/UPDATE/DELETE para `authenticated` (só a SELECT pública). Ou seja, não há
-- gap de write cross-org a fechar aqui — basta trocar a SELECT pública por org-scoped.
--
-- IMPORTANTE: esta migration e o deploy do FRONT novo têm de subir juntos — ao virar
-- public=false, as URLs públicas de storage antigas param de resolver na hora.
--
-- Lição do piloto task-files (20260713120000): `contacts` TEM coluna `name`, então um
-- `name` sem qualificar dentro do EXISTS resolveria para `contacts.name` em vez de
-- `storage.objects.name`. Por isso qualificamos `objects.name`.
--
-- Reversível: reverter = `public=true` + recriar "Public read contact-avatars"
-- (SELECT USING bucket_id='contact-avatars').

-- Bucket privado --------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'contact-avatars';

-- SELECT: assinar/ler só quem pertence à org dona do contato -------------------
DROP POLICY IF EXISTS "Public read contact-avatars" ON storage.objects;

CREATE POLICY "Org can view contact avatars"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'contact-avatars'
  AND EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.organization_id = public.get_user_org_id(auth.uid())
  )
);
