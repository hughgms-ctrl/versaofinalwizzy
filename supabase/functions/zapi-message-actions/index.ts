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
    const uazapiBaseUrl = (Deno.env.get('UAZAPI_BASE_URL') || '').replace(/\/$/, '');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('user_id', user.id).single();
    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: instance } = await supabase
      .from('whatsapp_instances').select('*')
      .eq('organization_id', profile.organization_id)
      .eq('status', 'connected')
      .order('created_at', { ascending: true }).limit(1).maybeSingle();

    if (!instance) {
      return new Response(JSON.stringify({ error: 'No connected instance' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, ...params } = await req.json();
    const instanceToken = instance.zapi_token;
    let endpoint: string;
    let body: Record<string, any>;

    switch (action) {
      case 'find': {
        // Find messages: POST /message/find
        const chatId = params.number ? `${params.number}@s.whatsapp.net` : params.chatid;
        endpoint = `${uazapiBaseUrl}/message/find`;
        body = { chatid: chatId, limit: params.limit || 20 };
        break;
      }
      case 'read': {
        // Mark as read: POST /message/read
        endpoint = `${uazapiBaseUrl}/message/read`;
        body = { number: params.number };
        break;
      }
      case 'react': {
        // React to message: POST /message/react
        endpoint = `${uazapiBaseUrl}/message/react`;
        body = { id: params.messageId, emoji: params.emoji };
        break;
      }
      case 'delete': {
        // Delete message: POST /message/delete
        endpoint = `${uazapiBaseUrl}/message/delete`;
        body = { id: params.messageId };
        break;
      }
      case 'edit': {
        // Edit message: POST /message/edit
        endpoint = `${uazapiBaseUrl}/message/edit`;
        body = { id: params.messageId, text: params.text };
        break;
      }
      default:
        return new Response(JSON.stringify({ error: 'Invalid action. Use: find, read, react, delete, edit' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': instanceToken },
      body: JSON.stringify(body),
    });

    const result = await resp.json();

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: 'UAZAPI error', details: result }), {
        status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
