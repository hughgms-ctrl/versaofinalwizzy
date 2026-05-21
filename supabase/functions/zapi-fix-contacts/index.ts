import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function ensureCountryCode(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 0) return '';
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
    if (cleaned.length >= 10 && cleaned.length <= 11 && !cleaned.startsWith('55')) {
        cleaned = '55' + cleaned;
    }
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
