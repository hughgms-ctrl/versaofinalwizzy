import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debug() {
  console.log('--- DEBUGGING AI SILENCE ---');
  
  // 1. Find the flow ID for "Agente Master - AR"
  const { data: flows } = await supabase
    .from('flows')
    .select('id, name, nodes')
    .ilike('name', '%Agente Master - AR%');
    
  if (!flows || flows.length === 0) {
    console.log('Flow "Agente Master - AR" not found');
  } else {
    for (const flow of flows) {
      console.log(`\nFlow: ${flow.name} (${flow.id})`);
      console.log('Nodes types:', flow.nodes.map(n => n.type));
      if (flow.nodes.length < 5) {
         console.log('Nodes structure:', JSON.stringify(flow.nodes, null, 2));
      }
    }
  }

  // 2. Check latest flow_node_logs
  const { data: logs } = await supabase
    .from('flow_node_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
    
  console.log('\nLatest Flow Node Logs:');
  console.table(logs?.map(l => ({
    time: l.created_at,
    node: l.node_name || l.node_type,
    exec_id: l.flow_execution_id
  })));

  // 3. Check for any errors in flow_executions
  const { data: execs } = await supabase
    .from('flow_executions')
    .select('id, status, error_message, last_node_id, current_node_id')
    .order('started_at', { ascending: false })
    .limit(5);
    
  console.log('\nLatest Flow Executions:');
  console.table(execs);
}

debug();
