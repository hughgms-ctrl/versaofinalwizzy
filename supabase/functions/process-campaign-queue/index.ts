import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// B8 (docs/REVISAO_ESCALA_LANCAMENTO.md): a fila era select-then-update sem
// lock, limit(10) global e sem retry. Dois ticks do cron sobrepostos pegavam o
// mesmo item e o fluxo rodava duas vezes; um item em 'processing' cujo isolate
// morreu ficava preso para sempre; e 10 itens/min era o teto da plataforma
// inteira. Agora:
//  * o claim é a RPC claim_campaign_queue (UPDATE atômico, justiça por org,
//    reclaim de 'processing' abandonado após 10 min);
//  * cada item tem no máximo 3 tentativas (coluna attempts, incrementada no
//    claim). Falha transitória volta para 'pending' com backoff; falha
//    definitiva (campanha sem fluxo, 3ª tentativa) vira 'failed' com motivo;
//  * o lote é maior e roda com concorrência limitada, com timeout na chamada
//    ao flow-execute — nenhum item segura o tick indefinidamente.
const BATCH_LIMIT = 50;
const PER_ORG_LIMIT = 10;
const CONCURRENCY = 8;
const MAX_ATTEMPTS = 3;
const FLOW_EXECUTE_TIMEOUT_MS = 20_000;

type QueueItem = {
    id: string;
    campaign_id: string | null;
    conversation_id: string | null;
    organization_id: string | null;
    variables: Record<string, unknown> | null;
    attempts?: number | null;
};

class PermanentFailure extends Error {}

function backoffIso(attempts: number): string {
    // 1ª falha: +1 min, 2ª: +2 min (a 3ª tentativa que falha vira 'failed').
    const minutes = Math.min(2 ** Math.max(attempts - 1, 0), 10);
    return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await worker(items[index]);
        }
    });
    await Promise.all(lanes);
    return results;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        console.log('[QUEUE PROCESSOR] Claiming pending items...');

        // 1. Claim atômico. A versão da Semana 1 da RPC só aceita _limit; a
        // migration 20260830120000 adiciona _per_org. Tenta a nova e cai na
        // antiga se o banco ainda não tiver sido atualizado.
        let claimed: QueueItem[] | null = null;
        let claimError: { message?: string } | null = null;
        {
            const attempt = await supabase.rpc('claim_campaign_queue', { _limit: BATCH_LIMIT, _per_org: PER_ORG_LIMIT });
            claimed = attempt.data as QueueItem[] | null;
            claimError = attempt.error;
            if (claimError) {
                const fallback = await supabase.rpc('claim_campaign_queue', { _limit: BATCH_LIMIT });
                claimed = fallback.data as QueueItem[] | null;
                claimError = fallback.error;
            }
        }
        if (claimError) throw new Error(`claim_campaign_queue: ${claimError.message}`);

        const queuedItems = claimed || [];
        if (queuedItems.length === 0) {
            console.log('[QUEUE PROCESSOR] No ready messages found.');
            return new Response(JSON.stringify({ processed: 0 }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 2. Fluxo de cada campanha, numa query só para o lote.
        const campaignIds = Array.from(new Set(queuedItems.map(i => i.campaign_id).filter((v): v is string => !!v)));
        const flowByCampaign = new Map<string, string | null>();
        if (campaignIds.length > 0) {
            const { data: campaigns, error: campaignsError } = await supabase
                .from('campaigns')
                .select('id, flow_id')
                .in('id', campaignIds);
            if (campaignsError) throw campaignsError;
            for (const c of campaigns || []) flowByCampaign.set(c.id, c.flow_id);
        }

        console.log(`[QUEUE PROCESSOR] Processing ${queuedItems.length} items (${campaignIds.length} campaigns)...`);

        const results = await runWithConcurrency(queuedItems, CONCURRENCY, async (item) => {
            // Sem a migration, attempts não vem: conta como 1ª tentativa.
            const attempts = Number(item.attempts ?? 1);
            try {
                if (!item.campaign_id || !flowByCampaign.has(item.campaign_id)) {
                    throw new PermanentFailure('campanha não existe mais');
                }
                const flowId = flowByCampaign.get(item.campaign_id);
                if (!flowId) throw new PermanentFailure('campanha sem fluxo configurado');
                if (!item.conversation_id) throw new PermanentFailure('item sem conversa');

                const flowResp = await fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${supabaseKey}`,
                    },
                    body: JSON.stringify({
                        flowId,
                        conversationId: item.conversation_id,
                        isFromOrchestrator: true,
                        ...(item.variables ? { variables: item.variables } : {}),
                    }),
                    signal: AbortSignal.timeout(FLOW_EXECUTE_TIMEOUT_MS),
                });

                if (!flowResp.ok) {
                    const text = await flowResp.text().catch(() => '');
                    // 404/422 são pré-voo do flow-execute (fluxo/conversa/número
                    // inexistente): repetir não muda nada. 409 = conversa já com
                    // fluxo vivo; 5xx/timeout = transitório. Esses voltam à fila.
                    if (flowResp.status === 404 || flowResp.status === 422) {
                        throw new PermanentFailure(`flow-execute ${flowResp.status}: ${text.slice(0, 300)}`);
                    }
                    throw new Error(`flow-execute ${flowResp.status}: ${text.slice(0, 300)}`);
                }

                await supabase.from('campaign_queue').update({
                    status: 'processed',
                    processed_at: new Date().toISOString(),
                }).eq('id', item.id);

                return { id: item.id, status: 'success' };
            } catch (err) {
                const reason = err instanceof Error ? err.message : String(err);
                const permanent = err instanceof PermanentFailure;
                const retry = !permanent && attempts < MAX_ATTEMPTS;
                console.error(`[QUEUE PROCESSOR] Item ${item.id} (tentativa ${attempts}) falhou${retry ? ', volta para a fila' : ', encerrado'}:`, reason);

                const patch: Record<string, unknown> = retry
                    ? { status: 'pending', scheduled_for: backoffIso(attempts) }
                    : { status: 'failed', processed_at: new Date().toISOString() };

                // last_error só existe após a migration 20260830120000; se o UPDATE
                // recusar a coluna, grava sem ela para não deixar o item em 'processing'.
                const { error: updErr } = await supabase.from('campaign_queue')
                    .update({ ...patch, last_error: reason.slice(0, 500) }).eq('id', item.id);
                if (updErr) {
                    await supabase.from('campaign_queue').update(patch).eq('id', item.id);
                }
                return { id: item.id, status: retry ? 'retry' : 'failed', error: reason };
            }
        });

        const summary = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {} as Record<string, number>);
        console.log(`[QUEUE PROCESSOR] Done: ${JSON.stringify(summary)}`);

        return new Response(JSON.stringify({ processed: queuedItems.length, summary, results }), {
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
