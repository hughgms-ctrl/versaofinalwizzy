import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://zaobtetbjpuzibjymhzw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emxpYW5ltaHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjEzNzg3OSwiZXhwIjoyMDg3NzEzOTM5fQ.xNtxSTwkenbVWJ1IHEDRCuQu_XMsLdWW92gE2WQgy_0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: instances } = await supabase.from('whatsapp_instances').select('*');
    const hugoInstance = instances.find((i: any) => i.organization_id === '48dcff79-d58e-4a94-9642-f860579e2760');

    if (!hugoInstance) {
        console.log("Nenhuma instância encontrada para Hugo.");
        return;
    }

    const token = hugoInstance.zapi_token;
    const baseUrl = 'https://lhzap.uazapi.com';

    const paths = [
        '/chats', // V1
        '/chat/fetchChats',
        '/chat/find',
        '/message/fetchMessages',
        '/chat/list',
        '/chat/getChats',
        '/instance/chats',
        '/message/list'
    ];

    for (const path of paths) {
        try {
            console.log(`Trying GET ${path}...`);
            const res = await fetch(`${baseUrl}${path}`, {
                headers: { 'token': token, 'apikey': token, 'admintoken': token }
            });
            console.log(`  -> Status: ${res.status}`);
            if (res.ok) {
                const data = await res.json();
                console.log(`  -> Success! Keys:`, Object.keys(data));
                if (data.chats) console.log(`  -> Chats length:`, data.chats.length);
                else if (Array.isArray(data)) console.log(`  -> Array length:`, data.length);
            } else {
                const errText = await res.text();
                console.log(`  -> Error Response: ${errText.substring(0, 100)}`);
            }
        } catch (e: any) {
            console.log(`  -> Error: ${e.message}`);
        }
    }
}

run();
