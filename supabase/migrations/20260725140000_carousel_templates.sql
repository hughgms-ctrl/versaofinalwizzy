-- =====================================================================
-- Carrossel IA — biblioteca de templates
-- Um carrossel pode virar "template": um ponto de partida reutilizável que
-- aparece na galeria de Templates. template_source registra como nasceu
-- (criado manualmente, importado de print, ou de um link do Instagram).
-- Usar um template clona seus slides numa cópia nova (is_template=false);
-- o template original permanece intacto pra reuso.
-- =====================================================================

ALTER TABLE public.carousels
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS template_source text;

ALTER TABLE public.carousels DROP CONSTRAINT IF EXISTS carousels_template_source_check;
ALTER TABLE public.carousels
  ADD CONSTRAINT carousels_template_source_check
  CHECK (template_source IS NULL OR template_source IN ('created', 'screenshot', 'instagram_link'));

CREATE INDEX IF NOT EXISTS idx_carousels_is_template
  ON public.carousels(organization_id, is_template)
  WHERE is_template = true;
