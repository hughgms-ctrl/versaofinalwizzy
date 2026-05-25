
const https = require('https');

const SUPABASE_URL = "zaobtetbjpuzibjymhzw.supabase.co"; // No protocol here for https.request

function testRules() {
  const data = JSON.stringify({
    debugRules: true
  });

  const options = {
    hostname: SUPABASE_URL,
    port: 443,
    path: '/functions/v1/agent-orchestrator',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = https.request(options, (res) => {
    let responseBody = '';

    res.on('data', (d) => {
      responseBody += d;
    });

    res.on('end', () => {
      try {
        const parsed = JSON.parse(responseBody);
        if (parsed.rules) {
          console.log(`Found ${parsed.rules.length} rules:`);
          parsed.rules.forEach(r => {
            console.log(`- ID: ${r.id}`);
            console.log(`  Org: ${r.organization_id}`);
            console.log(`  Target: ${r.target_type}`);
            console.log(`  Flow: ${r.flow_id}`);
            console.log(`  Node: ${r.node_id}`);
            console.log(`  Agent: ${r.agent_id}`);
            console.log(`  Rule: ${r.rule.substring(0, 50)}...`);
            console.log('---');
          });
        } else {
          console.log("No rules found or error:", parsed);
        }
      } catch (e) {
        console.log("Error parsing response:", e);
        console.log("Raw response:", responseBody);
      }
    });
  });

  req.on('error', (error) => {
    console.error("Request Error:", error);
  });

  req.write(data);
  req.end();
}

testRules();
