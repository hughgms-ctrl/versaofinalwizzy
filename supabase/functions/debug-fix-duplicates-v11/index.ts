import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        console.log("Iniciando limpeza agressiva de duplicatas V11...");

        // 1. Limpar por zapi_message_id (exato)
        const { data: allWithIds } = await supabase
            .from('messages')
            .select('id, zapi_message_id, conversation_id')
            .not('zapi_message_id', 'is', null)
            .order('created_at', { ascending: true });

        const seenId = new Set();
        const toDeleteIds = [];
        for (const m of (allWithIds || [])) {
            if (seenId.has(m.zapi_message_id)) {
                toDeleteIds.push(m.id);
            } else {
                seenId.add(m.zapi_message_id);
            }
        }

        // 2. Limpar por conteúdo e tempo (fuzzy - para mensagens sem ID ou IDs perdidos)
        const { data: suspected } = await supabase
            .from('messages')
            .select('id, conversation_id, content, created_at, direction')
            .order('created_at', { ascending: true });

        const seenFuzzy = new Map();
        for (const m of (suspected || [])) {
            if (!m.content) continue;
            // Key: conversation + content + direction + minute
            const minute = new Date(m.created_at).toISOString().substring(0, 16);
            const key = `${m.conversation_id}|${m.content}|${m.direction}|${minute}`;
            if (seenFuzzy.has(key)) {
                toDeleteIds.push(m.id);
            } else {
                seenFuzzy.set(key, m.id);
            }
        }

        const uniqueToDelete = [...new Set(toDeleteIds)];
        let removedCount = 0;
        if (uniqueToDelete.length > 0) {
            const { error: delError } = await supabase
                .from('messages')
                .delete()
                .in('id', uniqueToDelete);
            if (!delError) removedCount = uniqueToDelete.length;
        }

        return new Response(JSON.stringify({
            success: true,
            removedCount: removedCount
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
});
