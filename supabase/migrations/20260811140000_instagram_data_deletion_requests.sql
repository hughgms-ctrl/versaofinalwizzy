-- Data Deletion Request Callback (exigência da Meta para o App Review).
--
-- CONTEXTO: a Meta exige que o app ofereça um jeito programático de apagar os
-- dados de um usuário. Já existe a página /exclusao-de-dados (instruções por
-- e-mail), que a Meta aceita como alternativa, mas ela é manual e não devolve o
-- código de confirmação que o fluxo oficial pede. Esta tabela sustenta o
-- callback de verdade: a Meta faz POST, apagamos na hora e devolvemos
-- { url, confirmation_code } para a pessoa acompanhar o pedido.
--
-- O ciclo de vida fica registrado aqui porque o próprio dado apagado some — sem
-- este registro não haveria como responder "esse pedido foi cumprido?" depois,
-- que é exatamente o que a URL de status precisa mostrar.

CREATE TABLE IF NOT EXISTS public.instagram_data_deletion_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Código que a Meta mostra ao usuário e que a URL pública de status recebe.
  -- Curto e legível de propósito: a pessoa pode digitar isso à mão.
  confirmation_code TEXT NOT NULL UNIQUE,
  -- IGSID do usuário no payload assinado. Fica registrado APÓS a exclusão para
  -- conseguirmos responder à consulta de status; é o identificador opaco do
  -- app, não um dado pessoal (sem nome, foto ou mensagens).
  igsid TEXT NOT NULL,
  -- NULL quando o pedido chega para alguém que não temos (nada a apagar) — a
  -- Meta ainda espera resposta de sucesso nesse caso.
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'nothing_to_delete', 'failed')),
  -- O que foi de fato removido, para auditoria (ex.: {"contacts": 1}).
  deleted_counts JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instagram_deletion_requests_code
  ON public.instagram_data_deletion_requests(confirmation_code);

ALTER TABLE public.instagram_data_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Sem policy de SELECT para authenticated de propósito: a consulta pública de
-- status passa pela edge function (service role), que devolve só o estado do
-- código informado. Assim um código não vira uma listagem de todos os pedidos.
COMMENT ON TABLE public.instagram_data_deletion_requests IS
  'Registro dos pedidos de exclusão recebidos no callback da Meta. Guarda só o IGSID e o resultado — os dados pessoais em si são apagados no momento do pedido.';
