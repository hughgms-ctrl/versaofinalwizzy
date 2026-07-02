-- Envio em lotes ("lotes") para disparos agendados em massa.
-- Config (definido pelo usuário):
--   batch_size_max      : tamanho MÁXIMO do lote. O sistema sorteia de 1 até este
--                         valor a cada lote. NULL/0 = recurso desligado (comportamento
--                         antigo: só o intervalo entre contatos).
--   batch_pause_minutes : pausa (em minutos) entre um lote e o próximo.
-- Estado interno (gerenciado pela edge function process-scheduled-messages):
--   batch_current_target: tamanho sorteado do lote em andamento (sobrevive ao resume do cron).
--   batch_sent_count    : quantos já foram enviados no lote atual.
--   batch_paused_until   : enquanto no futuro, o agendamento está em pausa entre lotes
--                         e o cron não o processa.
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS batch_size_max integer;
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS batch_pause_minutes integer;
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS batch_current_target integer;
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS batch_sent_count integer DEFAULT 0;
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS batch_paused_until timestamptz;
