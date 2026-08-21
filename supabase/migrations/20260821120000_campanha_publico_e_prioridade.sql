-- Filtro de público e prioridade no gatilho de palavra-chave da campanha.
--
-- Até aqui, toda palavra-chave era aberta para a base inteira: checkCampaignTriggers
-- comparava o texto da mensagem contra TODAS as campanhas ativas da organização e
-- não olhava quem mandou. Palavra-chave comum ("sim", "quero", "lista") virava
-- gatilho para qualquer lead que digitasse aquilo, inclusive quem nunca teve nada
-- a ver com a campanha. Não havia como montar comando interno pelo WhatsApp --
-- qualquer pessoa disparava.
--
-- E, entre duas campanhas cujos textos se sobrepõem, quem ganhava era a primeira
-- que o banco entregasse: a query não tinha ORDER BY e o loop retornava no
-- primeiro match. Ou seja, sorteio.

-- Público: quais contatos podem disparar esta campanha por palavra-chave.
-- Array vazio (o default) = sem filtro, exatamente o comportamento de hoje --
-- nenhuma campanha existente muda de comportamento com esta migration.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS trigger_tag_ids uuid[] NOT NULL DEFAULT '{}';

-- Como combinar as tags acima:
--   any  = o contato tem PELO MENOS UMA delas   (default)
--   all  = o contato tem TODAS elas
--   none = o contato NÃO tem NENHUMA delas      (público = todo mundo menos esses)
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS trigger_tag_match text NOT NULL DEFAULT 'any';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_trigger_tag_match_check'
  ) THEN
    ALTER TABLE public.campaigns
      ADD CONSTRAINT campaigns_trigger_tag_match_check
      CHECK (trigger_tag_match IN ('any', 'all', 'none'));
  END IF;
END $$;

-- Desempate entre campanhas cujas palavras-chave se sobrepõem. Maior ganha.
-- Default 0 mantém todas empatadas, e aí o desempate é created_at ASC (a mais
-- antiga vence) -- arbitrário, mas ESTÁVEL, que é o que faltava.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS trigger_priority integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.campaigns.trigger_tag_ids IS
  'Público do gatilho por palavra-chave. Vazio = qualquer contato pode disparar.';
COMMENT ON COLUMN public.campaigns.trigger_tag_match IS
  'any | all | none -- como combinar trigger_tag_ids.';
COMMENT ON COLUMN public.campaigns.trigger_priority IS
  'Desempate entre campanhas com palavras-chave sobrepostas. Maior ganha; empate cai em created_at ASC.';

-- O webhook busca as campanhas ativas da org e agora ordena por prioridade.
-- Sem o índice, cada mensagem recebida vira um sort em cima do filtro.
CREATE INDEX IF NOT EXISTS campaigns_org_active_priority_idx
  ON public.campaigns (organization_id, trigger_priority DESC, created_at ASC)
  WHERE is_active = true;
