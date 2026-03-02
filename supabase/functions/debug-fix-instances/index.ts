import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results = [];

    try {
        const { data: instances } = await supabase.from('whatsapp_instances').select('id, phone_number');
        if (instances) {
            for (const inst of instances) {
                if (inst.phone_number && inst.phone_number.length > 13) {
                    // Brazil case: if it starts with 55 and has more than 13 digits, it's likely a device ID concatenated
                    if (inst.phone_number.startsWith('55')) {
                        const cleaned = inst.phone_number.substring(0, 13);
                        await supabase.from('whatsapp_instances').update({ phone_number: cleaned }).eq('id', inst.id);
                        results.push({ id: inst.id, old: inst.phone_number, new: cleaned });
                    }
                }
            }
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
});
