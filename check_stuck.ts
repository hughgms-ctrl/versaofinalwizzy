import { createClient } from 'npm:@supabase/supabase-js';

// Read .env directly
const envText = await Deno.readTextFile('.env');
const envLines = envText.split('\n');
const envVars = {};
for (const line of envLines) {
  if (line.includes('=')) {
    const [key, ...rest] = line.split('=');
    envVars[key.trim()] = rest.join('=').trim().replace(/['"]/g, '');
  }
}

const supabaseUrl = envVars['VITE_SUPABASE_URL'] || envVars['SUPABASE_URL'];
const supabaseKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing keys!");
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const { data: execs, error } = await supabase.from('flow_executions')
  .select('id, status, current_node_id, conversation_id, error_message, execution_log, variables')
  .order('started_at', { ascending: false })
  .limit(5);

if (error) {
  console.error(error);
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
