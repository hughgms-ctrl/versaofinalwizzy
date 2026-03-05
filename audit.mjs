import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function audit() {
    console.log('--- AUDIT START ---');

    try {
        // 1. Check Integration Configs
        console.log('\n1. Checking Integration Configs:');
        const { data: configs, error: configError } = await supabase
            .from('integration_configs')
            .select('organization_id, ai_provider, openai_api_key, gemini_api_key');

        if (configError) {
            console.error('Error fetching configs:', configError);
        } else {
            console.log(`Found ${configs?.length || 0} configs.`);
            configs?.forEach(c => {
                console.log(`Org: ${c.organization_id}`);
                console.log(`  OpenAI Key set: ${!!c.openai_api_key}`);
                console.log(`  Gemini Key set: ${!!c.gemini_api_key}`);
                console.log(`  AI Provider: ${c.ai_provider}`);
            });
        }

        // 2. Check Last Campaigns (scheduled_messages)
        console.log('\n2. Last Scheduled Messages:');
        const { data: scheduled, error: schedError } = await supabase
            .from('scheduled_messages')
            .select('id, status, content_type, error_message, created_at')
            .order('created_at', { ascending: false })
            .limit(5);

        if (schedError) {
            console.error('Error fetching scheduled:', schedError);
        } else {
            scheduled?.forEach(s => {
                console.log(`Message ${s.id}:`);
                console.log(`  Status: ${s.status}`);
                console.log(`  Content Type: ${s.content_type}`);
                console.log(`  Error: ${s.error_message}`);
            });
        }

        // 3. Check Flow Executions
        console.log('\n3. Last Flow Executions:');
        const { data: executions, error: execError } = await supabase
            .from('flow_executions')
            .select('id, status, error_message, created_at')
            .order('created_at', { ascending: false })
            .limit(5);

        if (execError) {
            console.error('Error fetching executions:', execError);
        } else {
            executions?.forEach(e => {
                console.log(`Execution ${e.id}:`);
                console.log(`  Status: ${e.status}`);
                console.log(`  Error: ${e.error_message}`);
            });
        }
    } catch (err) {
        console.error('Audit script exploded:', err);
    }

    console.log('\n--- AUDIT END ---');
}

audit();
