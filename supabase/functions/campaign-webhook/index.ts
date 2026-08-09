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

// DDDs brasileiros válidos — usado para decidir se um número cru de 10/11 dígitos
// é nacional (e merece o prefixo 55) ou já é internacional.
const VALID_DDDS = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49,
    51, 53, 54, 55,
    61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79,
    81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

function uniquePhones(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.filter((value): value is string => !!value && value.length >= 8)));
}

// Retorna o número em E.164 completo, de forma country-aware.
// - Já começa com 55 (Brasil) → mantém.
// - Número NACIONAL brasileiro cru (10 díg. = DDD+8; ou 11 díg. com o 9º dígito
//   de celular) com DDD válido → prefixa 55.
// - Qualquer outro caso é tratado como número internacional que JÁ traz o
//   código de país (ex.: EUA +1) → preserva. Forçar 55 aqui corromperia
//   números estrangeiros (ex.: 18572664160 viraria 5518572664160).
function withCountryCode(phone: string): string {
    const clean = phone.replace(/\D/g, '');
    if (!clean) return '';
    if (clean.startsWith('55')) return clean;
    const ddd = parseInt(clean.substring(0, 2), 10);
    if (clean.length === 10 && VALID_DDDS.has(ddd)) return `55${clean}`;
    if (clean.length === 11 && clean[2] === '9' && VALID_DDDS.has(ddd)) return `55${clean}`;
    return clean;
}

function withoutCountryCode(phone: string): string {
    const clean = phone.replace(/\D/g, '');
    return clean.startsWith('55') ? clean.slice(2) : clean;
}

/**
 * Todas as representações plausíveis do mesmo número. Um gateway de pagamento
 * manda o telefone no formato que quiser (com/sem 55, com/sem o nono dígito),
 * enquanto o contato foi gravado pelo zapi-webhook no formato do WhatsApp.
 * Sem isto, a busca por igualdade exata falha e nasce um contato duplicado.
 * Mesma lógica de zapi-webhook para as duas portas de entrada concordarem.
 */
function phoneVariants(raw: string): string[] {
    const clean = raw.replace(/@.*$/, '').replace(/\D/g, '');
    if (!clean) return [];

    const variants = new Set<string>();
    const add = (value: string) => {
        if (!value) return;
        variants.add(value);
        const with55 = withCountryCode(value);
        if (with55) variants.add(with55);
        const no55 = withoutCountryCode(value);
        if (no55) variants.add(no55);
    };

    add(clean);

    const local = withoutCountryCode(clean);
    if (local.length === 10) {
        // DDD + 8 dígitos -> possível forma de celular com o 9 depois do DDD
        add(`${local.slice(0, 2)}9${local.slice(2)}`);
    }
    if (local.length === 11 && local[2] === '9') {
        // DDD + 9 + 8 dígitos -> forma legada sem o 9
        add(`${local.slice(0, 2)}${local.slice(3)}`);
    }

    return uniquePhones(Array.from(variants));
}

function canonicalPhone(raw: string): string {
    const clean = raw.replace(/@.*$/, '').replace(/\D/g, '');
    if (!clean) return '';
    return withCountryCode(clean) || clean;
}

/**
 * Escolhe qual contato vence quando mais de uma variante casa. Mesmo critério do
 * zapi-webhook: canônico primeiro, depois quem tem código de país, depois o mais
 * recente. Assim o webhook de pagamento e a entrada de WhatsApp elegem o MESMO
 * contato — se divergissem, a tag iria para um registro e a conversa para outro.
 */
function pickBestContact(contacts: AnyObj[], canonical: string): AnyObj | undefined {
    return [...contacts].sort((a, b) => {
        const aCanonical = canonicalPhone(a.phone || '') === canonical || a.metadata?.canonical_phone === canonical;
        const bCanonical = canonicalPhone(b.phone || '') === canonical || b.metadata?.canonical_phone === canonical;
        if (aCanonical !== bCanonical) return aCanonical ? -1 : 1;
        const aHasCountryCode = String(a.phone || '').replace(/\D/g, '').startsWith('55');
        const bHasCountryCode = String(b.phone || '').replace(/\D/g, '').startsWith('55');
        if (aHasCountryCode !== bHasCountryCode) return aHasCountryCode ? -1 : 1;
        return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
    })[0];
}

