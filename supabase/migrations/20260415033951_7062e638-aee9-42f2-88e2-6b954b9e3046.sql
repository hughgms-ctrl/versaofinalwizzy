
-- Clean up stale flow_executions stuck in 'waiting_input' with no timeout
-- These are old campaign executions where the message was sent but the contact never replied
UPDATE flow_executions
SET status = 'completed',
    completed_at = now(),
    error_message = 'Auto-encerrado: contato não respondeu'
WHERE status = 'waiting_input'
  AND timeout_at IS NULL
  AND started_at < now() - interval '48 hours';
