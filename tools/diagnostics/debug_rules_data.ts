import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRules() {
  console.log("Checking agent_training_rules...");
  
  const { data: rules, error } = await supabase
    .from('agent_training_rules')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching rules:", error);
    return;
  }

  console.log(`Found ${rules.length} recent rules.`);
  rules.forEach((r, i) => {
    console.log(`\nRule ${i+1}:`);
    console.log(`  ID: ${r.id}`);
    console.log(`  Target: ${r.target_type}`);
    console.log(`  AgentID: ${r.agent_id}`);
    console.log(`  FlowID: ${r.flow_id}`);
    console.log(`  NodeID: ${r.node_id}`);
    console.log(`  Situation: ${r.situation.substring(0, 50)}...`);
    console.log(`  IsActive: ${r.is_active}`);
  });

  // Also check flow_executions to see what nodeId looks like
  const { data: execs } = await supabase
    .from('flow_executions')
    .select('id, current_node_id, flow_id')
    .order('updated_at', { ascending: false })
    .limit(5);

  if (execs) {
    console.log(`\nRecent flow executions:`);
    execs.forEach(e => {
      console.log(`  ExecID: ${e.id}, FlowID: ${e.flow_id}, NodeID: ${e.current_node_id}`);
    });
  }
}

checkRules();
