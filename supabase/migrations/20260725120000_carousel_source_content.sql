-- =====================================================================
-- Carrossel IA — geração a partir de fonte de conteúdo
-- Além de "minha ideia" e "tendência", o carrossel agora pode nascer de um
-- texto colado, um link de blog/artigo ou a transcrição de um vídeo do
-- YouTube. source_type identifica a origem; source_content guarda o
-- material bruto (texto extraído) usado como base real pela IA.
-- =====================================================================

ALTER TABLE public.carousels
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'idea',
  ADD COLUMN IF NOT EXISTS source_content text;
