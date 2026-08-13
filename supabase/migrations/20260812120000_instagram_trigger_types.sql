-- Amplia os gatilhos das automações do Instagram.
--
-- Até aqui o CHECK só aceitava 'comment_keyword', então o módulo automatizava
-- exclusivamente comentário em post. O webhook já RECEBE DM e resposta a story
-- (inclusive classifica a mensagem como 'story_reply'), mas nada disso disparava
-- regra — a informação chegava e morria no banco.
--
-- Os quatro gatilhos novos:
--
--   dm_keyword     — alguém manda DM contendo palavra-chave
--   story_reply    — alguém responde um story (com ou sem palavra-chave)
--   story_mention  — alguém menciona a conta no próprio story
--   first_message  — primeira mensagem de um contato que nunca falou antes
--
-- Mantido como TEXT + CHECK (e não enum) pela mesma razão registrada na
-- migration original: acrescentar valor não exige ALTER TYPE, que não pode ser
-- usado na mesma transação em que o valor é criado.
ALTER TABLE public.instagram_automation_rules
  DROP CONSTRAINT IF EXISTS instagram_automation_rules_trigger_type_check;

ALTER TABLE public.instagram_automation_rules
  ADD CONSTRAINT instagram_automation_rules_trigger_type_check
  CHECK (trigger_type IN (
    'comment_keyword',
    'dm_keyword',
    'story_reply',
    'story_mention',
    'first_message'
  ));

COMMENT ON COLUMN public.instagram_automation_rules.trigger_type IS
  'O que dispara a regra. comment_keyword usa trigger_config.{keywords,match_type,scope,media_ids}; dm_keyword e story_reply usam {keywords,match_type} (story_reply aceita lista vazia = qualquer resposta); story_mention e first_message não usam configuração.';

-- O webhook busca as regras por (conta, tipo de gatilho, ativa) a cada evento
-- recebido. Com só um tipo existindo, o índice por conta bastava; agora que uma
-- conta pode ter regras de cinco tipos, vale filtrar no índice.
CREATE INDEX IF NOT EXISTS idx_instagram_automation_rules_trigger
  ON public.instagram_automation_rules(instagram_account_id, trigger_type)
  WHERE is_active = true;

-- ───────────────────────────────────────────────────────────────────────────
-- SUPORTE AO GATILHO first_message
--
-- "Primeira mensagem" precisa saber se o contato já falou alguma vez. Contar
-- instagram_messages a cada evento seria uma varredura por mensagem recebida;
-- uma marca no contato resolve com uma leitura.
ALTER TABLE public.instagram_contacts
  ADD COLUMN IF NOT EXISTS first_inbound_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.instagram_contacts.first_inbound_at IS
  'Primeira mensagem recebida deste contato. Preenchida uma única vez; é o que permite o gatilho first_message distinguir contato novo de recorrente.';

-- Retroativo: para contatos que já existem, a primeira mensagem registrada é a
-- melhor aproximação. Sem isto, todo contato antigo pareceria "nunca falou" e o
-- gatilho de primeira mensagem dispararia para a base inteira na próxima
-- mensagem que cada um enviasse.
UPDATE public.instagram_contacts c
   SET first_inbound_at = sub.primeira
  FROM (
    SELECT conv.contact_id, MIN(m.created_at) AS primeira
      FROM public.instagram_messages m
      JOIN public.instagram_conversations conv ON conv.id = m.conversation_id
     WHERE m.direction = 'inbound'
     GROUP BY conv.contact_id
  ) sub
 WHERE c.id = sub.contact_id
   AND c.first_inbound_at IS NULL;
