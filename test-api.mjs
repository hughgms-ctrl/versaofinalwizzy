const SUPABASE_URL = 'https://zaobtetbjpuzibjymhzw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emxpYW5ltaHp3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjEzNzg3OSwiZXhwIjoyMDg3NzEzOTM5fQ.xNtxSTwkenbVWJ1IHEDRCuQu_XMsLdWW92gE2WQgy_0';

async function run() {
    const rs = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_instances?select=*&organization_id=eq.48dcff79-d58e-4a94-9642-f860579e2760`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const instances = await rs.json();
    if (!instances || instances.length === 0) return console.log("No instances");

    const token = instances[0].zapi_token;
    console.log("Got token!", token.substring(0, 10));

    const baseUrl = 'https://lhzap.uazapi.com';
    const paths = [
        '/chats',
        '/chat/fetchChats',
        '/chat/find',
        '/message/fetchMessages',
        '/chat/list',
        '/instance/chats',
        '/chat/getChats',
        '/messages'
    ];

    for (const path of paths) {
        try {
            console.log(`\nTrying GET ${path}...`);
            const r = await fetch(`${baseUrl}${path}`, { headers: { "apikey": token, "token": token } });
            console.log(` -> Status: ${r.status}`);
            if (r.ok) {
                const d = await r.json();
                console.log(` -> SUCCESS! Keys: ${Object.keys(d)}`);
                if (d.data) console.log(` -> Data length: ${d.data.length}`);
                if (d.chats) console.log(` -> Chats length: ${d.chats.length}`);
                if (Array.isArray(d)) console.log(` -> Array length: ${d.length}`);
            } else {
                const text = await r.text();
                console.log(` -> Error text: ${text.substring(0, 80)}`);
            }
        } catch (e) {
            console.log(` -> Exception: ${e.message}`);
        }
    }
}
run();
