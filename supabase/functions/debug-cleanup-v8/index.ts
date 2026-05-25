import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results = [];
    const { data: contacts } = await supabase.from('contacts').select('id, phone').or('phone.ilike.55800%,phone.ilike.55400%,phone.ilike.800%,phone.ilike.400%');

    if (contacts) {
        for (const contact of contacts) {
            let newPhone = contact.phone;
            if (contact.phone.startsWith('55800')) newPhone = '0' + contact.phone.substring(2);
            else if (contact.phone.startsWith('55400')) newPhone = contact.phone.substring(2);
            else if (contact.phone.startsWith('800')) newPhone = '0' + contact.phone;

            if (newPhone !== contact.phone) {
                const { data: target } = await supabase.from('contacts').select('id').eq('phone', newPhone).maybeSingle();
                if (target) {
                    await supabase.from('conversations').update({ contact_id: target.id }).eq('contact_id', contact.id);
                    await supabase.from('contacts').delete().eq('id', contact.id);
                    results.push(`Merged ${contact.phone} into ${newPhone}`);
                } else {
                    await supabase.from('contacts').update({ phone: newPhone }).eq('id', contact.id);
                    results.push(`Updated ${contact.phone} to ${newPhone}`);
                }
            }
        }
    }
    return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
});
