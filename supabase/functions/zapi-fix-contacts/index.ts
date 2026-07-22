import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUserOrganizationIds } from '../_shared/access.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// DDDs brasileiros válidos — usados para não confundir número internacional
// (ex.: EUA +1) com número nacional brasileiro cru.
const VALID_DDDS = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49,
    51, 53, 54, 55,
    61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79,
    81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99
]);

function ensureCountryCode(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 0) return '';
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
    if (cleaned.startsWith('55')) return cleaned;
    // Country-aware: só prefixa 55 em número NACIONAL brasileiro cru (DDD válido;
    // celular tem o 9 como 3º dígito). Número que já traz outro código de país
    // (ex.: EUA +1) é PRESERVADO — antes forçava 55 e corrompia o estrangeiro,
    // e por ser um "fix" em massa isso reverteria a recuperação dos números.
    const ddd = parseInt(cleaned.substring(0, 2), 10);
    if (cleaned.length === 10 && VALID_DDDS.has(ddd)) return '55' + cleaned;
    if (cleaned.length === 11 && cleaned[2] === '9' && VALID_DDDS.has(ddd)) return '55' + cleaned;
    return cleaned;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const token = authHeader.replace(/^Bearer\s+/i, '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized', details: authError?.message }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { organizationId } = await req.json();

        if (!organizationId) {
            return new Response(JSON.stringify({ error: 'organizationId is required' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // SEGURANÇA (IDOR): confirmar que o usuário autenticado é MEMBRO da org do
        // body antes de reescrever os contatos dela. Sem isto, qualquer JWT válido
        // (de qualquer org) podia alterar os contatos de QUALQUER organização.
        const memberOrgIds = await getUserOrganizationIds(supabase, user.id);
        if (!memberOrgIds.includes(organizationId)) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 1. Get all contacts for org
        const { data: contacts } = await supabase
            .from('contacts')
            .select('id, phone, name')
            .eq('organization_id', organizationId);

        if (!contacts) return new Response(JSON.stringify({ success: true, count: 0 }));

        let updatedCount = 0;
        for (const contact of contacts) {
            const formatted = ensureCountryCode(contact.phone);
            if (formatted !== contact.phone) {
                await supabase.from('contacts').update({ phone: formatted }).eq('id', contact.id);
                updatedCount++;
            }

            // Trigger profile fetch if name is missing
            if (!contact.name || contact.name.includes('Unknown') || /^\d+$/.test(contact.name)) {
                fetch(`${supabaseUrl}/functions/v1/zapi-contact-profile`, {
                    method: 'POST',
                    headers: { 'Authorization': req.headers.get('Authorization')!, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contactId: contact.id, phone: formatted }),
                }).catch(() => { });
            }
        }

        return new Response(JSON.stringify({ success: true, updatedCount }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
});
