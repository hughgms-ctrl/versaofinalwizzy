import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkInstances() {
    console.log('--- WHATSAPP INSTANCES AUDIT ---');
    const { data: instances, error } = await supabase
        .from('whatsapp_instances')
        .select('*');

    if (error) {
        console.error('Error fetching instances:', error);
    } else {
        console.log(`Found ${instances?.length || 0} instances:`);
        instances?.forEach(i => {
            console.log(`ID: ${i.id}`);
            console.log(`  Z-API Instance ID: ${i.zapi_instance_id}`);
            console.log(`  Status: ${i.status}`);
            console.log(`  Org: ${i.organization_id}`);
            console.log(`  Phone: ${i.phone_number}`);
            console.log(`  Token: ${i.zapi_token ? 'Set (starts with ' + i.zapi_token.substring(0, 5) + '...)' : 'Not set'}`);
            console.log('-------------------');
        });
    }
}

checkInstances();
