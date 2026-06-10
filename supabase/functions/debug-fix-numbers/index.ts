import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
    if (Deno.env.get('ENABLE_DEBUG_FUNCTIONS') !== 'true') {
        return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Find problematic contacts
    const { data: contacts } = await supabase
        .from('contacts')
        .select('id, phone, name')
        .or('phone.ilike.55800%,phone.ilike.55400%,phone.ilike.800%,phone.ilike.400%');

    if (!contacts || contacts.length === 0) {
        return new Response(JSON.stringify({ message: 'No problematic numbers found' }), { headers: { 'Content-Type': 'application/json' } });
    }

    const results = [];
    for (const contact of contacts) {
        let newPhone = contact.phone;

        if (contact.phone.startsWith('55800')) {
            newPhone = '0' + contact.phone.substring(2);
        } else if (contact.phone.startsWith('55400')) {
            newPhone = contact.phone.substring(2);
        } else if (contact.phone.startsWith('800')) {
            newPhone = '0' + contact.phone;
        }

        if (newPhone !== contact.phone) {
            // Check if target phone already exists
            const { data: targetContact } = await supabase
                .from('contacts')
                .select('id')
                .eq('phone', newPhone)
                .maybeSingle();

            if (targetContact) {
                // MOVE conversations
                const { data: convs } = await supabase
                    .from('conversations')
                    .select('id')
                    .eq('contact_id', contact.id);

                if (convs) {
                    for (const conv of convs) {
                        await supabase
                            .from('conversations')
                            .update({ contact_id: targetContact.id })
                            .eq('id', conv.id);
                        results.push({ action: 'moved_conversation', from: contact.id, to: targetContact.id });
                    }
                }

                // DELETE malformed contact
                const { error: delError } = await supabase
                    .from('contacts')
                    .delete()
                    .eq('id', contact.id);

                results.push({ id: contact.id, old: contact.phone, action: 'merged_deleted', success: !delError });
            } else {
                // Just update
                const { error: updateError } = await supabase
                    .from('contacts')
                    .update({ phone: newPhone })
                    .eq('id', contact.id);

                results.push({ id: contact.id, old: contact.phone, new: newPhone, action: 'updated', success: !updateError });
            }
        }
    }

    return new Response(JSON.stringify({
        total_found: contacts.length,
        analysis: results
    }), { headers: { 'Content-Type': 'application/json' } });
});
