-- =====================================================================
-- Base de conhecimento do Projeto (carousel_models) — referências, tema e
-- material de pesquisa salvos por projeto, usados pra enriquecer o prompt
-- de "Tendências" (e futuramente a geração em si). Sem embeddings/RAG por
-- ora: o conteúdo é concatenado direto no prompt (mesmo padrão já usado
-- pra artigo/transcrição colados em carousels.source_content) — item de
-- projeto costuma ser pequeno o bastante pra não precisar de busca vetorial.
-- "carousel_models" continua sendo o nome da tabela; o rótulo "Projeto" é
-- só de interface.
-- =====================================================================

CREATE TABLE public.carousel_model_knowledge (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  model_id         uuid NOT NULL REFERENCES public.carousel_models(id) ON DELETE CASCADE,
  type             text NOT NULL CHECK (type IN ('text', 'file', 'link', 'template')),
  title            text NOT NULL,
  content          text,
  source_url       text,
  storage_path     text,
  template_id      uuid REFERENCES public.carousels(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'ready' CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  error_message    text,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_carousel_model_knowledge_model_id ON public.carousel_model_knowledge(model_id);
CREATE INDEX idx_carousel_model_knowledge_org_id ON public.carousel_model_knowledge(organization_id);

ALTER TABLE public.carousel_model_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org access carousel_model_knowledge" ON public.carousel_model_knowledge
  FOR ALL TO public
  USING (organization_id = public.get_user_org_id((select auth.uid())))
  WITH CHECK (organization_id = public.get_user_org_id((select auth.uid())));

-- ---------------------------------------------------------------------
-- Bucket privado pros arquivos originais enviados (o texto extraído vive
-- em content; o bucket guarda o arquivo original). Path: <model_id>/<arquivo>.
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('carousel-knowledge-files', 'carousel-knowledge-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE POLICY "Org access carousel-knowledge-files select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'carousel-knowledge-files'
    AND EXISTS (
      SELECT 1 FROM public.carousel_models m
      WHERE m.id::text = (storage.foldername(name))[1]
        AND m.organization_id = public.get_user_org_id((select auth.uid()))
    )
  );

CREATE POLICY "Org access carousel-knowledge-files insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'carousel-knowledge-files'
    AND EXISTS (
      SELECT 1 FROM public.carousel_models m
      WHERE m.id::text = (storage.foldername(name))[1]
        AND m.organization_id = public.get_user_org_id((select auth.uid()))
    )
  );

CREATE POLICY "Org access carousel-knowledge-files delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'carousel-knowledge-files'
    AND EXISTS (
      SELECT 1 FROM public.carousel_models m
      WHERE m.id::text = (storage.foldername(name))[1]
        AND m.organization_id = public.get_user_org_id((select auth.uid()))
    )
  );
