import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendMessageRequest {
  conversationId: string;
  content: string;
  type?: 'text' | 'image' | 'audio' | 'document' | 'ptt';
  mediaUrl?: string;
}

// Ensure phone has country code (default Brazil 55)
function ensureCountryCode(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length >= 12) return clean;
  if (clean.length >= 10 && clean.length <= 11) return `55${clean}`;
  return clean;
}

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

    const { conversationId, content, type = 'text', mediaUrl } = await req.json() as SendMessageRequest;

    if (!conversationId || (!content && type === 'text')) {
      return new Response(JSON.stringify({ error: 'conversationId and content are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles').select('organization_id')
      .eq('user_id', user.id).single();
    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`*, contact:contacts(id, phone, name)`)
      .eq('id', conversationId)
      .eq('organization_id', profile.organization_id)
      .single();

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve WhatsApp instance
    let instance = null;
    if (conversation.whatsapp_instance_id) {
      const { data } = await supabase
        .from('whatsapp_instances').select('*')
        .eq('id', conversation.whatsapp_instance_id)
        .eq('status', 'connected').maybeSingle();
      instance = data;
    }
    if (!instance) {
      const { data } = await supabase
        .from('whatsapp_instances').select('*')
        .eq('organization_id', profile.organization_id)
        .eq('status', 'connected')
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      instance = data;
    }
    if (!instance) {
      return new Response(JSON.stringify({ error: 'No connected WhatsApp instance' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const instanceToken = instance.zapi_token;
    const phone = conversation.contact.phone;
    const normalizedPhone = ensureCountryCode(phone);

    let endpoint: string;
    let body: Record<string, any>;

    switch (type) {
      case 'text':
        endpoint = `${uazapiBaseUrl}/send/text`;
        body = { number: normalizedPhone, text: content, delay: 2 };
        break;
      case 'image':
        endpoint = `${uazapiBaseUrl}/send/media`;
        body = { number: normalizedPhone, file: mediaUrl, text: content || '', type: 'image', delay: 2 };
        break;
      case 'audio':
        endpoint = `${uazapiBaseUrl}/send/media`;
        body = { number: normalizedPhone, file: mediaUrl, type: 'audio', delay: 2 };
        break;
      case 'ptt':
        endpoint = `${uazapiBaseUrl}/send/media`;
        body = { number: normalizedPhone, file: mediaUrl, type: 'ptt', delay: 2 };
        break;
      case 'document':
        endpoint = `${uazapiBaseUrl}/send/media`;
        body = { number: normalizedPhone, file: mediaUrl, text: content || '', type: 'document', delay: 2 };
        break;
      default:
        return new Response(JSON.stringify({ error: 'Invalid message type' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    console.log('UAZAPI send:', type, 'to', normalizedPhone);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': instanceToken },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('UAZAPI send error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to send message', details: errorText }), {
        status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const uazapiResult = await response.json();

    const { data: message, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content,
        type,
        direction: 'outbound',
        is_from_bot: false,
        sent_by: user.id,
        media_url: mediaUrl || null,
        zapi_message_id: uazapiResult.messageId || uazapiResult.key?.id || null,
        metadata: { uazapi_response: uazapiResult },
      })
      .select().single();

    if (msgError) {
      console.error('Error saving message:', msgError);
      return new Response(JSON.stringify({ error: 'Message sent but failed to save' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), status: 'open' })
      .eq('id', conversationId);

    return new Response(JSON.stringify({
      success: true,
      messageId: message.id,
      zapiMessageId: uazapiResult.messageId || uazapiResult.key?.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
