import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getProviderConfig, sendWhatsAppMessage, sendPresence } from '../_shared/whatsappProvider.ts';

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

function normalizeReplyMessageId(messageId: string | null | undefined): string | null {
  if (!messageId) return null;
  const trimmed = messageId.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':');
  if (parts.length > 1) {
    return parts[parts.length - 1] || trimmed;
  }

  return trimmed;
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

    // Look up the zapi_message_id for the quoted message (for WhatsApp reply)
    let zapiQuotedMsgId: string | null = null;
    if (quotedMessageId) {
      const { data: quotedMsg } = await supabase
        .from('messages')
        .select('zapi_message_id')
        .eq('id', quotedMessageId)
        .maybeSingle();
      zapiQuotedMsgId = normalizeReplyMessageId(quotedMsg?.zapi_message_id);
      console.log(`Quoted message lookup: id=${quotedMessageId}, raw_zapi_id=${quotedMsg?.zapi_message_id || null}, reply_id=${zapiQuotedMsgId}`);
    }

    const providerConfig = getProviderConfig();

    // Presence (fire and forget)
    sendPresence(
      normalizedPhone,
      type === 'audio' ? 'recording' : 'composing',
      providerConfig,
      instanceToken,
      instance.zapi_instance_id
    );

    // Enviar mensagem
    const sendResponse = await sendWhatsAppMessage({
      instanceToken,
      instanceName: instance.zapi_instance_id,
      phone: normalizedPhone,
      type,
      content,
      mediaUrl,
      quotedMsgId: zapiQuotedMsgId || undefined,
    }, providerConfig);

    if (!sendResponse.ok) {
      const errText = await sendResponse.text();
      console.error('Send error:', sendResponse.status, errText);
      if (sendResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Limite de requisições. Tente novamente.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Erro ao enviar mensagem' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const providerResult = await sendResponse.json();
    const zapiMsgId = providerResult.messageId || providerResult.id || providerResult.ID || providerResult.key?.id || null;

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

    // Build metadata with quoted message info and provider response
    const messageMetadata: Record<string, any> = { provider_response: providerResult };

    if (quotedMessageId) {
      messageMetadata.quoted_message = {
        id: quotedMessageId,
        content: quotedContent || null,
        sender: quotedSender || null,
      };
    }

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

    return new Response(JSON.stringify({
      success: true,
      messageId: message?.id || `sent-${Date.now()}`,
      zapiMessageId: zapiMsgId || providerResult?.messageId || providerResult?.key?.id,
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
