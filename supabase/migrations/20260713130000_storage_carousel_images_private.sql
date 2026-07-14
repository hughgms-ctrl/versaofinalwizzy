-- Fase 2 (plano-seguranca-storage-buckets): bucket `carousel-images` privado.
--
-- carousel-images guarda as imagens geradas por IA dos slides de carrossel.
-- Consumo é 100% pelo FRONT autenticado (preview <img> em SlideCard + render de
-- download .zip via canvas em renderSlide). NÃO há fetch externo do provedor de
-- WhatsApp nem publicação no Instagram lendo a URL (verificado: instagram_media_id
-- é só coluna declarada, nunca escrita/lida; nenhuma edge function lê image_url),
-- diferente de chat-media/flow-media. Por isso dá pra privatizar.
--
-- Modelo de acesso: NÃO mudamos a convenção de path (segue `<carousel_id>/slide-...png`,
-- ver _shared/carousel.ts + callers carousel-generate/carousel-regenerate-image),
-- então NENHUM arquivo existente precisa ser migrado. O escopo vem de um JOIN na
-- tabela `carousels`: o objeto (folder[1] = carousel_id) tem de pertencer a um
-- carrossel da org do usuário. Espelha a policy de tabela "Users can view slides
-- in their org carousels" (migration 20260608120000).
--
-- Leitura: o front deixa de usar a URL pública salva em carousel_slides.image_url
-- e passa a gerar signed URL (createSignedUrl). Arquivos antigos, cujo image_url
-- guardado é URL pública, continuam funcionando: o helper do front extrai o path
-- de dentro da URL e assina.
--
-- Escrita: os uploads reais são service_role (imunes a RLS), então trocar a policy
-- INSERT/UPDATE de `authenticated`-any para org-scoped NÃO afeta o app — só fecha o
-- gap de escrita cross-org por autenticado direto (achado do Advisor). DELETE já
-- foi removida no hardening (20260709121000): só service_role apaga.
--
-- IMPORTANTE: esta migration e o deploy do FRONT novo têm de subir juntos — ao
-- virar public=false, as URLs públicas antigas param de resolver na hora.
--
-- Lição do piloto task-files (20260713120000): dentro do EXISTS, qualificar
-- `objects.name` — um `name` sem qualificar pode colidir com coluna `name` da
-- tabela joinada. `carousels` não tem coluna `name`, mas qualificamos por garantia.
--
-- Reversível: reverter = `public=true` + recriar "Public can view carousel images"
-- (SELECT USING bucket_id='carousel-images') e as policies INSERT/UPDATE com
-- auth.role()='authenticated'.

-- Bucket privado --------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'carousel-images';

-- SELECT: assinar/ler só quem pertence à org dona do carrossel -----------------
DROP POLICY IF EXISTS "Public can view carousel images" ON storage.objects;

CREATE POLICY "Org can view carousel images"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'carousel-images'
  AND EXISTS (
    SELECT 1 FROM public.carousels c
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.organization_id = get_user_org_id(auth.uid())
  )
);

-- INSERT: fecha write cross-org (uploads reais são service_role, imunes) --------
DROP POLICY IF EXISTS "Authenticated users can upload carousel images" ON storage.objects;

CREATE POLICY "Org can upload carousel images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'carousel-images'
  AND EXISTS (
    SELECT 1 FROM public.carousels c
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.organization_id = get_user_org_id(auth.uid())
  )
);

-- UPDATE: idem (cobre upsert) --------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can update carousel images" ON storage.objects;

CREATE POLICY "Org can update carousel images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'carousel-images'
  AND EXISTS (
    SELECT 1 FROM public.carousels c
    WHERE c.id::text = (storage.foldername(objects.name))[1]
      AND c.organization_id = get_user_org_id(auth.uid())
  )
);
