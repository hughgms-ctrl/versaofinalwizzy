-- Palavra-chave que dispara mesmo com fluxo em andamento na conversa.
--
-- Regra de hoje no zapi-webhook: se existe flow_execution ativa na conversa
-- (running / waiting_input / waiting_delay), a mensagem PERTENCE àquele fluxo --
-- é tratada como resposta dele, e as campanhas nem chegam a ser consultadas.
-- Isso existe de propósito: sem essa regra, uma resposta do contato que por acaso
-- casasse com a palavra-chave de outra campanha sequestrava o atendimento no meio.
--
-- O efeito colateral é que comando interno pelo WhatsApp não funciona. Uma campanha
-- restrita por trigger_tag_ids à tag ORGANIZADOR ("gerar relatorio") só responde
-- quando a conversa está livre; se o organizador tiver qualquer fluxo aberto, a
-- mensagem vira resposta desse fluxo e o comando some, sem erro nenhum.
--
-- Esta coluna abre a exceção -- campanha por campanha, e desligada por padrão.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS interrompe_fluxo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.campaigns.interrompe_fluxo IS
  'Se true, a palavra-chave também é consultada quando já existe fluxo ativo na conversa, e vence a retomada. O fluxo interrompido NÃO é cancelado: fica parado no nó em que estava. Só vale para gatilho de palavra-chave; use junto com trigger_tag_ids, senão qualquer lead interrompe o próprio atendimento.';

-- Consulta nova por mensagem recebida: só as campanhas interruptoras da org, já
-- na ordem de desempate. O índice parcial mantém isso barato mesmo em org com
-- muitas campanhas -- na prática quase nenhuma tem interrompe_fluxo = true, então
-- o índice fica minúsculo e o caso "org não usa o recurso" custa uma leitura vazia.
CREATE INDEX IF NOT EXISTS campaigns_org_interruptoras_idx
  ON public.campaigns (organization_id, trigger_priority DESC, created_at ASC)
  WHERE is_active = true AND interrompe_fluxo = true;
