-- Campos estruturados de personalidade do agente base (ver conversa com o
-- usuário: "não precisar escrever isso no prompt" -- comportamento, tamanho
-- de resposta, tom e uso de emoji viram seleção fixa, não texto livre).
-- Nullable: agentes existentes ficam sem seleção (nenhum efeito extra no
-- prompt até serem editados); a UI escolhe um padrão sensato ao criar novos.
ALTER TABLE public.ai_agents
  ADD COLUMN behavior_style text CHECK (behavior_style IN ('formal', 'informal')),
  ADD COLUMN response_length text CHECK (response_length IN ('curto', 'moderado', 'explicativo')),
  ADD COLUMN tone_style text CHECK (tone_style IN ('neutro', 'caloroso')),
  ADD COLUMN emoji_usage text CHECK (emoji_usage IN ('nunca', 'moderado', 'frequente'));
