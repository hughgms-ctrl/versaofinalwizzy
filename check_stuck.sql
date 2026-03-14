SELECT 
  id, 
  status, 
  current_node_id,
  conversation_id, 
  started_at,
  timeout_at
FROM flow_executions 
ORDER BY started_at DESC 
LIMIT 5;

SELECT id, execution_log 
FROM flow_executions 
ORDER BY started_at DESC 
LIMIT 3;
