import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const token = authHeader.replace(/^Bearer\s+/i, '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized', details: authError?.message }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { action, messageId, content, reaction, instanceId } = await req.json();

        // action: 'find' | 'read' | 'react' | 'delete' | 'edit'

        let instance;
        if (instanceId) {
            const { data } = await supabase.from('whatsapp_instances').select('*').eq('id', instanceId).single();
            instance = data;
        } else {
            const { data: instances } = await supabase.from('whatsapp_instances').select('*').eq('status', 'connected').limit(1);
            instance = instances?.[0];
        }

        if (!instance || !instance.zapi_token) {
            return new Response(JSON.stringify({ error: 'No connected instance' }), {
                status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        let endpoint = '';
        let body: any = { messageId };
        let method = 'POST';

        switch (action) {
            case 'read':
                endpoint = `${uazapiBaseUrl}/message/read`;
                break;
            case 'react':
                endpoint = `${uazapiBaseUrl}/message/react`;
                body.reaction = reaction;
                break;
            case 'delete':
                endpoint = `${uazapiBaseUrl}/message/delete`;
                break;
            case 'edit':
                endpoint = `${uazapiBaseUrl}/message/edit`;
                body.text = content;
                break;
            case 'find':
                endpoint = `${uazapiBaseUrl}/message/find/${messageId}`;
                method = 'GET';
                body = null;
                break;
            default:
                return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
        }

        const response = await fetch(endpoint, {
            method,
            headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
            body: body ? JSON.stringify(body) : null,
        });

        const result = await response.json();

        return new Response(JSON.stringify({ success: response.ok, data: result }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
});
