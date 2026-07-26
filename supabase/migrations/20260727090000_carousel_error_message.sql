-- =====================================================================
-- Carrossel IA — mensagem real do erro quando a geração falha
-- Hoje a UI mostra um texto fixo genérico ("verifique a chave da OpenAI")
-- pra qualquer falha, o que engana quando a causa é outra (ex.: modelo sem
-- suporte a visão no import de template). Guarda a mensagem de verdade
-- (já logada via console.error) pra exibir na tela.
-- =====================================================================

ALTER TABLE public.carousels
  ADD COLUMN IF NOT EXISTS error_message text;
