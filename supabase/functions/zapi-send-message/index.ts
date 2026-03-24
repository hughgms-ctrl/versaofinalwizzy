import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendMessageRequest {
  conversationId: string;
  content: string;
  type?: 'text' | 'image' | 'audio' | 'document';
  mediaUrl?: string;
  quotedMessageId?: string;
  quotedContent?: string;
  quotedSender?: string;
}

// Build UAZAPI URL with token as query parameter
function uazapiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${path}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { conversationId, content, type = 'text', mediaUrl, quotedMessageId, quotedContent, quotedSender } = await req.json() as SendMessageRequest;

    if (!conversationId || !content) {
      return new Response(JSON.stringify({ error: 'conversationId and content are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get conversation with contact info
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`*, contact:contacts(id, phone, name)`)
      .eq('id', conversationId)
      .eq('organization_id', profile.organization_id)
      .single();

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Multi-instance resolution
    let instance = null;
    if (conversation.whatsapp_instance_id) {
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('id', conversation.whatsapp_instance_id)
        .eq('status', 'connected')
        .maybeSingle();
      instance = data;
    }

    if (!instance) {
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .eq('status', 'connected')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      instance = data;
    }

    if (!instance) {
      return new Response(JSON.stringify({ error: 'No connected WhatsApp instance' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const instanceToken = instance.zapi_token;
    const phone = conversation.contact.phone;
    const normalizedPhone = phone.replace(/\D/g, '');

    // Typing/Recording presence via UAZAPI (Fire and forget, no delay)
    try {
      const presenceType = type === 'audio' ? 'recording' : 'composing';
      fetch(uazapiUrl(uazapiBaseUrl, '/message/presence'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': instanceToken
        },
        body: JSON.stringify({
          number: normalizedPhone,
          presence: presenceType,
          delay: 5000
        }),
      });
    } catch (e) {
      console.log('Presence update failed:', e);
    }

    // Look up the zapi_message_id for the quoted message (for WhatsApp reply)
    let zapiQuotedMsgId: string | null = null;
    if (quotedMessageId) {
      const { data: quotedMsg } = await supabase
        .from('messages')
        .select('zapi_message_id')
        .eq('id', quotedMessageId)
        .maybeSingle();
      zapiQuotedMsgId = quotedMsg?.zapi_message_id || null;
      console.log(`Quoted message lookup: id=${quotedMessageId}, zapi_id=${zapiQuotedMsgId}`);
    }

    let endpoint: string;
    let body: Record<string, any>;

    switch (type) {
      case 'text':
        endpoint = uazapiUrl(uazapiBaseUrl, '/send/text');
        body = { number: normalizedPhone, text: content };
        if (zapiQuotedMsgId) body.quotedMessageId = zapiQuotedMsgId;
        break;
      case 'image':
        endpoint = uazapiUrl(uazapiBaseUrl, '/send/media');
        body = { number: normalizedPhone, file: mediaUrl, type: 'image' };
        if (content) body.caption = content;
        if (zapiQuotedMsgId) body.quotedMessageId = zapiQuotedMsgId;
        break;
      case 'audio':
        endpoint = uazapiUrl(uazapiBaseUrl, '/send/media');
        body = { number: normalizedPhone, file: mediaUrl, type: 'audio' };
        if (zapiQuotedMsgId) body.quotedMessageId = zapiQuotedMsgId;
        break;
      case 'document':
        endpoint = uazapiUrl(uazapiBaseUrl, '/send/media');
        body = { number: normalizedPhone, file: mediaUrl, caption: content, type: 'document' };
        if (zapiQuotedMsgId) body.quotedMessageId = zapiQuotedMsgId;
        break;
      default:
        return new Response(JSON.stringify({ error: 'Invalid message type' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    console.log('UAZAPI send URL:', endpoint.replace(instanceToken, '***'));
    console.log('UAZAPI send body:', JSON.stringify(body));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': instanceToken
      },
      body: JSON.stringify(body),
    });

    let uazapiResult: any = null;
    let zapiMsgId: string | null = null;
    let sendFailed = false;
    let sendErrorText = '';

    if (!response.ok) {
      sendErrorText = await response.text();
      console.error('UAZAPI send error (will save to DB anyway):', sendErrorText);
      sendFailed = true;
    } else {
      uazapiResult = await response.json();
      zapiMsgId = uazapiResult.messageId || uazapiResult.id || uazapiResult.ID || uazapiResult.key?.id || null;

      // Manual check since we don't have UNIQUE constraint yet
      if (zapiMsgId) {
        const { data: existing } = await supabase
          .from('messages')
          .select('id')
          .eq('zapi_message_id', zapiMsgId)
          .maybeSingle();
        if (existing) {
          return new Response(JSON.stringify({ success: true, messageId: existing.id, zapiMessageId: zapiMsgId }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // Build metadata with quoted message info and UAZAPI response
    const messageMetadata: Record<string, any> = sendFailed
      ? { send_error: sendErrorText, failed_at: new Date().toISOString() }
      : { uazapi_response: uazapiResult };

    if (quotedMessageId) {
      messageMetadata.quoted_message = {
        id: quotedMessageId,
        content: quotedContent || null,
        sender: quotedSender || null,
      };
    }

    // ALWAYS save message to DB — even on UAZAPI failure — so nothing is lost
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
        zapi_message_id: zapiMsgId,
        metadata: messageMetadata,
        ...(sendFailed ? { failed_at: new Date().toISOString(), error_message: sendErrorText } : {}),
      })
      .select()
      .maybeSingle();

    if (msgError) {
      console.error('Error saving message to DB:', msgError);
    }

    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString(), status: 'open' })
      .eq('id', conversationId);

    if (sendFailed) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to send message via WhatsApp, but message was saved',
        messageId: message?.id || `failed-${Date.now()}`,
        details: sendErrorText,
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      messageId: message?.id || `sent-${Date.now()}`,
      zapiMessageId: zapiMsgId || uazapiResult?.messageId || uazapiResult?.key?.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
