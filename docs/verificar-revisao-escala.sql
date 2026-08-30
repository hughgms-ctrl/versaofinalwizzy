-- Verificação do bloco SQL de docs/REVISAO_ESCALA_LANCAMENTO.md (seção 5)
-- Rodar cada bloco no SQL Editor. O "esperado" está no comentário de cada um.

-- ============ 1. ÍNDICES (esperado: 10 linhas, todas com valid = true) ============
SELECT i.indexrelid::regclass AS indice, i.indrelid::regclass AS tabela, i.indisvalid AS valid
FROM pg_index i
WHERE i.indexrelid::regclass::text IN (
  'idx_messages_zapi_message_id',
  'idx_flow_executions_conversation_live',
  'idx_flow_executions_running_started',
  'idx_contact_tags_tag_contact',
  'idx_contacts_wa_lid',
  'idx_contacts_name_trgm','idx_contacts_phone_trgm','idx_contacts_email_trgm',
  'idx_agent_execution_logs_org_created',
  'organization_usage_org_period_uidx'
)
ORDER BY 1;
-- valid = false significa que o CREATE INDEX CONCURRENTLY falhou no meio: DROP INDEX e rodar de novo.

SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';   -- esperado: 1 linha

-- ============ 2. CRONS (esperado: process-flow-timeouts e auto-close-conversations + 4 purge-* novos) ============
SELECT jobname, schedule, active,
       command LIKE '%supabase.co%' AS url_ok,      -- FALSE = ficou o placeholder <URL>, precisa corrigir
       left(command, 90) AS trecho
FROM cron.job
WHERE jobname IN ('process-flow-timeouts','auto-close-conversations',
                  'purge-flow-executions-done','purge-ig-webhook-events',
                  'purge-notifications','purge-media-transcriptions')
ORDER BY jobname;

-- Se url_ok = false, corrigir assim (cron.schedule com o mesmo nome substitui):
-- SELECT cron.schedule('process-flow-timeouts', '* * * * *', $cron$
--   SELECT net.http_post(url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/process-flow-timeouts',
--     headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 55000);
-- $cron$);
-- (idem para auto-close-conversations)

-- Execuções recentes: esperado status = 'succeeded' nas últimas rodadas (aguardar 2–3 min após criar)
SELECT j.jobname, d.status, d.start_time, left(d.return_message, 80) AS msg
FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname IN ('process-flow-timeouts','auto-close-conversations')
ORDER BY d.start_time DESC LIMIT 10;

-- A edge function respondeu? (esperado: status_code 200 nas últimas chamadas)
SELECT id, status_code, left(content::text, 120) AS body, created
FROM net._http_response
WHERE created > now() - interval '10 minutes'
ORDER BY created DESC LIMIT 10;
-- status_code 401 = a function está com verify_jwt ligado no painel; 404 = URL errada; NULL/timeout = function não respondeu.

-- ============ 3. FUNÇÕES / RPCs (esperado: 5 linhas) ============
SELECT proname, prosecdef AS security_definer
FROM pg_proc
WHERE proname IN ('claim_campaign_queue','increment_ai_usage','increment_unread',
                  'merge_conversation_metadata','messages_fill_org')
ORDER BY 1;

-- Trigger de tag foi substituída? (esperado: o corpo contém "NOT EXISTS" e a URL real)
SELECT prosrc LIKE '%NOT EXISTS%' AS curto_circuito_ok,
       prosrc LIKE '%supabase.co%' AS url_ok
FROM pg_proc WHERE proname = 'handle_contact_tag_added_campaign';

-- ============ 4. COLUNAS NOVAS (esperado: 2 linhas) ============
SELECT table_name, column_name
FROM information_schema.columns
WHERE (table_name, column_name) IN (('messages','organization_id'), ('campaign_queue','claimed_at'));

-- Trigger de preenchimento (esperado: 1 linha)
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_messages_fill_org';

-- Backfill de messages.organization_id: quanto falta? (esperado após o backfill: 0)
SELECT count(*) AS faltam FROM public.messages WHERE organization_id IS NULL;
-- Se > 0, repetir até dar 0:
-- UPDATE public.messages m SET organization_id = c.organization_id FROM public.conversations c
--  WHERE c.id = m.conversation_id AND m.organization_id IS NULL
--    AND m.id IN (SELECT id FROM public.messages WHERE organization_id IS NULL LIMIT 50000);
-- Depois: CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_org_created ON public.messages (organization_id, created_at DESC);

-- ============ 5. TESTE FUNCIONAL RÁPIDO ============
-- a) claim atômico não deve devolver nada quando não há pendente (esperado: 0 linhas, sem erro)
SELECT id FROM public.claim_campaign_queue(1);

-- b) contador atômico (esperado: ai_requests sobe 1 e depois volta) — usa uma org real qualquer
-- SELECT public.increment_ai_usage('<org_uuid>', to_char(now(),'YYYY-MM'));
-- SELECT ai_requests FROM organization_usage WHERE organization_id='<org_uuid>' AND period=to_char(now(),'YYYY-MM');
-- UPDATE organization_usage SET ai_requests = ai_requests - 1 WHERE organization_id='<org_uuid>' AND period=to_char(now(),'YYYY-MM');

-- c) os índices novos estão sendo usados? (esperado: Index Scan / Bitmap ... idx_messages_zapi_message_id)
EXPLAIN (COSTS OFF) SELECT id FROM public.messages WHERE zapi_message_id = 'x';
EXPLAIN (COSTS OFF) SELECT id FROM public.flow_executions
  WHERE conversation_id = gen_random_uuid() AND status IN ('running','waiting_input','waiting_delay');

-- ============ 7. CAIXA-PRETA DA ENTRADA (B3, migration 20260830150000) ============
SELECT to_regclass('public.inbound_events') AS tabela;              -- esperado: public.inbound_events
SELECT proname FROM pg_proc
WHERE proname IN ('claim_inbound_events', 'purge_inbound_events');  -- esperado: 2 linhas

-- Fila do reprocesso. 'pending' com mais de 5 min significa que o cron
-- reprocess-inbound-events não está rodando (ou está falhando).
SELECT status, count(*), min(created_at) AS mais_antigo
FROM public.inbound_events
GROUP BY status ORDER BY status;

-- Os que esgotaram as 3 tentativas: cada um é uma mensagem que não entrou.
SELECT id, event_type, instance_name, provider_message_id, attempts, left(coalesce(last_error,''), 200) AS erro
FROM public.inbound_events
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 20;

-- ============ 8. GUARDA CONTRA FLUXO DUPLICADO (B5) ============
-- Criação: docs/fechar-execucoes-duplicadas.sql (o par é (conversation_id, flow_id)).
SELECT indexrelid::regclass AS indice, indisvalid AS valid
FROM pg_index WHERE indexrelid::regclass::text = 'idx_flow_executions_one_live';
