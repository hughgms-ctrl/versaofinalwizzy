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

        console.log("Iniciando correção de duplicidade V11...");

        // 1. Deletar duplicatas físicas (mantendo a mais antiga)
        const sqlCleanup = `
      DELETE FROM messages a
      USING messages b
      WHERE a.id > b.id
        AND a.zapi_message_id = b.zapi_message_id
        AND a.zapi_message_id IS NOT NULL;
    `;

        // Como não posso rodar SQL puro via rpc arbitrário sem uma função rpc definida,
        // vou tentar fazer via algoritimo no Deno se não houver rpc 'exec_sql'.

        const { data: duplicates } = await supabase
            .from('messages')
            .select('zapi_message_id')
            .not('zapi_message_id', 'is', null);

        const countMap = new Map();
        const idsToDelete = [];

        const { data: allMsgs } = await supabase
            .from('messages')
            .select('id, zapi_message_id')
            .not('zapi_message_id', 'is', null)
            .order('created_at', { ascending: true });

        const seen = new Set();
        for (const m of (allMsgs || [])) {
            if (seen.has(m.zapi_message_id)) {
                idsToDelete.push(m.id);
            } else {
                seen.add(m.zapi_message_id);
            }
        }

        if (idsToDelete.length > 0) {
            await supabase.from('messages').delete().in('id', idsToDelete);
        }

        console.log(`Mensagens duplicadas removidas: ${idsToDelete.length}`);

        return new Response(JSON.stringify({
            success: true,
            removedCount: idsToDelete.length
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
});
