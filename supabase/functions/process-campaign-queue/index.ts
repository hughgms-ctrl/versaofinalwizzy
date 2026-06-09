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

        console.log('[QUEUE PROCESSOR] Checking for pending messages...');

        // 1. Fetch pending items that are ready to be processed
        const { data: queuedItems, error: fetchError } = await supabase
            .from('campaign_queue')
            .select('*, campaigns!inner(flow_id)')
            .eq('status', 'pending')
            .lte('scheduled_for', new Date().toISOString())
            .limit(10); // Process in batches

        if (fetchError) throw fetchError;

        if (!queuedItems || queuedItems.length === 0) {
            console.log('[QUEUE PROCESSOR] No ready messages found.');
            return new Response(JSON.stringify({ processed: 0 }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        console.log(`[QUEUE PROCESSOR] Processing ${queuedItems.length} messages...`);

        const results = await Promise.all(queuedItems.map(async (item) => {
            try {
                // Mark as processing
                await supabase.from('campaign_queue').update({ status: 'processing' }).eq('id', item.id);

                // Execute flow
                const flowResp = await fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${supabaseKey}`,
                    },
                    body: JSON.stringify({
                        flowId: item.campaigns.flow_id,
                        conversationId: item.conversation_id,
                        isFromOrchestrator: true,
                        ...(item.variables ? { variables: item.variables } : {}),
                    }),
                });

                if (!flowResp.ok) throw new Error(`Flow execute failed: ${await flowResp.text()}`);

                // Mark as processed
                await supabase.from('campaign_queue').update({
                    status: 'processed',
                    processed_at: new Date().toISOString()
                }).eq('id', item.id);

                return { id: item.id, status: 'success' };
            } catch (err) {
                console.error(`[QUEUE PROCESSOR] Error processing item ${item.id}:`, err);
                await supabase.from('campaign_queue').update({
                    status: 'failed',
                    processed_at: new Date().toISOString()
                }).eq('id', item.id);
                return { id: item.id, status: 'failed', error: String(err) };
            }
        }));

        return new Response(JSON.stringify({ processed: queuedItems.length, results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('[QUEUE PROCESSOR] Critical error:', error);
        return new Response(JSON.stringify({ error: String(error) }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
