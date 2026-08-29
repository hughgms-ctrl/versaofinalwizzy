-- B7 (docs/REVISAO_ESCALA_LANCAMENTO.md): heartbeat por nó em flow_executions.
--
-- O flow-execute grava last_heartbeat_at a cada nó executado. A fase 0 do
-- process-flow-timeouts (rede de proteção contra execução zumbi em 'running')
-- passa a fechar quem está sem batimento há 3 min, em vez de esperar 15 min
-- por started_at — 15 min era o tempo que a conversa do lead ficava muda.
--
-- Os dois lados funcionam sem esta migration (o flow-execute detecta a coluna
-- ausente e grava sem ela; o cron cai no critério antigo).
--
-- APLICAR À MÃO no SQL Editor (nunca supabase db push).

ALTER TABLE public.flow_executions ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_flow_executions_running_heartbeat
  ON public.flow_executions (last_heartbeat_at)
  WHERE status = 'running';
