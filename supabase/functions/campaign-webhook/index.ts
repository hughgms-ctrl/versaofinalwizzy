import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// América/São Paulo não tem horário de verão desde 2019 -> offset fixo UTC-3.
const SP_OFFSET_MINUTES = -3 * 60;

// Máximo de contatos aceitos por chamada (proteção contra abuso / lotes gigantes).
const MAX_ITEMS = 100;

// deno-lint-ignore no-explicit-any
type AnyObj = Record<string, any>;

function parseHHMM(value: string | null | undefined, fallback: string): { h: number; m: number } {
    const [h, m] = String(value || fallback).split(':').map((n) => parseInt(n, 10));
    return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

/**
 * Verifica se "agora" (horário de São Paulo) está dentro da janela [start, end].
 * Se estiver fora, retorna o próximo horário de início como ISO (UTC) para enfileirar.
 */
function computeWindow(startTime?: string | null, endTime?: string | null): { within: boolean; scheduledFor: string | null } {
    const nowSp = new Date(Date.now() + SP_OFFSET_MINUTES * 60000); // campos UTC representam o relógio local de SP
    const y = nowSp.getUTCFullYear();
    const mo = nowSp.getUTCMonth();
    const d = nowSp.getUTCDate();

    const start = parseHHMM(startTime, '00:00');
    const end = parseHHMM(endTime, '23:59');

    const nowMin = nowSp.getUTCHours() * 60 + nowSp.getUTCMinutes();
    const startMin = start.h * 60 + start.m;
    const endMin = end.h * 60 + end.m;

    if (nowMin >= startMin && nowMin <= endMin) {
        return { within: true, scheduledFor: null };
    }

    // Fora da janela: agenda para o próximo início (hoje se antes da janela, amanhã se depois).
    const targetDay = nowMin > endMin ? d + 1 : d;
    const utcMs = Date.UTC(y, mo, targetDay, start.h, start.m) - SP_OFFSET_MINUTES * 60000;
    return { within: false, scheduledFor: new Date(utcMs).toISOString() };
}

function extractPhone(item: AnyObj): string {
    const raw = item.phone ?? item.whatsapp ?? item.numero ?? item.number ?? item.telefone ?? '';
    return String(raw).replace(/\D/g, '');
}

async function resolveCampaignInstance(supabase: any, organizationId: string, workspaceId?: string | null) {
    if (workspaceId) {
        const { data: workspace } = await supabase
            .from('workspaces')
            .select('whatsapp_instance_id')
            .eq('id', workspaceId)
            .eq('organization_id', organizationId)
            .maybeSingle();

        if (workspace?.whatsapp_instance_id) {
            const { data: instance } = await supabase
                .from('whatsapp_instances')
                .select('id, phone_number, logical_phone')
                .eq('id', workspace.whatsapp_instance_id)
                .eq('organization_id', organizationId)
                .maybeSingle();
            if (instance?.id) return instance;
        }
    }

    const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('id, phone_number, logical_phone')
        .eq('organization_id', organizationId)
        .eq('status', 'connected')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    return instance || null;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // 1. Token: último segmento do path (/campaign-webhook/<token>) ou ?token=
        const url = new URL(req.url);
        const segments = url.pathname.split('/').filter(Boolean);
        let token = segments[segments.length - 1] || '';
        if (token === 'campaign-webhook') token = '';
        if (!token) token = url.searchParams.get('token') || '';

        if (!token) {
            return new Response(JSON.stringify({ error: 'Webhook token ausente na URL.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 2. Busca campanha pelo token
        const { data: campaign } = await supabase
            .from('campaigns')
            .select('id, organization_id, flow_id, is_active, match_type, start_time, end_time, workspace_id')
            .eq('webhook_token', token)
            .maybeSingle();

        if (!campaign || campaign.match_type !== 'webhook') {
            return new Response(JSON.stringify({ error: 'Webhook não encontrado.' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (!campaign.is_active) {
            return new Response(JSON.stringify({ error: 'Campanha inativa.' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const campaignInstance = await resolveCampaignInstance(supabase, campaign.organization_id, campaign.workspace_id);

        // 3. Body: objeto único ou array -> normaliza para array
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return new Response(JSON.stringify({ error: 'Body JSON inválido.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Aceita { contacts: [...] }, um array direto, ou um objeto único.
        let items: AnyObj[];
        if (Array.isArray(body)) {
            items = body as AnyObj[];
        } else if (body && typeof body === 'object' && Array.isArray((body as AnyObj).contacts)) {
            items = (body as AnyObj).contacts;
        } else if (body && typeof body === 'object') {
            items = [body as AnyObj];
        } else {
            items = [];
        }

        if (items.length === 0) {
            return new Response(JSON.stringify({ error: 'Nenhum contato informado.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (items.length > MAX_ITEMS) {
            return new Response(JSON.stringify({ error: `Máximo de ${MAX_ITEMS} contatos por chamada.` }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const orgId = campaign.organization_id;
        const window = computeWindow(campaign.start_time, campaign.end_time);

        const results: Array<{ phone: string; conversation_id: string | null; status: string; error?: string }> = [];
        let processed = 0;
        let queued = 0;
        let skipped = 0;

        for (const item of items) {
            const phone = extractPhone(item || {});

            if (phone.length < 8 || phone.length > 15) {
                skipped++;
                results.push({ phone, conversation_id: null, status: 'skipped_invalid_phone' });
                continue;
            }

            try {
            // Upsert do contato por (organization_id, phone)
            let contactId: string | null = null;
            const { data: existingContact } = await supabase
                .from('contacts')
                .select('id')
                .eq('organization_id', orgId)
                .eq('phone', phone)
                .maybeSingle();

            if (existingContact) {
                contactId = existingContact.id;
                const updates: AnyObj = {};
                if (item.name) updates.name = item.name;
                if (item.email) updates.email = item.email;
                if (Object.keys(updates).length > 0) {
                    await supabase.from('contacts').update(updates).eq('id', contactId);
                }
            } else {
                const { data: newContact, error: contactError } = await supabase
                    .from('contacts')
                    .insert({
                        organization_id: orgId,
                        phone,
                        name: item.name || null,
                        email: item.email || null,
                        workspace_id: campaign.workspace_id || null,
                    })
                    .select('id')
                    .single();
                if (contactError || !newContact) {
                    console.error('[campaign-webhook] contact insert error:', contactError);
                    skipped++;
                    results.push({ phone, conversation_id: null, status: 'error_contact', error: contactError?.message });
                    continue;
                }
                contactId = newContact.id;
            }

            // Encontra ou cria a conversa
            let conversationId: string | null = null;
            let existingConversationQuery = supabase
                .from('conversations')
                .select('id')
                .eq('organization_id', orgId)
                .eq('contact_id', contactId);

            existingConversationQuery = campaignInstance?.id
                ? existingConversationQuery.eq('whatsapp_instance_id', campaignInstance.id)
                : existingConversationQuery.is('whatsapp_instance_id', null);

            const { data: existingConv } = await existingConversationQuery
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (existingConv) {
                conversationId = existingConv.id;
                await supabase.from('conversations').update({ status: 'open' }).eq('id', conversationId);
            } else {
                const { data: newConv, error: convError } = await supabase
                    .from('conversations')
                    .insert({
                        organization_id: orgId,
                        contact_id: contactId,
                        status: 'open',
                        workspace_id: campaign.workspace_id || null,
                        whatsapp_instance_id: campaignInstance?.id || null,
                        source_phone: campaignInstance?.phone_number || campaignInstance?.logical_phone || null,
                        metadata: { source: 'campaign_webhook', campaign_id: campaign.id },
                    })
                    .select('id')
                    .single();
                if (convError || !newConv) {
                    console.error('[campaign-webhook] conversation insert error:', convError);
                    skipped++;
                    results.push({ phone, conversation_id: null, status: 'error_conversation', error: convError?.message || 'insert retornou vazio (possivel trigger BEFORE INSERT retornando NULL, ou SERVICE_ROLE_KEY ausente)' });
                    continue;
                }
                conversationId = newConv.id;
            }

            // Variáveis = todo o payload do item, com o telefone normalizado.
            const variables: AnyObj = { ...item, phone };

            if (window.within) {
                // Dentro da janela -> dispara o fluxo agora (em background) e conta o gatilho.
                await supabase.rpc('increment_campaign_count', { campaign_id: campaign.id });

                const flowPromise = fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
                    body: JSON.stringify({ flowId: campaign.flow_id, conversationId, variables }),
                });
                flowPromise.catch((err) => console.error('[campaign-webhook] flow-execute error:', err));

                processed++;
                results.push({ phone, conversation_id: conversationId, status: 'triggered' });
            } else {
                // Fora da janela -> enfileira para o próximo horário válido.
                await supabase.from('campaign_queue').insert({
                    organization_id: orgId,
                    campaign_id: campaign.id,
                    conversation_id: conversationId,
                    contact_id: contactId,
                    scheduled_for: window.scheduledFor,
                    status: 'pending',
                    variables,
                });
                queued++;
                results.push({ phone, conversation_id: conversationId, status: 'queued' });
            }
            } catch (itemErr) {
                console.error('[campaign-webhook] item error:', itemErr);
                skipped++;
                results.push({ phone, conversation_id: null, status: 'error_exception', error: String((itemErr as Error)?.message || itemErr) });
            }
        }

        // Log da chamada
        const logStatus = skipped === items.length ? 'skipped' : queued > 0 && processed === 0 ? 'queued' : 'processed';
        await supabase.from('campaign_webhook_logs').insert({
            organization_id: orgId,
            campaign_id: campaign.id,
            payload: body as AnyObj,
            status: logStatus,
            contacts_processed: processed + queued,
        });

        return new Response(JSON.stringify({ success: true, version: 'diag-v3', processed, queued, skipped, results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('[campaign-webhook] error:', error);
        return new Response(JSON.stringify({ error: String(error) }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
