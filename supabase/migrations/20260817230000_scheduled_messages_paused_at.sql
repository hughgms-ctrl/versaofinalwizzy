-- ============================================================================
-- Pausar/retomar um disparo agendado pelo painel
--
-- POR QUE UMA COLUNA E NÃO UM STATUS NOVO
-- O motor escreve `status` o tempo todo: claim faz pending→processing e, quando
-- um lote acaba ou o orçamento de tempo estoura, o run devolve processing→pending.
-- Se "pausado" fosse um status, pausar um disparo EM ANDAMENTO seria sobrescrito
-- pelo próprio run alguns segundos depois — o usuário veria "Pausado" e o envio
-- continuaria. `paused_at` é uma coluna que o motor só LÊ, nunca escreve: o run
-- em andamento termina sua fatia normalmente, devolve o job para 'pending', e aí
-- ele fica parado porque toda porta de entrada exige paused_at IS NULL.
--
-- Retomar = paused_at NULL. O progresso por contato (scheduled_message_contacts)
-- não é tocado, então o disparo continua de onde parou, sem reenviar ninguém.
-- ============================================================================

ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

COMMENT ON COLUMN public.scheduled_messages.paused_at IS
  'Pausa manual do disparo (painel). NOT NULL = parado por decisão do usuário. Só o app escreve; o motor apenas exige paused_at IS NULL para pegar o job. Diferente de batch_paused_until, que é a pausa automática entre lotes.';

-- Rede de segurança: se por algum motivo a migration do fan-out não tiver sido
-- aplicada, esta coluna precisa existir do mesmo jeito (o motor grava progresso
-- de grupo nela). ADD COLUMN IF NOT EXISTS é idempotente.
ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS group_progress jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- Dispatcher do cron: não despachar job pausado.
-- cron.schedule com nome existente ATUALIZA o job. Este bloco repete o
-- dispatcher de 20260817120000 acrescentando o filtro de pausa — assim o estado
-- final é o certo independente da ordem em que as duas migrations forem aplicadas.
--
-- O filtro aqui é otimização (evita invocação à toa): quem realmente garante a
-- pausa é o claim dentro da edge function, que também exige paused_at IS NULL.
-- ----------------------------------------------------------------------------
SELECT cron.schedule(
  'process-scheduled-messages',
  '* * * * *',
  $cron$
  WITH devidos AS (
    SELECT DISTINCT ON (sm.organization_id)
           sm.id,
           sm.next_execution_at
    FROM public.scheduled_messages sm
    WHERE sm.paused_at IS NULL
      AND (
            (
              sm.status = 'pending'
              AND sm.next_execution_at <= now()
              AND (sm.batch_paused_until IS NULL OR sm.batch_paused_until <= now())
            )
         OR (
              sm.status = 'processing'
              AND sm.updated_at < now() - interval '3 minutes'
            )
          )
    ORDER BY sm.organization_id, sm.next_execution_at NULLS FIRST
  ),
  limitado AS (
    SELECT id
    FROM devidos
    ORDER BY next_execution_at NULLS FIRST
    LIMIT 60
  )
  SELECT net.http_post(
    url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/process-scheduled-messages',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('scheduled_id', limitado.id)
  )
  FROM limitado;
  $cron$
);
