-- Fila de follow-ups do Instagram: trava atômica + janela de 24h + cron versionado.
--
-- Três problemas do mesmo caminho de código (instagram-process-followups),
-- corrigidos juntos porque a função é reescrita uma vez só.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. TRAVA ATÔMICA (envio duplicado)
--
-- PROBLEMA: a drenagem fazia SELECT status='pending' e só marcava 'sent' DEPOIS
-- do envio, com um fetch de rede por linha, em série. O cron roda a cada minuto;
-- se um lote de 50 passar de 60s, a execução seguinte seleciona exatamente as
-- mesmas linhas ainda 'pending' e envia tudo de novo. Para o cliente isso é a
-- mesma DM chegando duas vezes — e para a conta dele, sinal de spam.
--
-- SOLUÇÃO: um estado intermediário 'sending' com o instante da reserva. Quem
-- pega a linha muda o status ANTES de enviar (claim), então a execução seguinte
-- não a enxerga mais como pendente.
ALTER TABLE public.instagram_pending_followups
  DROP CONSTRAINT IF EXISTS instagram_pending_followups_status_check;

ALTER TABLE public.instagram_pending_followups
  ADD CONSTRAINT instagram_pending_followups_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'error', 'skipped'));

ALTER TABLE public.instagram_pending_followups
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.instagram_pending_followups.claimed_at IS
  'Quando esta linha foi reservada para envio. Serve para destravar linhas presas em sending (função morta no meio do envio).';
COMMENT ON COLUMN public.instagram_pending_followups.attempts IS
  'Tentativas de envio. Evita que uma linha que sempre falha seja reprocessada para sempre.';

-- Reserva atômica: o UPDATE ... RETURNING é uma única instrução, então duas
-- execuções concorrentes não conseguem reservar a mesma linha — a segunda não
-- encontra mais status='pending' e volta vazia.
--
-- Também recupera linhas presas em 'sending' há mais de 5 minutos: se a função
-- morreu depois de reservar e antes de concluir, sem isso a linha ficaria
-- travada para sempre.
CREATE OR REPLACE FUNCTION public.claim_instagram_followups(p_limit INTEGER DEFAULT 50)
RETURNS SETOF public.instagram_pending_followups
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.instagram_pending_followups
     SET status = 'sending',
         claimed_at = now(),
         attempts = attempts + 1
   WHERE id IN (
     SELECT id
       FROM public.instagram_pending_followups
      WHERE resume_at <= now()
        AND attempts < 3
        AND (
          status = 'pending'
          OR (status = 'sending' AND claimed_at < now() - INTERVAL '5 minutes')
        )
      ORDER BY resume_at
      -- SKIP LOCKED: se outra execução já está com a linha, siga em frente em
      -- vez de esperar por ela.
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit
   )
  RETURNING *;
$$;

COMMENT ON FUNCTION public.claim_instagram_followups(INTEGER) IS
  'Reserva atomicamente follow-ups vencidos para envio, marcando-os como sending. Evita que execuções concorrentes do cron enviem a mesma mensagem duas vezes.';

REVOKE ALL ON FUNCTION public.claim_instagram_followups(INTEGER) FROM PUBLIC, anon, authenticated;

-- Índice alinhado à nova consulta de reserva (filtra por resume_at + status).
CREATE INDEX IF NOT EXISTS idx_instagram_pending_followups_claim
  ON public.instagram_pending_followups(resume_at)
  WHERE status IN ('pending', 'sending');

-- ───────────────────────────────────────────────────────────────────────────
-- 2. JANELA DE 24 HORAS
--
-- PROBLEMA: a Meta só permite DM comum enquanto a janela de 24h estiver aberta,
-- contada a partir da ÚLTIMA mensagem que a pessoa enviou. O follow-up (que a UI
-- deixa agendar em dias) era disparado sem consultar isso: se a pessoa nunca
-- respondeu, a mensagem é recusada pela Meta e a linha era marcada 'error',
-- como se fosse falha técnica. Pior: a resposta pós-comentário já era enviada
-- pela API de janela sem nunca ter havido janela nenhuma.
--
-- SOLUÇÃO: registrar o instante da última mensagem RECEBIDA (inbound). É o único
-- evento que abre a janela — mensagem enviada por nós não abre.
ALTER TABLE public.instagram_conversations
  ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.instagram_conversations.last_inbound_at IS
  'Última mensagem recebida do contato. Abre a janela de 24h da Meta para DM comum. Diferente de last_message_at, que também é atualizado pelas mensagens que enviamos.';

-- Retroativo: para conversas já existentes, a última mensagem inbound registrada
-- é a melhor aproximação disponível. Sem isso, toda conversa antiga pareceria
-- "janela nunca aberta".
UPDATE public.instagram_conversations conv
   SET last_inbound_at = sub.last_inbound
  FROM (
    SELECT conversation_id, MAX(created_at) AS last_inbound
      FROM public.instagram_messages
     WHERE direction = 'inbound'
     GROUP BY conversation_id
  ) sub
 WHERE conv.id = sub.conversation_id
   AND conv.last_inbound_at IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. CRON VERSIONADO
--
-- PROBLEMA: o agendamento do process-followups existia apenas como COMENTÁRIO no
-- final da edge function, para aplicação manual. Se ninguém rodou aquele SQL à
-- mão, nenhum follow-up jamais foi enviado — e não há como saber por leitura do
-- repositório. Aqui ele passa a ser versionado como qualquer outro objeto.
--
-- Aditivo (cron.schedule é idempotente por nome), então sobrevive ao Lovable sync.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'instagram-process-followups',
      '* * * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/instagram-process-followups',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := '{}'::jsonb
        );
      $cron$
    );

    -- Renovação do token de 60 dias. Semanal, com janela de 21 dias de
    -- antecedência no código da função: uma execução perdida (deploy, falha do
    -- cron) não deixa nenhum token vencer.
    PERFORM cron.schedule(
      'instagram-refresh-tokens',
      '17 4 * * 1',
      $cron$
        SELECT net.http_post(
          url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/instagram-refresh-tokens',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := '{}'::jsonb
        );
      $cron$
    );
  END IF;
END $$;
