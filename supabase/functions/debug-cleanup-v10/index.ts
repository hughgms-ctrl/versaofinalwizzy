import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        console.log("Iniciando faxina definitiva V10...");

        // 1. Corrigir números de 10-11 dígitos (adicionar 55)
        const { data: contactsToFix } = await supabase
            .from('contacts')
            .select('id, phone')
            .or('phone.length.eq.10,phone.length.eq.11');

        let fixedCount = 0;
        for (const contact of (contactsToFix || [])) {
            if (!contact.phone.startsWith('55')) {
                const ddd = parseInt(contact.phone.substring(0, 2), 10);
                if (VALID_DDDS.has(ddd)) {
                    await supabase.from('contacts').update({ phone: `55${contact.phone}` }).eq('id', contact.id);
                    fixedCount++;
                }
            }
        }
        console.log(`Números corrigidos (prefixo 55): ${fixedCount}`);

        // 2. Identificar e Deletar lixo (DDD inválido ou formato bizarro)
        const { data: allContacts } = await supabase.from('contacts').select('id, phone');
        const toDelete = [];
        for (const c of (allContacts || [])) {
            const clean = c.phone.replace(/\D/g, '');
            let isInvalid = false;

            if (clean.length < 10) isInvalid = true;
            else if (clean.startsWith('55')) {
                const ddd = parseInt(clean.substring(2, 4), 10);
                if (!VALID_DDDS.has(ddd)) isInvalid = true;
            } else {
                const ddd = parseInt(clean.substring(0, 2), 10);
                if (!VALID_DDDS.has(ddd)) isInvalid = true;
            }

            if (isInvalid) toDelete.push(c.id);
        }

        let deletedCount = 0;
        if (toDelete.length > 0) {
            const { error: delError } = await supabase.from('contacts').delete().in('id', toDelete);
            if (!delError) deletedCount = toDelete.length;
            else console.error("Erro ao deletar contatos:", delError);
        }

        console.log(`Contatos inválidos removidos: ${deletedCount}`);

        return new Response(JSON.stringify({
            success: true,
            fixedPrefixCount: fixedCount,
            deletedInvalidCount: deletedCount
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
});
