import fs from 'fs';
const content = fs.readFileSync('supabase/functions/zapi-webhook/index.ts', 'utf8');
const lines = content.split('\n');

let balance = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    balance += opens - closes;
    if (i >= 120 && i <= 950) {
        if (opens > 0 || closes > 0) {
            console.log(`${i + 1}: [${balance}] ${line.trim()}`);
        }
    }
}
