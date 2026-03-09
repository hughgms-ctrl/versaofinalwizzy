
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://zaobtetbjpuzibjymhzw.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emxpYW5ltaHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjEzNzg3OSwiZXhwIjoyMDg3NzEzOTM5fQ.xNtxSTwkenbVWJ1IHEDRCuQu_XMsLdWW92gE2WQgy_0";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    console.log("=== COMPREHENSIVE DB CHECK ===");
    
    const tables = ['organizations', 'integration_configs', 'whatsapp_instances', 'contacts', 'conversations', 'messages'];
    
    for (const table of tables) {
        try {
            const { data, count, error } = await supabase.from(table).select('*', { count: 'exact', head: false });
            if (error) {
                console.error(`- Error in ${table}:`, error.message);
            } else {
                console.log(`- Table ${table}: ${data?.length || 0} rows (Exact count: ${count})`);
                if (data && data.length > 0) {
                    console.log(`  First row sample ID: ${data[0].id}`);
                }
            }
        } catch (e) {
            console.error(`- Exception in ${table}:`, e.message);
        }
    }
}

check();
