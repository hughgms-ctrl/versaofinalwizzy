-- =====================================================================
-- Carrossel IA — integração na Wizzy
-- Converte os 3 migrations Prisma (MySQL) do projeto "Carrossel IA" para
-- Postgres/Supabase, descartando o model `User` (passa a usar auth.users) e
-- adotando o padrão multi-tenant da Wizzy: organization_id + RLS via
-- get_user_org_id(auth.uid()). Cria também o bucket de imagens.
--
-- Models originais -> tabelas:
--   Model    -> public.carousel_models
--   Carousel -> public.carousels
--   Slide    -> public.carousel_slides
-- =====================================================================

-- ------------------------------------------------------------------
-- carousel_models  (briefing de marca reutilizável)
-- ------------------------------------------------------------------
CREATE TABLE public.carousel_models (
  id               uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id  uuid NOT NULL,
  user_id          uuid NOT NULL,
  name             text NOT NULL,
  niche            text NOT NULL,
  objective        text NOT NULL DEFAULT 'educate',      -- educate | sell | engage | inspire
  tone             text NOT NULL DEFAULT 'professional', -- professional | casual | motivational | direct
  audience         text NOT NULL DEFAULT 'Geral',
  brand_color      text,                                 -- hex predominante da marca
  people_in_images text NOT NULL DEFAULT 'indifferent',  -- with | without | indifferent
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carousel_models_objective_check
    CHECK (objective IN ('educate', 'sell', 'engage', 'inspire')),
  CONSTRAINT carousel_models_tone_check
    CHECK (tone IN ('professional', 'casual', 'motivational', 'direct')),
  CONSTRAINT carousel_models_people_check
    CHECK (people_in_images IN ('with', 'without', 'indifferent'))
);

-- ------------------------------------------------------------------
-- carousels  (cada carrossel gerado; briefing fica "congelado" aqui)
-- ------------------------------------------------------------------
CREATE TABLE public.carousels (
  id                 uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id    uuid NOT NULL,
  user_id            uuid NOT NULL,
  model_id           uuid REFERENCES public.carousel_models(id) ON DELETE SET NULL,
  prompt             text NOT NULL,
  slide_count        integer NOT NULL,
  image_style        text NOT NULL DEFAULT 'cinematic',
  status             text NOT NULL DEFAULT 'pending',     -- pending | processing | done | failed
  instagram_media_id text,
  -- snapshot do briefing (substitui depender do Model em tempo de geração)
  niche              text,
  objective          text,                                -- educate | sell | engage | inspire
  tone               text,                                -- professional | casual | motivational | direct
  audience           text,
  brand_color        text,
  people_in_images   text DEFAULT 'indifferent',          -- with | without | indifferent
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carousels_status_check
    CHECK (status IN ('pending', 'processing', 'done', 'failed'))
);

-- ------------------------------------------------------------------
-- carousel_slides  (slides individuais + controles visuais)
-- ------------------------------------------------------------------
CREATE TABLE public.carousel_slides (
  id                uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  carousel_id       uuid NOT NULL REFERENCES public.carousels(id) ON DELETE CASCADE,
  "order"           integer NOT NULL,
  has_image         boolean NOT NULL DEFAULT false,
  image_prompt      text,
  image_theme       text,                                 -- conceito visual gerado pelo GPT
  image_url         text,                                 -- URL pública do Supabase Storage
  title             text,
  body              text,
  font_family       text DEFAULT 'Montserrat',
  text_align        text DEFAULT 'left',                  -- left | center | right
  text_color        text,
  bg_color          text,
  text_position     text DEFAULT 'center',                -- top | center | bottom
  overlay_intensity real DEFAULT 0.85,
  overlay_position  text DEFAULT 'bottom',                -- top | center | bottom | full
  title_size        integer DEFAULT 80,
  title_bold        boolean DEFAULT true,
  body_size         integer DEFAULT 36,
  accent_color      text DEFAULT '#3B82F6',               -- cor da linha divisória
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carousel_slides_unique_order UNIQUE (carousel_id, "order")
);

-- ------------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------------
CREATE INDEX idx_carousel_models_org      ON public.carousel_models(organization_id);
CREATE INDEX idx_carousels_org            ON public.carousels(organization_id);
CREATE INDEX idx_carousels_user           ON public.carousels(user_id);
CREATE INDEX idx_carousels_model          ON public.carousels(model_id);
CREATE INDEX idx_carousel_slides_carousel ON public.carousel_slides(carousel_id);

-- ------------------------------------------------------------------
-- updated_at triggers (função já existe no schema da Wizzy)
-- ------------------------------------------------------------------
CREATE TRIGGER update_carousel_models_updated_at
  BEFORE UPDATE ON public.carousel_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_carousels_updated_at
  BEFORE UPDATE ON public.carousels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_carousel_slides_updated_at
  BEFORE UPDATE ON public.carousel_slides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------------
-- RLS — isolamento por organização (padrão Wizzy)
-- ------------------------------------------------------------------
ALTER TABLE public.carousel_models  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carousels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carousel_slides  ENABLE ROW LEVEL SECURITY;

-- carousel_models
CREATE POLICY "Users can view carousel models in their organization"
  ON public.carousel_models FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage carousel models in their organization"
  ON public.carousel_models FOR ALL
  USING (organization_id = get_user_org_id(auth.uid()))
  WITH CHECK (organization_id = get_user_org_id(auth.uid()));

-- carousels
CREATE POLICY "Users can view carousels in their organization"
  ON public.carousels FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage carousels in their organization"
  ON public.carousels FOR ALL
  USING (organization_id = get_user_org_id(auth.uid()))
  WITH CHECK (organization_id = get_user_org_id(auth.uid()));

-- carousel_slides (via carrossel-pai)
CREATE POLICY "Users can view slides in their org carousels"
  ON public.carousel_slides FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.carousels c
    WHERE c.id = carousel_slides.carousel_id
      AND c.organization_id = get_user_org_id(auth.uid())
  ));

CREATE POLICY "Users can manage slides in their org carousels"
  ON public.carousel_slides FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.carousels c
    WHERE c.id = carousel_slides.carousel_id
      AND c.organization_id = get_user_org_id(auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.carousels c
    WHERE c.id = carousel_slides.carousel_id
      AND c.organization_id = get_user_org_id(auth.uid())
  ));

-- ------------------------------------------------------------------
-- Realtime — progresso em tempo real (substitui o SSE do projeto original)
-- ------------------------------------------------------------------
ALTER TABLE public.carousels       REPLICA IDENTITY FULL;
ALTER TABLE public.carousel_slides REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.carousels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.carousel_slides;

-- ------------------------------------------------------------------
-- Storage — bucket das imagens geradas (substitui o Cloudflare R2)
-- ------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('carousel-images', 'carousel-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view carousel images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'carousel-images');

CREATE POLICY "Authenticated users can upload carousel images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'carousel-images' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update carousel images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'carousel-images' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete carousel images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'carousel-images' AND auth.role() = 'authenticated');
