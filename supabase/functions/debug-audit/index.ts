import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const audit: any = {
        instances: [],
        target_contact: null,
        last_messages: [],
        weird_numbers: []
    };

    try {
        // 1. Instances details
        const { data: insts } = await supabase.from('whatsapp_instances').select('*');
        audit.instances = insts || [];

        // 2. Search for user's number
        const userPhone = '5527999209156';
        const { data: contact } = await supabase.from('contacts').select('*').ilike('phone', `%${userPhone.substring(2)}%`);
        audit.target_contact = contact || [];

        if (contact && contact.length > 0) {
            const contactId = contact[0].id;
            const { data: msgs } = await supabase
                .from('messages')
                .select('*, conversation:conversations(whatsapp_instance_id)')
                .order('created_at', { ascending: false })
                .limit(10);

            // Filter messages for this contact's conversations
            const { data: convs } = await supabase.from('conversations').select('id').eq('contact_id', contactId);
            const convIds = convs?.map(c => c.id) || [];

            const { data: contactMsgs } = await supabase
                .from('messages')
                .select('*')
                .in('conversation_id', convIds)
                .order('created_at', { ascending: false })
                .limit(10);
            audit.last_messages = contactMsgs || [];
        }

        // 3. Find more weird numbers
        const { data: weird } = await supabase.from('contacts').select('id, phone, name').or('phone.ilike.5580%,phone.ilike.5540%,phone.ilike.80%,phone.ilike.40%').limit(20);
        audit.weird_numbers = weird || [];

    } catch (e) {
        audit.error = e.message;
    }

    return new Response(JSON.stringify(audit), { headers: { 'Content-Type': 'application/json' } });
});
