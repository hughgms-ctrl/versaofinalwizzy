import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUserOrganizationIds } from '../_shared/access.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeTimestamp(value: number | undefined): string {
  if (!value) return new Date().toISOString();
  const MIN_TIMESTAMP = 946684800;
  const MAX_TIMESTAMP = 4102444800;
  let timestampSeconds = value;
  if (value > MAX_TIMESTAMP * 1000) return new Date().toISOString();
  else if (value > MAX_TIMESTAMP) timestampSeconds = Math.floor(value / 1000);
  if (timestampSeconds < MIN_TIMESTAMP || timestampSeconds > MAX_TIMESTAMP) return new Date().toISOString();
  return new Date(timestampSeconds * 1000).toISOString();
}

function extractMessageContent(msg: any): { type: string; content: string | null; mediaUrl: string | null } {
  if (msg.message?.conversation || msg.message?.extendedTextMessage) {
    return { type: 'text', content: msg.message.conversation || msg.message.extendedTextMessage?.text || null, mediaUrl: null };
  }
  if (msg.text) {
    return { type: 'text', content: typeof msg.text === 'string' ? msg.text : msg.text.message, mediaUrl: null };
  }
  if (msg.message?.imageMessage || msg.image) {
    const img = msg.message?.imageMessage || msg.image;
    return { type: 'image', content: img.caption || null, mediaUrl: img.url || img.imageUrl || null };
  }
  if (msg.message?.audioMessage || msg.audio) {
    const aud = msg.message?.audioMessage || msg.audio;
    return { type: 'audio', content: null, mediaUrl: aud.url || aud.audioUrl || null };
  }
  if (msg.message?.videoMessage || msg.video) {
    const vid = msg.message?.videoMessage || msg.video;
    return { type: 'video', content: vid.caption || null, mediaUrl: vid.url || vid.videoUrl || null };
  }
  if (msg.message?.documentMessage || msg.document) {
    const doc = msg.message?.documentMessage || msg.document;
    return { type: 'document', content: doc.title || doc.fileName || null, mediaUrl: doc.url || doc.documentUrl || null };
  }
  if (msg.message?.stickerMessage || msg.sticker) {
    const stk = msg.message?.stickerMessage || msg.sticker;
    return { type: 'sticker', content: null, mediaUrl: stk.url || stk.stickerUrl || null };
  }
  if (msg.message?.locationMessage || msg.location) {
    const loc = msg.message?.locationMessage || msg.location;
    return { type: 'location', content: loc.name || loc.address || `${loc.degreesLatitude || loc.latitude}, ${loc.degreesLongitude || loc.longitude}`, mediaUrl: null };
  }
  return { type: 'text', content: null, mediaUrl: null };
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
    const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { conversationId, lastMessageId, amount = 30 } = await req.json();

    if (!conversationId) {
      return new Response(JSON.stringify({ error: 'conversationId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // IDOR guard: só conversas das orgs de que o caller é membro. Sem isso, qualquer
    // usuário autenticado passava um conversationId de outra org e puxava o histórico dela.
    const orgIds = await getUserOrganizationIds(supabase, user.id);
    if (orgIds.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*, contact:contacts(phone), whatsapp_instance:whatsapp_instances(*)')
      .eq('id', conversationId)
      .in('organization_id', orgIds)
      .single();

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const instance = conversation.whatsapp_instance;
    if (!instance || instance.status !== 'connected') {
      return new Response(JSON.stringify({ error: 'WhatsApp not connected' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const provider = instance.provider === 'evolution' ? 'evolution' : 'uazapi';
    if (provider !== 'uazapi') {
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        provider,
        syncedMessages: 0,
        hasMore: false,
        message: 'Carregamento de mensagens antigas ainda nao implementado para Evolution; evitando chamada UAZAPI indevida.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!instance.zapi_token) {
      return new Response(JSON.stringify({ error: 'WhatsApp not connected' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contactPhone = conversation.contact?.phone;
    if (!contactPhone) {
      return new Response(JSON.stringify({ error: 'Contact phone not found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let paginationMessageId = lastMessageId;
    if (!paginationMessageId) {
      const { data: oldestMsg } = await supabase
        .from('messages').select('zapi_message_id')
        .eq('conversation_id', conversationId)
        .not('zapi_message_id', 'is', null)
        .order('created_at', { ascending: true })
        .limit(1).maybeSingle();
      paginationMessageId = oldestMsg?.zapi_message_id;
    }

    if (!paginationMessageId) {
      return new Response(JSON.stringify({
        success: true, syncedMessages: 0, hasMore: false, message: 'No messages found to paginate from',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // UAZAPI: GET /messages/{phone}?limit=N&before=msgId&token=X
    const url = `${uazapiBaseUrl}/messages/${contactPhone}?limit=${amount}&before=${paginationMessageId}`;
    console.log(`Fetching older messages for conversation ${conversationId} before ${paginationMessageId}...`);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'token': instance.zapi_token }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error fetching older messages from UAZAPI:', errorText);
      return new Response(JSON.stringify({
        success: true, syncedMessages: 0, hasMore: false,
        message: 'Could not load older messages from UAZAPI', details: errorText,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const messagesResponse = await response.json();
    const messages = Array.isArray(messagesResponse) ? messagesResponse : (messagesResponse.messages || []);
    console.log(`Got ${messages.length} older messages from UAZAPI`);

    let syncedCount = 0;
    let skippedCount = 0;

    for (const msg of messages) {
      const msgId = msg.key?.id || msg.messageId || msg.id;
      if (!msgId) { skippedCount++; continue; }

      const { data: existingMsg } = await supabase
        .from('messages').select('id')
        .eq('conversation_id', conversationId)
        .eq('zapi_message_id', msgId)
        .maybeSingle();
      if (existingMsg) { skippedCount++; continue; }

      const { type: messageType, content, mediaUrl } = extractMessageContent(msg);
      if (!content && !mediaUrl) { skippedCount++; continue; }

      const fromMe = msg.key?.fromMe ?? msg.fromMe ?? false;
      const timestamp = msg.messageTimestamp || msg.momment || msg.timestamp;
      const createdAt = normalizeTimestamp(typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp);

      const { error: msgError } = await supabase.from('messages').insert({
        conversation_id: conversationId, content, type: messageType,
        direction: fromMe ? 'outbound' : 'inbound', is_from_bot: false,
        media_url: mediaUrl, zapi_message_id: msgId, created_at: createdAt,
      });

      if (msgError) console.error(`Error inserting message: ${msgError.message}`);
      else syncedCount++;
    }

    if (messages.length > 0) {
      const oldestMsgId = messages[messages.length - 1]?.key?.id || messages[messages.length - 1]?.messageId;
      if (oldestMsgId) {
        await supabase.from('conversations').update({ oldest_synced_message_id: oldestMsgId }).eq('id', conversationId);
      }
    }

    return new Response(JSON.stringify({
      success: true, syncedMessages: syncedCount, skippedMessages: skippedCount,
      totalFromAPI: messages.length, hasMore: messages.length === amount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Load older messages error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
