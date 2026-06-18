-- =============================================================================
-- FASE 5 — 5A: Jobs pg_cron de retenção/limpeza
-- =============================================================================
-- Agenda DELETEs periódicos nas tabelas de log/efêmeras que crescem sem limite
-- (auditoria de performance, item "retenção"). Reduz tamanho de tabela, bloat e
-- custo de índices/varreduras.
--
-- PRÉ-REQUISITO: extensão pg_cron habilitada (Database → Extensions). Confirmado
-- pelo dono do projeto antes desta migration.
--
-- NÃO purgar auditoria legal: billing_events, admin_audit_logs,
-- conversation_origin_audit, signature_evidence — apenas arquivar se necessário.
-- Essas tabelas NÃO aparecem aqui de propósito.
--
-- Intervalos de retenção (avaliados como razoáveis, nenhum agressivo):
--   flow_node_logs ............ 90 dias  (created_at)
--   whatsapp_connection_logs .. 90 dias  (created_at)
--   agent_execution_logs ...... 180 dias (created_at)
--   entry_flow_events ......... 180 dias (created_at)
--   campaign_queue (concluída).. 30 dias (processed_at) — status terminais
--   contact_presence .......... ao expirar (expires_at) — registro efêmero
--   signature_otp_codes ....... 1 dia APÓS expirar (expires_at) — código OTP
--
-- NOTA campaign_queue: o status terminal real é 'processed' (process-campaign-
-- queue/index.ts:61) e 'failed' (:69). NÃO usar 'sent' — esse valor não existe
-- no fluxo e nunca apagaria as linhas processadas.
--
-- NOTA contact_presence/signature_otp_codes: purgados por expires_at (ambas têm
-- a coluna) em vez de created_at — semanticamente correto (apaga após expirar).
--
-- DEPLOY: aplicar este arquivo MANUALMENTE no SQL Editor do Supabase
-- (regra do projeto: NÃO usar `supabase db push`). Transacional.
-- cron.schedule faz upsert por jobname (pg_cron >= 1.4), então re-rodar é seguro.
-- =============================================================================

BEGIN;

-- Logs de execução de nós de fluxo — 90 dias
SELECT cron.schedule('purge-flow-node-logs', '0 3 * * *',
  $$DELETE FROM public.flow_node_logs WHERE created_at < now() - interval '90 days';$$);

-- Logs de conexão do WhatsApp — 90 dias
SELECT cron.schedule('purge-wa-conn-logs', '0 3 * * *',
  $$DELETE FROM public.whatsapp_connection_logs WHERE created_at < now() - interval '90 days';$$);

-- Logs de execução de agentes (IA) — 180 dias
SELECT cron.schedule('purge-agent-exec-logs', '0 3 * * *',
  $$DELETE FROM public.agent_execution_logs WHERE created_at < now() - interval '180 days';$$);

-- Eventos de entrada de fluxo — 180 dias
SELECT cron.schedule('purge-entry-flow-events', '0 3 * * *',
  $$DELETE FROM public.entry_flow_events WHERE created_at < now() - interval '180 days';$$);

-- Fila de campanhas já concluída (processed/failed) — 30 dias após processar
SELECT cron.schedule('purge-campaign-queue-done', '0 4 * * *',
  $$DELETE FROM public.campaign_queue
    WHERE status IN ('processed','failed')
      AND processed_at IS NOT NULL
      AND processed_at < now() - interval '30 days';$$);

-- Presença de contato (efêmera) — ao expirar, varredura a cada 15 min
SELECT cron.schedule('purge-contact-presence', '*/15 * * * *',
  $$DELETE FROM public.contact_presence WHERE expires_at < now();$$);

-- Códigos OTP de assinatura — 1 dia após expirar, de hora em hora
SELECT cron.schedule('purge-signature-otp', '0 * * * *',
  $$DELETE FROM public.signature_otp_codes WHERE expires_at < now() - interval '1 day';$$);

COMMIT;

-- Verificação pós-aplicação:
--   SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
-- Para remover um job, se necessário:
--   SELECT cron.unschedule('purge-flow-node-logs');
