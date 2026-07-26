-- =====================================================================
-- Carrossel IA — layout_mode do slide
-- Até agora todo slide com imagem usava o mesmo layout: foto de fundo em
-- tela cheia + overlay escuro por trás do texto ("overlay"). Adiciona um
-- segundo modo, "card": fundo sólido, imagem como um bloco menor recortado
-- (não em tela cheia), texto numa área própria — o design de referências
-- tipo print de tweet/notícia (fundo branco, foto separada do texto).
-- Default 'overlay' preserva o comportamento de todo slide já existente.
-- =====================================================================

ALTER TABLE public.carousel_slides
  ADD COLUMN IF NOT EXISTS layout_mode text NOT NULL DEFAULT 'overlay';

ALTER TABLE public.carousel_slides DROP CONSTRAINT IF EXISTS carousel_slides_layout_mode_check;
ALTER TABLE public.carousel_slides
  ADD CONSTRAINT carousel_slides_layout_mode_check
  CHECK (layout_mode IN ('overlay', 'card'));
