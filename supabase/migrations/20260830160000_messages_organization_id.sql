-- B11 (docs/REVISAO_ESCALA_LANCAMENTO.md) — notificacao de mensagem nova custa
-- a plataforma inteira.
--
-- O canal do frontend (useNewMessageNotifications) so consegue filtrar por UMA
-- coluna, e `messages` nao tinha `organization_id`. Resultado: todo cliente
-- logado assinava `direction=eq.inbound` da plataforma inteira, o Realtime
-- avaliava RLS por assinante a cada INSERT de qualquer org, e o callback ainda
-- fazia 1 a 3 SELECTs por evento para descobrir que a mensagem nem era dele.
-- Custo = mensagens da plataforma x usuarios online.
--
-- Com a coluna, o filtro vira `organization_id=eq.<org>` e o Postgres/Realtime
-- descarta o que nao e da org antes de qualquer trabalho.
--
-- Sem FK e sem indice de proposito: a coluna e denormalizacao para o filtro do
-- Realtime, e `messages` e a tabela mais escrita do sistema — cada indice a mais
-- e custo em TODO INSERT. A org sempre vem da conversa (o par correto ja e
-- garantido por `messages_conversation_id_fkey`).
--
-- APLICAR A MAO no SQL Editor (nunca supabase db push).
-- O backfill das linhas antigas esta em docs/backfill-messages-organization-id.sql
-- e pode rodar depois, sem pressa: o trigger ja cobre tudo que entra a partir daqui.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Preencher no trigger, e nao no codigo, e o que mantem a coluna correta sem
-- tocar nas ~20 edge functions que inserem mensagem (e sem quebrar as que o
-- Lovable regerar). O SELECT e por chave primaria da conversa: custo desprezivel
-- perto do INSERT que ja esta acontecendo.
CREATE OR REPLACE FUNCTION public.set_message_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT c.organization_id
      INTO NEW.organization_id
      FROM public.conversations c
     WHERE c.id = NEW.conversation_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_message_organization_id ON public.messages;

CREATE TRIGGER trg_set_message_organization_id
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_message_organization_id();

-- Conferencia rapida depois de aplicar (as duas devem voltar 0 linhas com
-- organization_id nulo entre as mensagens novas):
--
--   SELECT count(*) FILTER (WHERE organization_id IS NULL) AS sem_org,
--          count(*) AS total
--     FROM public.messages
--    WHERE created_at > now() - interval '5 minutes';
