const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

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
    console.log(`  Situation: ${r.situation}`);
    console.log(`  Rule: ${r.rule}`);
    console.log(`  IsActive: ${r.is_active}`);
  });
}

checkRules();
