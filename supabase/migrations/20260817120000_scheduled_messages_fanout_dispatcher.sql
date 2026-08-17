-- ============================================================================
-- Disparo agendado: fan-out por job (paralelismo entre organizações)
--
-- PROBLEMA
-- O cron antigo fazia UM http_post por minuto. A edge function processava até
-- 50 agendamentos em série dividindo um orçamento único de 50 segundos. Como o
-- delay antibloqueio entre contatos é um sleep bloqueante (default 10s), um
-- disparo grande consumia o minuto inteiro, todo minuto, e — por ser sempre o
-- mais antigo na ordenação por next_execution_at — voltava a ganhar a fila na
-- rodada seguinte. Resultado: uma org com 300+ contatos deixava TODAS as outras
-- sem enviar nada por horas.
--
-- SOLUÇÃO
-- O cron passa a despachar um http_post POR AGENDAMENTO vencido, e a função
-- recebe { scheduled_id } cuidando só daquele disparo, com orçamento próprio.
-- N orgs enviando ao mesmo tempo = N invocações em paralelo.
--
-- SERIALIZAÇÃO POR ORGANIZAÇÃO (DISTINCT ON)
-- Despachamos no máximo UM agendamento por organização por rodada. O delay
-- antibloqueio protege o NÚMERO do WhatsApp; se dois agendamentos da mesma org
-- rodassem em paralelo pelo mesmo número, a cadência dobraria e o delay perderia
-- o sentido — risco de ban. Serializar por org é conservador (uma org com dois
-- números não ganha paralelismo interno) mas é sempre seguro. Paralelizar por
-- instância exigiria resolver o número em SQL, replicando a precedência de
-- resolveWhatsAppInstance — não vale a duplicação de regra.
-- ============================================================================

-- Progresso por JID no envio para grupos.
-- Formato: { "<jid>": { "status": "sent" | "failed", "error": "..." } }
-- Sem isto, o loop de grupos (que agora respeita orçamento de tempo) reenviaria
-- para TODOS os grupos ao retomar, duplicando mensagens.
ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS group_progress jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.scheduled_messages.group_progress IS
  'Progresso por JID do envio para grupos: {"<jid>": {"status":"sent|failed","error":"..."}}. Zerado a cada nova ocorrência de recorrência.';

-- Índices para o dispatcher e para a busca de contatos pendentes.
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_dispatch_pending
  ON public.scheduled_messages (status, next_execution_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_dispatch_stale
  ON public.scheduled_messages (status, updated_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_message_contacts_pending
  ON public.scheduled_message_contacts (scheduled_message_id, status);

-- ----------------------------------------------------------------------------
-- Cron dispatcher.
-- cron.schedule com um nome já existente ATUALIZA o job, então isto substitui o
-- cron antigo sem janela sem agendador.
--
-- O intervalo de 3 minutos do lock órfão precisa ser IGUAL ao STALE_LOCK_MS da
-- edge function. Um job saudável renova updated_at a cada 30s (heartbeat), então
-- nunca cai nesse ramo por mais longo que seja.
--
-- LIMIT 60: teto de despachos por rodada, para não criar uma avalanche de
-- invocações se muitos agendamentos vencerem juntos. Os mais antigos vão
-- primeiro; o resto entra na rodada seguinte.
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
    WHERE (
            sm.status = 'pending'
            AND sm.next_execution_at <= now()
            AND (sm.batch_paused_until IS NULL OR sm.batch_paused_until <= now())
          )
       OR (
            sm.status = 'processing'
            AND sm.updated_at < now() - interval '3 minutes'
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
