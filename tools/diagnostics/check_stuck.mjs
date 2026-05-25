import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: execs, error } = await supabase.from('flow_executions')
    .select('id, status, current_node_id, conversation_id, error_message, execution_log, variables')
    .order('started_at', { ascending: false })
    .limit(5);
    
  if (error) console.error(error);
  
  execs.forEach(ex => {
    console.log(`\nEXEC: ${ex.id} | Status: ${ex.status} | Node: ${ex.current_node_id} | Conv: ${ex.conversation_id}`);
    if (ex.error_message) console.log(`ERROR: ${ex.error_message}`);
    
    // show last 3 log entries if available
    const logs = Array.isArray(ex.execution_log) ? ex.execution_log : [];
    if (logs.length > 0) {
      console.log('Last logs:');
      logs.slice(-3).forEach(l => console.log(`  - ${l.nodeId} (${l.type}): ${l.result}`));
    }
  });
}

check();
