-- ============================================================================
-- Diagnóstico 2: por que o job vencido não é "clamado" (claimScheduled)
--
-- O primeiro diagnóstico mostrou, às 20:07 BRT:
--   {"message":"Processing complete","mode":"scan","processed":0,"failed":0,"total":1}
-- => o cron chamou, a função ACHOU 1 agendamento vencido e não processou nenhum.
--    No código isso só acontece quando claimScheduled() devolve null.
--
-- Esta consulta é UMA única statement (o SQL Editor do Supabase só mostra o
-- resultado da última) e devolve tudo em um JSON: estado do cron, se a migration
-- do fan-out subiu, o estado de cada agendamento e — o principal — se ele passa
-- ou não em cada ramo do WHERE do claim.
-- ============================================================================

SELECT jsonb_pretty(jsonb_build_object(

  'agora_brt', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS'),

  -- Zero/false = migration 20260817120000 não subiu = cron ainda em modo varredura.
  'migration_fanout_aplicada', EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name  = 'scheduled_messages'
      AND column_name = 'group_progress'
  ),

  'cron', (
    SELECT jsonb_agg(jsonb_build_object(
      'jobname',  j.jobname,
      'schedule', j.schedule,
      'active',   j.active,
      -- 'WITH devidos AS' = dispatcher novo. net.http_post solto = cron antigo.
      'command',  left(j.command, 300)
    ))
    FROM cron.job j
    WHERE j.command ILIKE '%process-scheduled-messages%'
  ),

  'jobs', (
    SELECT jsonb_agg(jsonb_build_object(
      'id',                 s.id,
      'nome',               s.name,
      'org',                s.organization_id,
      'workspace',          s.workspace_id,
      'status',             s.status,
      'target_type',        s.target_type,
      'proxima_exec_brt',   to_char(s.next_execution_at   AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS'),
      'ultima_exec_brt',    to_char(s.last_executed_at    AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS'),
      'updated_at_brt',     to_char(s.updated_at          AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS'),
      'pausa_ate_brt',      to_char(s.batch_paused_until  AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS'),
      'lote',               jsonb_build_object(
                              'size_max',      s.batch_size_max,
                              'pause_minutes', s.batch_pause_minutes,
                              'sent_count',    s.batch_sent_count,
                              'current_target',s.batch_current_target
                            ),
      'erro',               s.error_message,

      -- Mesmo predicado do SELECT do modo varredura da edge function.
      'elegivel_no_scan',   (
        (s.status = 'pending'
          AND s.next_execution_at <= now()
          AND (s.batch_paused_until IS NULL OR s.batch_paused_until <= now()))
        OR (s.status = 'processing' AND s.updated_at < now() - interval '3 minutes')
      ),

      -- Mesmo predicado do UPDATE do claimScheduled (sem next_execution_at).
      'claim_ramo_pending', (s.status = 'pending'
                              AND (s.batch_paused_until IS NULL OR s.batch_paused_until <= now())),
      'claim_ramo_orfao',   (s.status = 'processing'
                              AND s.updated_at < now() - interval '3 minutes'),

      -- Quanto falta para o lock órfão expirar (quando status = 'processing').
      'lock_expira_em_seg', CASE WHEN s.status = 'processing'
                                 THEN round(extract(epoch FROM (s.updated_at + interval '3 minutes' - now())))
                            END,

      'contatos', (
        SELECT jsonb_object_agg(x.status, x.n)
        FROM (
          SELECT c.status, count(*) AS n
          FROM public.scheduled_message_contacts c
          WHERE c.scheduled_message_id = s.id
          GROUP BY c.status
        ) x
      ),
      'ultimo_envio_contato_brt', (
        SELECT to_char(max(c.sent_at) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS')
        FROM public.scheduled_message_contacts c
        WHERE c.scheduled_message_id = s.id
      )
    ))
    FROM public.scheduled_messages s
    WHERE s.status IN ('pending', 'processing')
       OR s.last_executed_at > now() - interval '24 hours'
  )

)) AS diagnostico;
