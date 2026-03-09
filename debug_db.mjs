
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://zaobtetbjpuzibjymhzw.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emxpYW5ltaHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjEzNzg3OSwiZXhwIjoyMDg3NzEzOTM5fQ.xNtxSTwkenbVWJ1IHEDRCuQu_XMsLdWW92gE2WQgy_0";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    console.log("=== DIAGNOSTIC REPORT ===");
    
    console.log("\n1. Checking WhatsApp Instances...");
    const { data: instances } = await supabase.from('whatsapp_instances').select('id, zapi_instance_id, status, is_active, phone_number, organization_id');
    console.log("Instances count:", instances?.length || 0);
    instances?.forEach(i => console.log(`- Instance ${i.zapi_instance_id}: Status=${i.status}, Active=${i.is_active}, Phone=${i.phone_number}, Org=${i.organization_id}`));

    console.log("\n2. Checking Most Recent Contacts (Today):");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: contacts } = await supabase.from('contacts')
        .select('id, phone, name, organization_id, created_at')
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false });
    console.log("Contacts created today:", contacts?.length || 0);
    contacts?.slice(0, 5).forEach(c => console.log(`- Contact ${c.phone}: Name=${c.name}, Org=${c.organization_id}, Created=${c.created_at}`));

    console.log("\n3. Checking Most Recent Messages (Today):");
    const { data: messages } = await supabase.from('messages')
        .select('id, conversation_id, direction, type, content, created_at')
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false });
    console.log("Messages today:", messages?.length || 0);
    messages?.slice(0, 5).forEach(m => console.log(`- [${m.direction}] Msg ${m.id}: Type=${m.type}, Content=${m.content?.substring(0, 40)}, Created=${m.created_at}`));

    console.log("\n4. Checking for Campaign Queue status:");
    const { data: queue } = await supabase.from('campaign_queue').select('*').limit(5);
    console.log("Queue entries count:", queue?.length || 0);
    queue?.forEach(q => console.log(`- Queue ${q.id}: Status=${q.status}, Scheduled=${q.scheduled_for}`));
}

check();
