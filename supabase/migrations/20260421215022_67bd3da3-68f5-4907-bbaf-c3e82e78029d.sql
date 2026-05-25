-- 1) Cancela follow-ups ativos em conversas onde a IA está pausada/desativada
UPDATE flow_executions fe
SET status='completed',
    timeout_at=NULL,
    completed_at=now(),
    error_message='Cancelled: AI paused/deactivated (cleanup)'
FROM conversations c
WHERE fe.conversation_id = c.id
  AND fe.status IN ('waiting_input','running')
  AND (
    fe.remarketing_step > 0
    OR (fe.variables->>'source') = 'chat_follow_up'
    OR fe.current_node_id = 'chat-follow-up'
  )
  AND (c.metadata->>'ai_paused_until') IS NOT NULL;

-- 2) Cancela execuções "running" órfãs há mais de 24h
UPDATE flow_executions
SET status='failed',
    timeout_at=NULL,
    completed_at=now(),
    error_message='Auto-cancelled: stuck running > 24h'
WHERE status='running'
  AND started_at < now() - interval '24 hours';