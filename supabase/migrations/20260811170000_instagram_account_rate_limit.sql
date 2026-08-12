-- Rate limit de envio POR CONTA do Instagram.
--
-- PROBLEMA: o único limite existente é `rate_limit.max_per_contact_per_day` na
-- regra — quantas vezes o MESMO contato pode ser atingido. Isso não protege o
-- que realmente derruba a conta do cliente: o volume total que a conta dispara.
-- Um post que viraliza traz 500 comentários em minutos, e o Engage responde a
-- todos em rajada. A Meta lê isso como spam e o custo não é a mensagem perdida
-- — é a conta do cliente restrita.
--
-- Os tetos da Meta não são publicados como número exato e variam por conta e
-- reputação. Os defaults abaixo (2/s e 200/h) são os valores de referência que
-- a comunidade usa e que o produto-referência adota; ficam configuráveis por
-- conta justamente porque a Meta pode ser mais generosa ou mais dura caso a
-- caso.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. LEDGER DE ENVIOS
--
-- Uma linha por mensagem que sai. Precisa ser tabela própria, e não uma
-- contagem sobre instagram_messages, por dois motivos:
--   a) instagram_messages só recebe a linha DEPOIS do envio dar ok — o que
--      significa contar o que já saiu, tarde demais para segurar a rajada;
--   b) mensagem enviada à mão pelo atendente também consome cota da conta na
--      Meta, então tem de entrar na mesma conta corrente.
CREATE TABLE IF NOT EXISTS public.instagram_send_ledger (
  id BIGSERIAL PRIMARY KEY,
  instagram_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- 'automation' (regra), 'followup' (fila) ou 'manual' (inbox). Serve para
  -- responder "quem comeu a cota" quando o cliente reclamar que a automação
  -- parou de responder no meio de um post viral.
  source TEXT NOT NULL DEFAULT 'automation'
    CHECK (source IN ('automation', 'followup', 'manual')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- O índice serve às duas janelas consultadas na reserva (1 segundo e 1 hora).
CREATE INDEX IF NOT EXISTS idx_instagram_send_ledger_account_time
  ON public.instagram_send_ledger(instagram_account_id, created_at DESC);

COMMENT ON TABLE public.instagram_send_ledger IS
  'Conta corrente de mensagens enviadas por conta do Instagram. Base do rate limit por conta (não por contato) — protege o teto da Meta.';

ALTER TABLE public.instagram_send_ledger ENABLE ROW LEVEL SECURITY;

-- Só leitura, e só da própria organização: o ledger alimenta diagnóstico na
-- tela ("a automação parou porque a conta atingiu o teto"). A escrita é
-- exclusiva das edge functions, via service role.
CREATE POLICY "Users can view send ledger from their organization"
  ON public.instagram_send_ledger FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

-- ───────────────────────────────────────────────────────────────────────────
-- 2. TETOS CONFIGURÁVEIS POR CONTA
ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS send_rate_limit JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.instagram_accounts.send_rate_limit IS
  'Tetos de envio desta conta: { max_per_second?: number, max_per_hour?: number }. Vazio usa os defaults de reserve_instagram_send_slot (2/s, 200/h).';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RESERVA ATÔMICA DE COTA
--
-- Checar-e-depois-enviar em duas etapas não funciona aqui: dez execuções
-- concorrentes do webhook leriam a mesma contagem "abaixo do teto" e todas
-- enviariam. A contagem e a gravação precisam ser uma instrução só.
--
-- O INSERT ... SELECT resolve isso: o SELECT filtra pela contagem e o INSERT
-- grava; se o teto foi atingido, o SELECT não devolve linha e nada é inserido.
-- O retorno booleano diz ao chamador se ele PODE enviar.
CREATE OR REPLACE FUNCTION public.reserve_instagram_send_slot(
  p_account_id UUID,
  p_source TEXT DEFAULT 'automation'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_limits jsonb;
  v_max_per_second integer;
  v_max_per_hour integer;
  v_inserted bigint;
BEGIN
  SELECT organization_id, send_rate_limit
    INTO v_org, v_limits
    FROM public.instagram_accounts
   WHERE id = p_account_id;

  IF v_org IS NULL THEN
    RETURN false;
  END IF;

  v_max_per_second := COALESCE((v_limits->>'max_per_second')::integer, 2);
  v_max_per_hour   := COALESCE((v_limits->>'max_per_hour')::integer, 200);

  -- Um lock por conta serializa as reservas concorrentes DESTA conta (e só
  -- dela). Sem ele, duas transações simultâneas ainda enxergariam o mesmo
  -- snapshot de contagem no READ COMMITTED e ambas passariam pelo teto.
  PERFORM pg_advisory_xact_lock(hashtext('ig_send_slot:' || p_account_id::text));

  INSERT INTO public.instagram_send_ledger (instagram_account_id, organization_id, source)
  SELECT p_account_id, v_org, p_source
   WHERE (
     SELECT count(*) FROM public.instagram_send_ledger
      WHERE instagram_account_id = p_account_id
        AND created_at > now() - INTERVAL '1 second'
   ) < v_max_per_second
     AND (
     SELECT count(*) FROM public.instagram_send_ledger
      WHERE instagram_account_id = p_account_id
        AND created_at > now() - INTERVAL '1 hour'
   ) < v_max_per_hour;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted > 0;
END;
$$;

COMMENT ON FUNCTION public.reserve_instagram_send_slot(UUID, TEXT) IS
  'Reserva atomicamente uma vaga de envio para a conta, respeitando os tetos por segundo e por hora. Retorna false quando o teto foi atingido — o chamador NÃO deve enviar.';

REVOKE ALL ON FUNCTION public.reserve_instagram_send_slot(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. QUICK REPLY: ENVIO DO LINK UMA VEZ SÓ
--
-- O toque no quick reply chega como mensagem comum no webhook, e nada impede a
-- pessoa de tocar de novo — a chip continua na conversa. Sem marca de "já
-- respondi a este", cada toque mandaria outro link, o que é exatamente o
-- comportamento de spam que o resto desta migration tenta evitar.
--
-- A marca vive no tracked link porque é ele que o payload carrega.
ALTER TABLE public.instagram_tracked_links
  ADD COLUMN IF NOT EXISTS link_sent_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.instagram_tracked_links.link_sent_at IS
  'Quando o link foi enviado em resposta ao toque no quick reply. Preenchido atomicamente para que toques repetidos não gerem envios repetidos.';

-- Reserva o direito de enviar: o UPDATE só encontra a linha se link_sent_at
-- ainda estiver NULL, então dois toques simultâneos resultam em um envio só —
-- o segundo não acha linha para atualizar e recebe false.
CREATE OR REPLACE FUNCTION public.claim_instagram_link_send(p_link_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated bigint;
BEGIN
  UPDATE public.instagram_tracked_links
     SET link_sent_at = now()
   WHERE id = p_link_id
     AND link_sent_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.claim_instagram_link_send(UUID) IS
  'Reserva o envio do link de um quick reply. Retorna true apenas na primeira chamada — toques repetidos na mesma chip não devem gerar novas mensagens.';

REVOKE ALL ON FUNCTION public.claim_instagram_link_send(UUID) FROM PUBLIC, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. LIMPEZA
--
-- O ledger só é consultado na janela de 1 hora. Guardar 7 dias dá folga para
-- diagnóstico ("o que aconteceu na terça?") sem deixar a tabela crescer para
-- sempre — em conta movimentada são milhares de linhas por dia.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'instagram-send-ledger-cleanup',
      '23 3 * * *',
      $cron$
        DELETE FROM public.instagram_send_ledger
         WHERE created_at < now() - INTERVAL '7 days';
      $cron$
    );
  END IF;
END $$;