// ATENÇÃO: whatsapp_instances NÃO tem a coluna logical_phone. Pedir uma coluna
// inexistente faz o PostgREST rejeitar o SELECT inteiro (não é campo nulo, é erro),
// e como o erro era ignorado a instância vinha sempre null — a campanha então
// procurava conversa com whatsapp_instance_id IS NULL e pegava a conversa errada.
const INSTANCE_COLUMNS = 'id, phone_number';

/**
 * Regra de negócio: campanha de um workspace SÓ envia pelo número desse workspace.
 * Se o workspace não tem número, a campanha não envia por nenhum outro — retorna
 * `blocked`. NÃO existe fallback por organização quando há workspace; o fallback
 * só vale para campanha sem workspace nenhum.
 */
async function resolveCampaignInstance(supabase: any, organizationId: string, workspaceId?: string | null) {
    if (workspaceId) {
        const { data: workspace } = await supabase
            .from('workspaces')
            .select('whatsapp_instance_id')
            .eq('id', workspaceId)
            .eq('organization_id', organizationId)
            .maybeSingle();

        if (!workspace?.whatsapp_instance_id) {
            return { instance: null, blocked: true };
        }

        const { data: instance, error } = await supabase
            .from('whatsapp_instances')
            .select(INSTANCE_COLUMNS)
            .eq('id', workspace.whatsapp_instance_id)
            .eq('organization_id', organizationId)
            .maybeSingle();
        if (error) console.error('[campaign-webhook] erro ao buscar instância do workspace:', error);

        return { instance: instance || null, blocked: !instance?.id };
    }

    const { data: instance, error } = await supabase
        .from('whatsapp_instances')
        .select(INSTANCE_COLUMNS)
        .eq('organization_id', organizationId)
        .eq('status', 'connected')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) console.error('[campaign-webhook] erro ao buscar instância da org:', error);
    return { instance: instance || null, blocked: false };
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
            .select('id, name, organization_id, flow_id, is_active, match_type, start_time, end_time, workspace_id')
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

        const { instance: campaignInstance, blocked: instanceBlocked } = await resolveCampaignInstance(
            supabase,
            campaign.organization_id,
            campaign.workspace_id,
        );

        // Workspace da campanha sem número: recusamos AQUI, antes de criar contato
        // ou conversa. Antes seguíamos em frente e a conversa nascia num estado que
        // nunca conseguiria enviar.
        if (instanceBlocked) {
            return new Response(JSON.stringify({
                error: 'O workspace desta campanha não tem número de WhatsApp vinculado. Vincule um número ao workspace para a campanha poder enviar.',
                reason: 'campaign_workspace_without_number',
                campaign_workspace_id: campaign.workspace_id,
            }), {
                status: 422,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

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

        const results: Array<{
            phone: string;
            conversation_id: string | null;
            status: string;
            error?: string;
            conversation_workspace_id?: string | null;
        }> = [];
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
            // Upsert do contato por (organization_id, phone). A busca testa TODAS as
            // representações do número, não só a string recebida: o contato quase
            // sempre já existe (gravado pelo zapi-webhook em formato WhatsApp) e o
            // gateway manda o telefone em outro formato. Igualdade exata aqui gerava
            // contato duplicado, e a tag acabava num registro sem conversa.
            const variants = phoneVariants(phone);
            const canonical = canonicalPhone(phone);

            let contactId: string | null = null;
            const { data: matchingContacts } = await supabase
                .from('contacts')
                .select('id, phone, name, email, metadata, updated_at, created_at')
                .eq('organization_id', orgId)
                .in('phone', variants.length > 0 ? variants : [phone])
                .order('updated_at', { ascending: false })
                .limit(20);

            const existingContact = pickBestContact(matchingContacts || [], canonical);

            if (existingContact) {
                contactId = existingContact.id;
                const updates: AnyObj = {};
                if (item.name) updates.name = item.name;
                if (item.email) updates.email = item.email;
                // Registra os formatos já vistos deste número para que buscas futuras
                // reconheçam o contato mesmo vindo de outra origem.
                const metadata = { ...(existingContact.metadata || {}) };
                updates.metadata = {
                    ...metadata,
                    phone_aliases: uniquePhones([...(metadata.phone_aliases || []), phone, canonical, ...variants]),
                    canonical_phone: canonical,
                };
                await supabase.from('contacts').update(updates).eq('id', contactId);
            } else {
                const { data: newContact, error: contactError } = await supabase
                    .from('contacts')
                    .insert({
                        organization_id: orgId,
                        // Grava em E.164 canônico, igual ao zapi-webhook — senão o
                        // próximo contato vindo do WhatsApp não encontraria este.
                        phone: canonical || phone,
                        name: item.name || null,
                        email: item.email || null,
                        workspace_id: campaign.workspace_id || null,
                        metadata: {
                            phone_aliases: uniquePhones([phone, canonical, ...variants]),
                            canonical_phone: canonical,
                        },
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
            let conversationWorkspaceId: string | null = null;
            let existingConversationQuery = supabase
                .from('conversations')
                .select('id, workspace_id')
                .eq('organization_id', orgId)
                .eq('contact_id', contactId);

            // Regra: campanha de um workspace atua SOMENTE sobre a conversa daquele
            // workspace. Sem este escopo, a busca por instância pegava a conversa do
            // contato em OUTRO workspace, e o fluxo passava a enviar (ou a ser
            // bloqueado) pelo número de um workspace que não é o da campanha.
            existingConversationQuery = campaign.workspace_id
                ? existingConversationQuery.eq('workspace_id', campaign.workspace_id)
                : campaignInstance?.id
                    ? existingConversationQuery.eq('whatsapp_instance_id', campaignInstance.id)
                    : existingConversationQuery.is('whatsapp_instance_id', null);

            const { data: existingConv } = await existingConversationQuery
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (existingConv) {
                // ATENÇÃO: conversa preexistente mantém o workspace que já tinha.
                // Se ele for diferente do workspace da campanha, é o workspace ANTIGO
                // que decide por qual número o fluxo envia (ou se envia).
                conversationId = existingConv.id;
                conversationWorkspaceId = existingConv.workspace_id || null;
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
                        source_phone: campaignInstance?.phone_number || null,
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
                conversationWorkspaceId = campaign.workspace_id || null;
            }

            // Variáveis = todo o payload do item, com o telefone normalizado.
            // Usa o canônico (E.164), não o cru: um gateway que mande "11987654321"
            // sem código de país deixaria {{phone}} inutilizável para envio.
            // Inclui identificação da campanha que disparou o fluxo (id é único; name é para exibição).
            const variables: AnyObj = { ...item, phone: canonical || phone, campaign_id: campaign.id, campaign_name: campaign.name };

            if (window.within) {
                // Dentro da janela -> dispara o fluxo agora.
                // O flow-execute responde assim que enfileira a execução em background
                // (EdgeRuntime.waitUntil), então o await aqui é barato. Disparar sem
                // aguardar mata a requisição junto com o isolate quando esta função
                // retorna, e o fluxo nunca chega a rodar.
                const flowResp = await fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
                    body: JSON.stringify({ flowId: campaign.flow_id, conversationId, isFromOrchestrator: true, variables }),
                }).catch((err) => {
                    console.error('[campaign-webhook] flow-execute error:', err);
                    return null;
                });

                if (!flowResp || !flowResp.ok) {
                    const detail = flowResp ? await flowResp.text().catch(() => '') : 'fetch falhou';
                    console.error('[campaign-webhook] flow-execute rejeitou o disparo:', detail);
                    skipped++;
                    results.push({
                        phone,
                        conversation_id: conversationId,
                        conversation_workspace_id: conversationWorkspaceId,
                        status: 'error_flow',
                        error: detail,
                    });
                    continue;
                }

                // Só conta o gatilho depois que o fluxo foi aceito.
                await supabase.rpc('increment_campaign_count', { campaign_id: campaign.id });

                processed++;
                results.push({ phone, conversation_id: conversationId, conversation_workspace_id: conversationWorkspaceId, status: 'triggered' });
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

        return new Response(JSON.stringify({
            success: true,
            version: 'diag-v7',
            campaign_workspace_id: campaign.workspace_id || null,
            processed,
            queued,
            skipped,
            results,
        }), {
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
