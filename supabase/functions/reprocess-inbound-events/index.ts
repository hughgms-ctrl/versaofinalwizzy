import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// B3 (docs/REVISAO_ESCALA_LANCAMENTO.md): a rede embaixo do 503.
//
// O zapi-webhook grava o payload cru em inbound_events antes de processar e
// fecha a linha como 'processed' no fim. Se o isolate morre no meio (deploy,
// limite de CPU, Evolution lenta segurando o processo até o corte) ninguém
// responde ao provedor e a linha fica 'pending' para sempre. Este job reenvia
// esses eventos ao próprio webhook, com o header x-inbound-event-id para que o
// reenvio feche a linha existente em vez de criar outra.
//
// Reprocessar é seguro: a unique (conversation_id, zapi_message_id) de messages
// faz a segunda cópia cair em 23505, que o webhook trata como duplicata.
//
// O claim (RPC claim_inbound_events) só entrega evento com mais de 2 minutos —
// abaixo disso o processamento normal ainda pode estar rodando — e no máximo
// 3 tentativas por evento.
const BATCH_LIMIT = 20;
const MIN_AGE_SECONDS = 120;
const CONCURRENCY = 4;
const WEBHOOK_TIMEOUT_MS = 30_000;

type InboundEvent = {
    id: string;
    event_type: string | null;
    instance_name: string | null;
    provider_message_id: string | null;
    payload: Record<string, unknown> | null;
    attempts: number | null;
};

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
        while (true) {
            const index = next++;
            if (index >= items.length) return;
            results[index] = await worker(items[index]);
        }
    });
    await Promise.all(runners);
    return results;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const respond = (body: Record<string, unknown>, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, serviceRoleKey);

        const { data: claimed, error: claimError } = await supabase.rpc('claim_inbound_events', {
            _limit: BATCH_LIMIT,
            _min_age_seconds: MIN_AGE_SECONDS,
        });

        if (claimError) {
            // Sem a migration 20260830150000 aplicada não há o que reprocessar.
            console.error('[REPROCESS] claim_inbound_events indisponível:', claimError.message);
            return respond({ success: false, error: 'claim_unavailable', detail: claimError.message }, 200);
        }

        const events = (claimed || []) as InboundEvent[];
        if (events.length === 0) {
            return respond({ success: true, claimed: 0 });
        }

        console.log(`[REPROCESS] ${events.length} evento(s) pendente(s) para reenviar ao webhook`);

        const webhookUrl = `${supabaseUrl}/functions/v1/zapi-webhook`;
        const webhookToken = Deno.env.get('ZAPI_CLIENT_TOKEN') || '';

        const outcomes = await runWithConcurrency(events, CONCURRENCY, async (event) => {
            const label = `${event.event_type || 'evento'} ${event.provider_message_id || event.id}`;
            if (!event.payload) {
                await supabase.from('inbound_events')
                    .update({ status: 'failed', processed_at: new Date().toISOString(), last_error: 'payload vazio' })
                    .eq('id', event.id);
                return 'sem_payload';
            }
            try {
                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-inbound-event-id': event.id,
                        ...(webhookToken ? { 'x-webhook-token': webhookToken } : {}),
                    },
                    body: JSON.stringify(event.payload),
                    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
                });

                if (response.ok) {
                    // O próprio webhook fecha a linha (x-inbound-event-id). Se
                    // por algum motivo não fechou, garantimos aqui.
                    await supabase.from('inbound_events')
                        .update({ status: 'processed', processed_at: new Date().toISOString() })
                        .eq('id', event.id)
                        .eq('status', 'pending');
                    console.log(`[REPROCESS] ${label} reprocessado`);
                    return 'ok';
                }

                const detail = `webhook devolveu ${response.status}`;
                await supabase.from('inbound_events').update({ last_error: detail }).eq('id', event.id);
                console.warn(`[REPROCESS] ${label}: ${detail} — fica pendente para a próxima tentativa`);
                return 'retry';
            } catch (e) {
                const detail = String(e).substring(0, 2000);
                await supabase.from('inbound_events').update({ last_error: detail }).eq('id', event.id);
                console.error(`[REPROCESS] ${label} falhou: ${detail}`);
                return 'retry';
            }
        });

        const summary = outcomes.reduce((acc: Record<string, number>, o) => {
            acc[o] = (acc[o] || 0) + 1;
            return acc;
        }, {});

        return respond({ success: true, claimed: events.length, ...summary });
    } catch (error) {
        console.error('[REPROCESS] erro inesperado:', error);
        return respond({ success: false, error: String(error) }, 500);
    }
});
