import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { queryText } = await req.json();

        const { data: messages, error } = await supabase
            .from('messages')
            .select('conversation_id, zapi_message_id, conversations(whatsapp_instance_id, contact_id, contacts(phone))')
            .ilike('content', `%${queryText}%`);

        if (error) return new Response(JSON.stringify({ error }), { status: 500 });

        const stats = {
            totalMessages: messages?.length || 0,
            uniqueConversations: new Set(messages?.map(m => m.conversation_id)).size,
            uniqueZapiIds: new Set(messages?.map(m => m.zapi_message_id)).size,
            samples: messages?.slice(0, 10)
        };

        return new Response(JSON.stringify(stats), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
});
