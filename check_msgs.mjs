import fs from 'fs';

// simple script to fetch recent messages using vanilla node fetch
const envStr = fs.readFileSync('.env', 'utf8');
const lines = envStr.split('\n');
let url = '';
let key = '';
for (const line of lines) {
    if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim().replace(/['"]+/g, '');
    if (line.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) key = line.split('=')[1].trim().replace(/['"]+/g, '');
}

async function run() {
    const res = await fetch(`${url}/rest/v1/messages?select=id,type,media_url,content,created_at&order=created_at.desc&limit=10`, {
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`
        }
    });
    const data = await res.json();
    console.log("Recent Inbound Messages:");
    for (const m of data) {
        console.log(`- [${m.type}] ID: ${m.id} | Media: ${m.media_url ? m.media_url.substring(0, 100) : 'none'} | Content: ${m.content ? m.content.substring(0, 50) : 'none'}`);
    }
}
run();
