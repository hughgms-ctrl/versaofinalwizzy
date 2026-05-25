const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const envVars = {};
envText.split('\n').forEach(line => {
  if (line.includes('=')) {
    const [key, ...rest] = line.split('=');
    envVars[key.trim()] = rest.join('=').trim().replace(/['"]/g, '');
  }
});

const supabaseUrl = envVars['VITE_SUPABASE_URL'] || envVars['SUPABASE_URL'];
const supabaseKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: execs, error } = await supabase.from('flow_executions')
    .select('id, status, current_node_id, conversation_id, error_message, execution_log, variables, timeout_at, started_at')
    .order('started_at', { ascending: false })
    .limit(5);
    
  if (error) {
    console.error(error);
    return;
  }
  
  execs.forEach(ex => {
    console.log(`\nEXEC: ${ex.id} | Status: ${ex.status} | Node: ${ex.current_node_id} | Conv: ${ex.conversation_id} | Timeout: ${ex.timeout_at}`);
    if (ex.error_message) console.log(`ERROR: ${ex.error_message}`);
    
    const logs = Array.isArray(ex.execution_log) ? ex.execution_log : [];
    if (logs.length > 0) {
      console.log('Last logs:');
      logs.slice(-5).forEach(l => console.log(`  - ${l.nodeId} (${l.type}): ${l.result} at ${l.timestamp}`));
    }
  });
}

check();
