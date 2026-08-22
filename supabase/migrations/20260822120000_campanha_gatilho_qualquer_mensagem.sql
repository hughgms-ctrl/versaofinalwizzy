-- Gatilho "qualquer mensagem": a campanha que atende quem NÃO casou com ninguém.
--
-- O buraco: o lead chega do anúncio com a mensagem pronta e a campanha casa por
-- all_words. Quem apaga o texto e escreve outra coisa cai no vazio -- nenhuma
-- campanha casa, nenhum fluxo roda, e ninguém fica sabendo. Não havia como montar
-- um fluxo de boas-vindas para essas pessoas: os tipos existentes (exact, contains,
-- starts_with, all_words) todos exigem um texto, e campanha com trigger_keyword
-- vazio é descartada no checkCampaignTriggers.
--
-- match_type = 'fallback' é o tipo novo. Não tem texto próprio: casa com qualquer
-- mensagem, MAS só depois de todas as outras campanhas terem sido avaliadas e
-- nenhuma ter casado. Não é coluna nova -- match_type já é texto livre (nunca teve
-- CHECK) e é onde os outros tipos moram.
--
-- A ordem NÃO depende de trigger_priority. O webhook faz dois passes sobre a mesma
-- lista de campanhas: o primeiro ignora as 'fallback', o segundo só olha para elas.
-- Uma campanha "qualquer mensagem" com trigger_priority 999 continua perdendo para
-- uma palavra-chave com prioridade 0 -- é perda por construção, não por
-- configuração. Por isso também não existe índice novo aqui: o segundo passe é
-- sobre a lista que a consulta de sempre já trouxe, sem query extra por mensagem.

COMMENT ON COLUMN public.campaigns.match_type IS $c$Como a campanha inicia.
Palavra-chave por texto: exact | contains | all_words | starts_with.
'fallback' = qualquer mensagem de texto que nenhuma outra campanha reconheceu. Não tem
texto próprio: é avaliada depois de todas as outras e nunca ganha de uma delas, seja
qual for a trigger_priority. Só vale para mensagem de texto -- áudio, figurinha e mídia
não disparam. Não pode ser combinada com interrompe_fluxo.
Gatilhos de sistema: tag_added | webhook | new_conversation | manual.$c$;

-- "Casa com tudo" + "interrompe fluxo em andamento" é a combinação que tira a base
-- inteira de dentro dos fluxos: qualquer mensagem de qualquer contato viraria motivo
-- para abandonar o atendimento aberto. O webhook já não considera fallback no modo
-- interruptor e a tela já não deixa marcar, mas quem escreve direto na tabela (SQL,
-- import, script) passaria por cima dos dois. A regra fica aqui embaixo também.
--
-- A coluna interrompe_fluxo vem da migration 20260821130000. Se ela ainda não tiver
-- sido aplicada, o CHECK é pulado em vez de derrubar esta migration inteira -- e a
-- combinação proibida continua impossível pelos outros dois caminhos.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaigns'
      AND column_name = 'interrompe_fluxo'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_fallback_nao_interrompe_check'
  ) THEN
    ALTER TABLE public.campaigns
      ADD CONSTRAINT campaigns_fallback_nao_interrompe_check
      CHECK (NOT (match_type = 'fallback' AND interrompe_fluxo));
  END IF;
END $$;

-- Duas campanhas 'fallback' ativas na mesma organização seriam sorteio: as duas casam
-- com a mesma mensagem e o desempate cairia em created_at. A tela avisa quando isso
-- está para acontecer, mas não bloqueia -- pode ser passo intermediário de quem está
-- trocando uma campanha de boas-vindas por outra (criar a nova, desligar a velha).
-- Este índice é só para a consulta do aviso e para achar o passivo depois:
--   SELECT organization_id, count(*) FROM public.campaigns
--    WHERE is_active AND match_type = 'fallback' GROUP BY 1 HAVING count(*) > 1;
CREATE INDEX IF NOT EXISTS campaigns_org_fallback_ativo_idx
  ON public.campaigns (organization_id)
  WHERE is_active = true AND match_type = 'fallback';
