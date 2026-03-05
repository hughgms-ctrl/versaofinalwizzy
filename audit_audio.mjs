import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function auditAudio() {
    console.log('--- AUDIO & FLOW AUDIT START ---');

    try {
        // 1. Check Last Messages (specifically looking for audio/outbound)
        console.log('\n1. Last 10 Outbound Messages:');
        const { data: messages, error: msgError } = await supabase
            .from('messages')
            .select('id, type, direction, content, media_url, zapi_message_id, created_at')
            .eq('direction', 'outbound')
            .order('created_at', { ascending: false })
            .limit(10);

        if (msgError) {
            console.error('Error fetching messages:', msgError);
        } else {
            messages?.forEach(m => {
                console.log(`Msg ${m.id}: [${m.type}] Content: ${m.content?.substring(0, 30)}... MediaUrl: ${m.media_url ? 'YES' : 'NO'}`);
            });
        }

        // 2. Check Flow Executions for errors
        console.log('\n2. Recent Flow Executions (Errors):');
        const { data: executions, error: execError } = await supabase
            .from('flow_executions')
            .select('id, flow_id, status, error_message, execution_log, created_at')
            .order('created_at', { ascending: false })
            .limit(5);

        if (execError) {
            console.error('Error fetching executions:', execError);
        } else {
            executions?.forEach(e => {
                console.log(`Execution ${e.id}: Status: ${e.status}`);
                if (e.error_message) console.log(`  Error: ${e.error_message}`);
                // Check if log contains audio nodes
                const nodes = e.execution_log as any[];
                if (nodes) {
                    const audioNodes = nodes.filter(n => n.type === 'content-block' || n.type === 'audio');
                    if (audioNodes.length > 0) {
                        console.log(`  Audit: Flow contains ${audioNodes.length} content/audio nodes.`);
                    }
                }
            });
        }

        // 3. Specifically check for audio types in messages
        console.log('\n3. Last 5 Audio Messages (Any direction):');
        const { data: audioMessages } = await supabase
            .from('messages')
            .select('*')
            .eq('type', 'audio')
            .order('created_at', { ascending: false })
            .limit(5);

        audioMessages?.forEach(m => {
            console.log(`Audio Msg ${m.id}: Dir: ${m.direction} Media: ${m.media_url}`);
        });

    } catch (err) {
        console.error('Audit script exploded:', err);
    }

    console.log('\n--- AUDIT END ---');
}

auditAudio();
