-- Semana 4 (docs/REVISAO_ESCALA_LANCAMENTO.md) — retrato de saude do backend.
--
-- Hoje o Sentry so enxerga o navegador. Se um cron para, se mensagem fica presa
-- na fila de reprocesso ou se a fila do pg_net infla, o unico rastro e o log da
-- edge function — que ninguem olha as 3 da manha, que e exatamente quando essas
-- coisas acontecem.
--
-- Esta funcao junta os numeros num JSON so. Ela mora no banco porque precisa
-- enxergar os schemas `cron` e `net`, que o PostgREST nao expoe. Quem decide o
-- que e alarme e a edge function health-watchdog.
--
-- Tudo aqui e leitura e agregacao: nada muda estado.
--
-- APLICAR A MAO no SQL Editor (nunca supabase db push).

-- A varredura por cron sem indice fica cara conforme job_run_details cresce
-- (16 jobs de minuto = ~23 mil linhas por dia). Se nao houver permissao para
-- criar o indice no schema da extensao, seguir sem ele.
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_cron_job_run_details_start
    ON cron.job_run_details (start_time DESC);
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE 'Sem permissao para indexar cron.job_run_details; seguindo sem o indice.';
END $$;

CREATE OR REPLACE FUNCTION public.wz_health_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_crons jsonb;
  v_pg_net integer;
  v_resultado jsonb;
BEGIN
  -- UMA passada em job_run_details (janela de 2 h), agrupada por job, em vez de
  -- duas subconsultas por job.
  WITH recentes AS (
    SELECT jobid,
           max(start_time) FILTER (WHERE status = 'succeeded') AS ultimo_sucesso,
           count(*) FILTER (WHERE status <> 'succeeded') AS falhas
      FROM cron.job_run_details
     WHERE start_time > now() - interval '2 hours'
     GROUP BY jobid
  )
  SELECT coalesce(jsonb_object_agg(j.jobname, jsonb_build_object(
           'ativo', j.active,
           'agenda', j.schedule,
           'ultimo_sucesso', r.ultimo_sucesso,
           'segundos_desde_sucesso',
             CASE WHEN r.ultimo_sucesso IS NULL THEN NULL
                  ELSE extract(epoch FROM now() - r.ultimo_sucesso)::int END,
           'falhas_2h', coalesce(r.falhas, 0)
         )), '{}'::jsonb)
    INTO v_crons
    FROM cron.job j
    LEFT JOIN recentes r ON r.jobid = j.jobid;

  -- pg_net pode nao estar instalado: SQL dinamico para nao quebrar o plano.
  BEGIN
    IF to_regclass('net.http_request_queue') IS NOT NULL THEN
      EXECUTE 'SELECT count(*)::int FROM net.http_request_queue' INTO v_pg_net;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_pg_net := NULL;
  END;

  SELECT jsonb_build_object(
    'agora', now(),
    'crons', v_crons,
    'pg_net_fila', v_pg_net,

    -- Entrada de mensagens: 'pending' velho = mensagem que entrou e nao virou
    -- conversa; 'failed' = mensagem que esgotou as tentativas, ou seja, perdida.
    'inbound_pendentes_10min', (
      SELECT count(*)::int FROM public.inbound_events
       WHERE status = 'pending' AND created_at < now() - interval '10 minutes'),
    'inbound_pendente_mais_antigo', (
      SELECT min(created_at) FROM public.inbound_events WHERE status = 'pending'),
    'inbound_falhados_24h', (
      SELECT count(*)::int FROM public.inbound_events
       WHERE status = 'failed' AND created_at > now() - interval '24 hours'),

    -- Item de campanha preso: o claim libera depois de 10 min, entao acima
    -- disso e sinal de que ninguem esta consumindo a fila.
    'campaign_queue_presos', (
      SELECT count(*)::int FROM public.campaign_queue
       WHERE status = 'processing' AND claimed_at < now() - interval '15 minutes'),
    'campaign_queue_pendentes_vencidos', (
      SELECT count(*)::int FROM public.campaign_queue
       WHERE status = 'pending' AND scheduled_for < now() - interval '15 minutes'),

    -- Execucao zumbi: 'running' sem batimento. E o que emudece a conversa do
    -- lead para sempre (a fase 0 do process-flow-timeouts existe para isso).
    'flow_executions_zumbis', (
      SELECT count(*)::int FROM public.flow_executions
       WHERE status = 'running'
         AND started_at < now() - interval '15 minutes'
         AND (last_heartbeat_at IS NULL OR last_heartbeat_at < now() - interval '15 minutes')),

    -- Agendamento vencido que ninguem pegou. `batch_paused_until` no futuro e
    -- pausa DELIBERADA entre lotes: nao e atraso.
    'agendamentos_atrasados', (
      SELECT count(*)::int FROM public.scheduled_messages
       WHERE status = 'pending'
         AND next_execution_at < now() - interval '10 minutes'
         AND (batch_paused_until IS NULL OR batch_paused_until <= now())),

    -- 'processing' parado: o dispatcher reassume depois de 3 min, entao acima
    -- de 15 min ninguem esta processando.
    'agendamentos_presos', (
      SELECT count(*)::int FROM public.scheduled_messages
       WHERE status = 'processing' AND updated_at < now() - interval '15 minutes')
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.wz_health_snapshot() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wz_health_snapshot() TO service_role;

-- Conferencia depois de aplicar (esperado: um JSON com 'crons' preenchido):
--   SELECT jsonb_pretty(public.wz_health_snapshot());

-- Agenda o vigia. A URL ja vem preenchida com o projeto real (placeholder <URL>
-- em SQL para colar ja custou um cron quebrado antes).
-- Sem Authorization: a function esta com verify_jwt = false, como os outros crons.
SELECT cron.schedule('health-watchdog', '*/5 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/health-watchdog',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$cron$);

-- Conferencia (esperado: 1 linha ativa e, 5 min depois, status 'succeeded'):
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'health-watchdog';
--   SELECT d.status, d.start_time, left(d.return_message, 80)
--     FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
--    WHERE j.jobname = 'health-watchdog' ORDER BY d.start_time DESC LIMIT 5;
