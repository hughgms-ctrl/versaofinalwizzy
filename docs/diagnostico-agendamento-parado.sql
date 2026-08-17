-- ============================================================================
-- Diagnóstico: disparo agendado parado (rodar no SQL Editor do Supabase)
--
-- Contexto: último envio 17/08 14:11 (BRT), nada depois disso.
-- O banco trabalha em UTC; 14:11 BRT = 17:11 UTC.
-- ============================================================================

-- 1) ESTADO DOS AGENDAMENTOS ------------------------------------------------
-- Olhar: status, batch_paused_until (pausa entre lotes) e updated_at
-- (heartbeat: se um job em 'processing' tem updated_at velho, ninguém o tocou).
SELECT
  id,
  name,
  status,
  target_type,
  organization_id,
  next_execution_at   AT TIME ZONE 'America/Sao_Paulo' AS proxima_execucao_brt,
  last_executed_at    AT TIME ZONE 'America/Sao_Paulo' AS ultima_execucao_brt,
  updated_at          AT TIME ZONE 'America/Sao_Paulo' AS atualizado_brt,
  batch_paused_until  AT TIME ZONE 'America/Sao_Paulo' AS pausa_ate_brt,
  now()               AT TIME ZONE 'America/Sao_Paulo' AS agora_brt,
  batch_size_max,
  batch_pause_minutes,
  batch_sent_count,
  batch_current_target,
  delay_between_contacts,
  error_message,
  last_run_summary
FROM public.scheduled_messages
WHERE status IN ('pending', 'processing')
   OR last_executed_at > now() - interval '12 hours'
ORDER BY COALESCE(last_executed_at, next_execution_at) DESC NULLS LAST
LIMIT 20;

-- 2) PROGRESSO POR CONTATO --------------------------------------------------
-- Quantos já foram, quantos faltam e quando foi o último envio de fato.
SELECT
  smc.scheduled_message_id,
  sm.name,
  smc.status,
  count(*) AS contatos,
  max(smc.sent_at) AT TIME ZONE 'America/Sao_Paulo' AS ultimo_envio_brt
FROM public.scheduled_message_contacts smc
JOIN public.scheduled_messages sm ON sm.id = smc.scheduled_message_id
WHERE sm.status IN ('pending', 'processing')
   OR sm.last_executed_at > now() - interval '12 hours'
GROUP BY 1, 2, 3
ORDER BY 1, 3;

-- 3) O CRON ESTÁ VIVO E QUAL VERSÃO? ---------------------------------------
-- Se 'command' mostrar só um net.http_post simples, a migration do fan-out
-- (20260817120000) NÃO subiu. Se mostrar "WITH devidos AS", subiu.
SELECT jobid, jobname, schedule, active, command
FROM cron.job
WHERE jobname = 'process-scheduled-messages';

-- 4) AS ÚLTIMAS RODADAS DO CRON FALHARAM? ----------------------------------
SELECT
  d.status,
  d.return_message,
  d.start_time AT TIME ZONE 'America/Sao_Paulo' AS inicio_brt,
  d.end_time   AT TIME ZONE 'America/Sao_Paulo' AS fim_brt
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname = 'process-scheduled-messages'
ORDER BY d.start_time DESC
LIMIT 20;

-- 5) O QUE A EDGE FUNCTION RESPONDEU AO CRON -------------------------------
-- status_code 200 + '"mode":"scan"' / 'No scheduled messages' = cron chamou e a
-- função não achou nada para fazer. 401/404/500 = a chamada em si quebrou.
SELECT
  r.id,
  r.status_code,
  left(r.content, 400) AS resposta,
  r.created AT TIME ZONE 'America/Sao_Paulo' AS quando_brt
FROM net._http_response r
ORDER BY r.created DESC
LIMIT 30;

-- 6) A MIGRATION DO FAN-OUT SUBIU? -----------------------------------------
-- Zero linhas = coluna group_progress não existe = migration pendente.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'scheduled_messages'
  AND column_name = 'group_progress';
