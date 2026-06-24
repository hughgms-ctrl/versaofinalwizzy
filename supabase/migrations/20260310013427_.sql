UPDATE agent_training_rules 
SET flow_id = '9eecfd1a-5318-4b5e-8834-ca06fec2b4c8', node_id = 'node_3' 
WHERE id IN ('d3a034e8-fd14-4fcf-8548-7c8ecf38d14b', '6b1e90b6-f835-4bca-85f2-a2bd7b704174') 
AND target_type = 'flow_node' AND flow_id IS NULL;
