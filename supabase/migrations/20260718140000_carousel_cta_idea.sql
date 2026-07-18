-- =====================================================================
-- Carrossel IA — ideia de CTA opcional por carrossel
-- Campo livre onde o usuário descreve (mesmo que de forma crua) como quer
-- o call-to-action do último slide — ex.: a palavra-chave do sistema de
-- automação ("comente ORCAMENTO"). Se preenchido, a IA usa como base e
-- melhora a redação preservando a palavra-chave; se vazio, gera sozinha.
-- =====================================================================

ALTER TABLE public.carousels
  ADD COLUMN IF NOT EXISTS cta_idea text;
