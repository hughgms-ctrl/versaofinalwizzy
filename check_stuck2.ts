import { createClient } from 'npm:@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://zaobtetbjpuzibjymhzw.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables!");
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const { data: execs, error } = await supabase.from('flow_executions')
  .select('id, status, current_node_id, conversation_id, error_message, execution_log, variables')
  .order('started_at', { ascending: false })
  .limit(5);

if (error) {
  console.error("Error querying DB:", error);
  Deno.exit(1);
}

execs.forEach(ex => {
  console.log(`\nEXEC: ${ex.id} | Status: ${ex.status} | Node: ${ex.current_node_id} | Conv: ${ex.conversation_id}`);
  if (ex.error_message) console.log(`ERROR: ${ex.error_message}`);
  
  const logs = Array.isArray(ex.execution_log) ? ex.execution_log : [];
  if (logs.length > 0) {
    console.log('Last logs:');
    logs.slice(-5).forEach(l => console.log(`  - ${l.nodeId} (${l.type}): ${l.result} at ${l.timestamp}`));
  }
});
