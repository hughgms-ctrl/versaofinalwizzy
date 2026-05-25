const SUPABASE_URL = "https://zaobtetbjpuzibjymhzw.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emlianltaHp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzc5MzksImV4cCI6MjA4NzcxMzkzOX0.HBUI1OK1eYq9FE2SzIvuAkxuCG0frApCQZqcjjDx43k";

async function run() {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/flow_executions?select=id,status,current_node_id,conversation_id,error_message,execution_log,variables&order=started_at.desc&limit=5`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    }
  });
  
  if (!resp.ok) {
    console.error("HTTP Error", resp.status, await resp.text());
    process.exit(1);
  }
  
  const execs = await resp.json();
  execs.forEach(ex => {
    console.log(`\nEXEC: ${ex.id} | Status: ${ex.status} | Node: ${ex.current_node_id} | Conv: ${ex.conversation_id}`);
    if (ex.error_message) console.log(`ERROR: ${ex.error_message}`);
    
    const logs = Array.isArray(ex.execution_log) ? ex.execution_log : [];
    if (logs.length > 0) {
      console.log('Last logs:');
      logs.slice(-5).forEach(l => console.log(`  - ${l.nodeId} (${l.type}): ${l.result} at ${l.timestamp}`));
    }
  });
}

run();
