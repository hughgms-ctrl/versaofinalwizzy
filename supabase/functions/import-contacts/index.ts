import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Máximo de linhas por chamada. O front fatia a planilha em lotes deste tamanho
// e mostra progresso; assim um arquivo de 10 mil linhas não estoura o timeout
// da function nem trava a aba do navegador.
const MAX_ROWS = 200;

// deno-lint-ignore no-explicit-any
type AnyObj = Record<string, any>;

interface ImportRow {
    phone: string;
    name?: string | null;
    email?: string | null;
    /** Valores dos campos customizados: { chave_do_campo: valor } */
    custom?: Record<string, string>;
}

interface ImportPayload {
    rows: ImportRow[];
    workspaceId: string | null;
    /** Tags aplicadas a TODOS os contatos do lote. */
    tagIds?: string[];
    /** Campos customizados aplicados a TODOS do lote (valor fixo). */
    commonCustom?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Normalização de telefone.
// Copiada de campaign-webhook/index.ts de propósito: as duas portas de entrada
// precisam eleger o MESMO contato para um dado número, senão o import cria
// duplicados de contatos que já existem vindos do WhatsApp. Manter em sincronia
// com campaign-webhook e zapi-webhook.
// ---------------------------------------------------------------------------

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

// Country-aware: só prefixa 55 em número nacional plausível. Forçar 55 em
// qualquer coisa corromperia número estrangeiro (ex.: EUA +1).
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
        add(`${local.slice(0, 2)}9${local.slice(2)}`);
    }
    if (local.length === 11 && local[2] === '9') {
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
 * Normaliza contacts.metadata para um objeto seguro de espalhar.
 * A coluna é jsonb e quase sempre volta como objeto, mas um valor string
 * (JSON serializado por engano) espalhado com {...} viraria um mapa de índices
 * de caractere, destruindo note/phone_aliases/custom_fields do contato.
 */
function toMetadataObject(value: unknown): AnyObj {
    if (!value) return {};
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    if (typeof value === 'object' && !Array.isArray(value)) return value as AnyObj;
    return {};
}

/** Mesmo critério do campaign-webhook: canônico > com país > mais recente. */
function pickBestContact(candidates: AnyObj[], canonical: string): AnyObj | null {
    if (!candidates.length) return null;
    const exact = candidates.find((c) => c.phone === canonical);
    if (exact) return exact;
    const withCountry = candidates.find((c) => String(c.phone || '').startsWith('55'));
    if (withCountry) return withCountry;
    return candidates[0];
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const authHeader = req.headers.get('Authorization') ?? '';
        const token = authHeader.replace('Bearer ', '');

        const admin = createClient(supabaseUrl, serviceKey);

        // A org NUNCA vem do payload — sempre do perfil do usuário autenticado.
        const { data: userData, error: userError } = await admin.auth.getUser(token);
        if (userError || !userData.user) throw new Error('Usuário não autenticado');

        const { data: profile, error: profileError } = await admin
            .from('profiles')
            .select('organization_id')
            .eq('user_id', userData.user.id)
            .single();

        if (profileError || !profile?.organization_id) throw new Error('Perfil não encontrado');
        const organizationId = profile.organization_id as string;

        const payload = (await req.json()) as ImportPayload;
        const rows = Array.isArray(payload?.rows) ? payload.rows : [];

        if (rows.length === 0) throw new Error('Nenhuma linha para importar');
        if (rows.length > MAX_ROWS) throw new Error(`Máximo de ${MAX_ROWS} linhas por chamada`);

        // Valida o workspace informado: precisa pertencer à mesma org, senão o
        // import poderia jogar contatos para dentro de outra organização.
        let workspaceId: string | null = payload.workspaceId || null;
        if (workspaceId) {
            const { data: ws } = await admin
                .from('workspaces')
                .select('id')
                .eq('id', workspaceId)
                .eq('organization_id', organizationId)
                .maybeSingle();
            if (!ws) throw new Error('Workspace inválido');
        }

        // Idem para as tags aplicadas ao lote.
        let tagIds: string[] = Array.isArray(payload.tagIds) ? payload.tagIds : [];
        if (tagIds.length > 0) {
            const { data: validTags } = await admin
                .from('tags')
                .select('id')
                .eq('organization_id', organizationId)
                .in('id', tagIds);
            tagIds = (validTags || []).map((t: AnyObj) => t.id);
        }

        // Só aceita valores de campos que existem no catálogo da org. Assim uma
        // chave arbitrária vinda do client não polui o metadata dos contatos.
        const { data: fieldDefs } = await admin
            .from('contact_custom_fields')
            .select('key')
            .eq('organization_id', organizationId);
        const allowedKeys = new Set((fieldDefs || []).map((f: AnyObj) => f.key as string));

        const pickAllowed = (obj: Record<string, string> | undefined): Record<string, string> => {
            const out: Record<string, string> = {};
            for (const [key, value] of Object.entries(obj || {})) {
                if (!allowedKeys.has(key)) continue;
                const text = typeof value === 'string' ? value : String(value ?? '');
                if (text.trim() === '') continue;
                out[key] = text;
            }
            return out;
        };

        const commonCustom = pickAllowed(payload.commonCustom);

        let created = 0;
        let updated = 0;
        let skipped = 0;
        const errors: Array<{ phone: string; error: string }> = [];
        const touchedContactIds: string[] = [];

        for (const row of rows) {
            const rawPhone = String(row?.phone ?? '').replace(/\D/g, '');
            if (!rawPhone || rawPhone.length < 8) {
                skipped++;
                continue;
            }

            try {
                const variants = phoneVariants(rawPhone);
                const canonical = canonicalPhone(rawPhone);
                // Valores do contato: os da linha vencem sobre os comuns do lote.
                const custom = { ...commonCustom, ...pickAllowed(row.custom) };

                const { data: matching } = await admin
                    .from('contacts')
                    .select('id, phone, name, email, metadata, workspace_id, shared_workspace_ids, updated_at, created_at')
                    .eq('organization_id', organizationId)
                    .in('phone', variants.length > 0 ? variants : [rawPhone])
                    .order('updated_at', { ascending: false })
                    .limit(20);

                const existing = pickBestContact(matching || [], canonical);
                const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : null;
                const email = typeof row.email === 'string' && row.email.trim() ? row.email.trim() : null;

                if (existing) {
                    // Merge: só sobrescreve o que veio preenchido na planilha, para
                    // não apagar dado bom com célula vazia.
                    // toMetadataObject protege o espalhamento: se metadata vier como
                    // string, { ...'texto' } viraria {0:'t',1:'e',...} e corromperia
                    // o registro do contato.
                    const metadata = toMetadataObject(existing.metadata);
                    const updates: AnyObj = {
                        metadata: {
                            ...metadata,
                            custom_fields: { ...toMetadataObject(metadata.custom_fields), ...custom },
                            phone_aliases: uniquePhones([
                                ...(metadata.phone_aliases || []),
                                rawPhone,
                                canonical,
                                ...variants,
                            ]),
                            canonical_phone: canonical,
                        },
                    };
                    if (name) updates.name = name;
                    if (email) updates.email = email;
                    // Nunca move de workspace: mudar o workspace de um contato
                    // existente o faria sumir da tela de quem trabalha no
                    // workspace antigo. Se o contato ainda não tem workspace, a
                    // RPC abaixo o adota; se já tem outro, ela o faz aparecer
                    // TAMBÉM no workspace desta importação.

                    const { error: updateError } = await admin
                        .from('contacts')
                        .update(updates)
                        .eq('id', existing.id);
                    if (updateError) throw updateError;

                    // A checagem local evita uma chamada por linha da planilha
                    // num lote onde quase todo mundo já está visível aqui.
                    const appearsHere = existing.workspace_id === workspaceId
                        || (existing.shared_workspace_ids || []).includes(workspaceId);
                    if (workspaceId && !appearsHere) {
                        const { error: shareError } = await admin.rpc('share_contact_with_workspace', {
                            _contact_id: existing.id,
                            _workspace_id: workspaceId,
                        });
                        if (shareError) throw shareError;
                    }

                    touchedContactIds.push(existing.id);
                    updated++;
                } else {
                    const { data: inserted, error: insertError } = await admin
                        .from('contacts')
                        .insert({
                            organization_id: organizationId,
                            // E.164 canônico, igual ao zapi-webhook — senão o próximo
                            // contato vindo do WhatsApp não encontraria este.
                            phone: canonical || rawPhone,
                            name,
                            email,
                            workspace_id: workspaceId,
                            metadata: {
                                custom_fields: custom,
                                phone_aliases: uniquePhones([rawPhone, canonical, ...variants]),
                                canonical_phone: canonical,
                            },
                        })
                        .select('id')
                        .single();

                    if (insertError || !inserted) throw insertError || new Error('Falha ao inserir');

                    touchedContactIds.push(inserted.id);
                    created++;
                }
            } catch (error) {
                skipped++;
                errors.push({ phone: rawPhone, error: (error as Error)?.message || 'Erro' });
            }
        }

        // Tags do lote. Insere direto em contact_tags, SEM passar pelo hook
        // useAddTagToContact: aquele caminho dispara zapi-contact-tags por contato
        // para espelhar a etiqueta no WhatsApp, o que em um import de milhares de
        // linhas viraria milhares de chamadas à Evolution.
        if (tagIds.length > 0 && touchedContactIds.length > 0) {
            const links = touchedContactIds.flatMap((contactId) =>
                tagIds.map((tagId) => ({
                    contact_id: contactId,
                    tag_id: tagId,
                    added_by: userData.user.id,
                    added_by_type: 'import',
                })),
            );
            // ignoreDuplicates: reimportar a mesma planilha não deve falhar por
            // causa do unique de (contact_id, tag_id).
            const { error: tagError } = await admin
                .from('contact_tags')
                .upsert(links, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true });
            if (tagError) console.error('[import-contacts] tag link error:', tagError);
        }

        return new Response(
            JSON.stringify({ success: true, created, updated, skipped, errors: errors.slice(0, 20) }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: (error as Error)?.message || 'Erro inesperado' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }
});
