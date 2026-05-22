import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decode as decodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';

declare const EdgeRuntime: any;

function runBackground(promise: Promise<any>) {
  if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
    EdgeRuntime.waitUntil(promise);
  } else {
    promise.catch(err => console.error('Background task error:', err));
  }
}

// 8 seconds debounce window — coalesces fragmented inbound messages so AI sees one input.
const AI_DEBOUNCE_MS = 8000;

/**
 * Schedule (or reschedule) an orchestrator trigger after a debounce window.
 * Each call writes a new token to conversations.metadata.pending_ai_trigger.
 * After the wait, we reread the conversation; if our token still matches, we proceed,
 * concatenating the inbound messages received during the window. Otherwise we abort
 * (a newer message took over).
 */
function scheduleDebouncedOrchestrator(
  supabase: any,
  conversationId: string,
  serviceRoleKey: string,
  orchestratorBody: Record<string, unknown>,
  initialMessageContent: string,
) {
  const token = crypto.randomUUID();
  const scheduledFor = new Date(Date.now() + AI_DEBOUNCE_MS).toISOString();

  const task = (async () => {
    try {
      // 1. Tag conversation with our pending trigger token
      const { data: convNow } = await supabase
        .from('conversations')
        .select('metadata')
        .eq('id', conversationId)
        .single();
      const meta = { ...(convNow?.metadata || {}) };
      meta.pending_ai_trigger = { token, scheduled_for: scheduledFor };
      await supabase.from('conversations').update({ metadata: meta }).eq('id', conversationId);

      // 2. Wait the debounce window
      await new Promise(r => setTimeout(r, AI_DEBOUNCE_MS));

      // 3. Reread — only proceed if we are still the most recent trigger
      const { data: convAfter } = await supabase
        .from('conversations')
        .select('metadata, last_message_at')
        .eq('id', conversationId)
        .single();
      const currentToken = convAfter?.metadata?.pending_ai_trigger?.token;
      if (currentToken !== token) {
        console.log(`[DEBOUNCE] Token mismatch for conv ${conversationId} — newer trigger took over, skipping`);
        return;
      }

      // 4. Aggregate recent inbound messages (within window + small buffer)
      const sinceIso = new Date(Date.now() - AI_DEBOUNCE_MS - 5000).toISOString();
      const { data: recentMsgs } = await supabase
        .from('messages')
        .select('content, created_at, direction')
        .eq('conversation_id', conversationId)
        .eq('direction', 'inbound')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: true });

      const combined = (recentMsgs || [])
        .map((m: any) => (m.content || '').trim())
        .filter(Boolean)
        .join('\n');
      const finalContent = combined || initialMessageContent || '[mídia]';

      // 5. Clear the pending trigger marker
      const cleanedMeta = { ...(convAfter?.metadata || {}) };
      delete cleanedMeta.pending_ai_trigger;
      await supabase.from('conversations').update({ metadata: cleanedMeta }).eq('id', conversationId);

      // 6. Fire the orchestrator
      const finalBody = { ...orchestratorBody, messageContent: finalContent };
      console.log(`[DEBOUNCE] Firing orchestrator for ${conversationId} with ${(recentMsgs || []).length} aggregated msgs`);
      await fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/agent-orchestrator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
        body: JSON.stringify(finalBody),
      });
    } catch (e) {
      console.error(`[DEBOUNCE] Error in scheduled orchestrator for ${conversationId}:`, e);
    }
  })();

  runBackground(task);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Ensure phone has country code (default Brazil 55)
function ensureCountryCode(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length >= 12) return clean;
  if (clean.length >= 10 && clean.length <= 11) return `55${clean}`;
  return '';
}

// List of valid Brazilian DDDs
const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99
]);

function isValidPhoneNumber(phone: string): boolean {
  if (!phone) return false;
  const clean = phone.replace(/\D/g, '');

  if (clean.startsWith('55')) {
    if (clean.length < 12 || clean.length > 15) return false;
    const ddd = parseInt(clean.substring(2, 4), 10);
    if (!VALID_DDDS.has(ddd)) return false;
  } else {
    if (clean.length < 10 || clean.length > 13) return false;
    const ddd = parseInt(clean.substring(0, 2), 10);
    if (!VALID_DDDS.has(ddd)) return false;
  }
  return true;
}

function cleanPhone(raw: string): string {
  if (!raw) return '';
  const stripped = raw.replace(/@.*$/, '').replace(/[:\s\-\+\(\)]/g, '').replace(/\D/g, '');
  const preserved = withCountryCode(stripped);
  if (preserved && isValidPhoneNumber(preserved)) return preserved;
  const candidates = uniquePhones([ensureCountryCode(stripped), ...phoneVariants(stripped)]);
  return candidates.find(isValidPhoneNumber) || preserved || stripped || '';
}

function uniquePhones(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => !!value && value.length >= 8)));
}

function withCountryCode(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (!clean) return '';
  if (clean.startsWith('55')) return clean;
  if (clean.length >= 10 && clean.length <= 11) return `55${clean}`;
  return clean;
}

function withoutCountryCode(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  return clean.startsWith('55') ? clean.slice(2) : clean;
}

function phoneVariants(raw: string): string[] {
  const clean = raw.replace(/@.*$/, '').replace(/\D/g, '');
  if (!clean) return [];

  const variants = new Set<string>();
  const add = (value: string) => {
    if (!value) return;
    variants.add(value);
    const with55 = withCountryCode(value);
    if (with55) variants.add(with55);
    const no55 = withoutCountryCode(value);
    if (no55) variants.add(no55);
  };

  add(clean);

  const local = withoutCountryCode(clean);
  if (local.length === 10) {
    // DDD + 8 digits -> possible mobile form with 9 after DDD
    add(`${local.slice(0, 2)}9${local.slice(2)}`);
  }
  if (local.length === 11 && local[2] === '9') {
    // DDD + 9 + 8 digits -> legacy form without 9
    add(`${local.slice(0, 2)}${local.slice(3)}`);
  }

  return uniquePhones(Array.from(variants));
}

function canonicalPhone(raw: string): string {
  const clean = raw.replace(/@.*$/, '').replace(/\D/g, '');
  if (!clean) return '';
  const preserved = withCountryCode(clean);
  return preserved || clean;
}

function isGroupChat(chatid: string): boolean {
  return chatid?.includes('@g.us') || chatid?.includes('@broadcast') || false;
}

// ── RATE LIMITING for webhook ──
const webhookRateStore = new Map<string, { count: number; resetAt: number }>()
const WEBHOOK_RATE_LIMIT = 300 // per minute per IP
const WEBHOOK_WINDOW_MS = 60_000

function checkWebhookRate(ip: string): boolean {
  const now = Date.now()
  const entry = webhookRateStore.get(ip)
  if (!entry || now > entry.resetAt) {
    webhookRateStore.set(ip, { count: 1, resetAt: now + WEBHOOK_WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= WEBHOOK_RATE_LIMIT
}

// ── AI PAUSE CHECK ──
function isAIPaused(metadata: any): boolean {
  const pausedUntil = metadata?.ai_paused_until;
  if (!pausedUntil) return false;
  if (pausedUntil === 'permanent') return true;
  // Check if the pause time has expired
  const pauseDate = new Date(pausedUntil);
  if (isNaN(pauseDate.getTime())) return false;
  return Date.now() < pauseDate.getTime();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate monitoring (log-only, never reject to avoid losing messages)
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    if (!checkWebhookRate(clientIP)) {
      console.warn(`[RATE_MONITOR] High webhook volume from IP: ${clientIP.substring(0, 8)}*** — processing normally`);
    }

    // Webhook signature validation (UAZAPI token-based)
    const webhookToken = req.headers.get('x-webhook-token') || req.headers.get('x-api-key') || '';
    const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN') || '';
    // If ZAPI_CLIENT_TOKEN is configured and a token header is present, validate it
    if (zapiClientToken && webhookToken && webhookToken !== zapiClientToken) {
      console.warn('[WEBHOOK_AUTH] Invalid webhook token received');
      return new Response(JSON.stringify({ error: 'Invalid webhook token' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();

    // UAZAPI uses EventType, not type
    console.log('UAZAPI Full Payload:', JSON.stringify(payload, null, 2));

    const eventType = (payload.EventType || payload.eventType || payload.type || payload.event || '').toLowerCase();
    const instanceId = payload.instanceId || '';
    const instanceName = payload.instanceName || payload.userID || payload.instance || '';
    const lookupIdentifier = instanceId || instanceName;

    console.log('=== UAZAPI WEBHOOK ===');
    console.log('EventType:', eventType, '| InstanceId:', instanceId, '| InstanceName:', instanceName);

    // System events to ignore
    if (['connectfailure', 'qr', 'qrtimeout', 'historysync',
      'notification', 'e2e_notification', 'ciphertext', 'revoked', 'protocol'].includes(eventType)) {
      return respond({ success: true, ignored: true, reason: 'system_event' });
    }

    // Handle connection events
    if (eventType === 'connected' || eventType === 'pairsuccess' || eventType === 'connection_update') {
      const connectionState = String(payload.data?.state || payload.state || payload.status || '').toLowerCase();
      if (eventType === 'connection_update' && !['open', 'connected', 'online'].includes(connectionState)) {
        if (['close', 'closed', 'disconnected', 'loggedout'].includes(connectionState) && (instanceId || instanceName)) {
          await supabase
            .from('whatsapp_instances')
            .update({ status: 'disconnected', is_active: false, disconnected_at: new Date().toISOString() })
            .or([
              instanceId ? `zapi_instance_id.eq.${instanceId}` : '',
              instanceName ? `zapi_instance_id.eq.${instanceName}` : '',
              instanceName ? `evolution_instance_name.eq.${instanceName}` : '',
              instanceId ? `evolution_instance_id.eq.${instanceId}` : '',
            ].filter(Boolean).join(','));
        }
        return respond({ success: true, ignored: true, reason: 'connection_not_open', state: connectionState });
      }

      console.log(`[BOOTSTRAP] Instance ${instanceName} connected. Triggering sync...`);

      // Update instance status in background
      const payloadTokenConn = payload.token || '';
      if (instanceId || instanceName || payloadTokenConn) {
        const updateQuery = supabase.from('whatsapp_instances')
          .update({ status: 'connected', is_active: true, connected_at: new Date().toISOString() });
        
        const orFilters = [];
        if (instanceId) orFilters.push(`zapi_instance_id.eq.${instanceId}`);
        if (instanceName) orFilters.push(`zapi_instance_id.eq.${instanceName}`);
        if (instanceName) orFilters.push(`evolution_instance_name.eq.${instanceName}`);
        if (instanceId) orFilters.push(`evolution_instance_id.eq.${instanceId}`);
        if (payloadTokenConn) orFilters.push(`zapi_token.eq.${payloadTokenConn}`);
        
        updateQuery.or(orFilters.join(','))
          .then(({ error }: { error: any }) => {
            if (error) console.error('Error updating instance on connect:', error);
          });
      }

      // Trigger sync functions in background
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const baseUrl = Deno.env.get('SUPABASE_URL')!;

      const syncPromise = fetch(`${baseUrl}/functions/v1/zapi-sync-chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ 
          instanceId: instanceId || instanceName,
          instanceName: instanceName
        }),
      });
      runBackground(syncPromise);

      return respond({ success: true, message: 'connection_handled' });
    }

    // Handle message and media events - catch ALL possible UAZAPI event types for messages/media
    const messageEventTypes = ['messages', 'message', 'media', 'document', 'audio', 'video', 'image', 'sticker', 'location', 'contact', 'ptt', 'messages-upsert', 'messages.upsert', 'messages_upsert', 'send_message'];
    if (messageEventTypes.includes(eventType)) {
      try {
        return await handleMessage(supabase, payload, instanceId, instanceName, eventType);
      } catch (msgError) {
        console.error('[WEBHOOK] handleMessage crashed but returning 200 to prevent retry loop:', msgError);
        return respond({ success: false, error: 'message_handler_error', detail: String(msgError) });
      }
    }

    // Handle read receipts
    if (eventType === 'readreceipt' || eventType === 'ack') {
      return await handleReadReceipt(supabase, payload);
    }

    // Handle presence
    if (eventType === 'presence' || eventType === 'chatpresence' || eventType === 'presence.update' || eventType === 'presences') {
      return await handlePresence(supabase, payload, instanceId, instanceName);
    }

    // Handle call events
    if (eventType.startsWith('call')) {
      return respond({ success: true, ignored: true, reason: 'call_event' });
    }

    // Handle chat updates (UAZAPI sends these too) - extract message from it
    if (eventType === 'chats' || eventType === 'chat') {
      // Chat update events sometimes contain messages
      if (payload.message?.msgid || payload.event?.Info?.ID) {
        try {
          return await handleMessage(supabase, payload, instanceId, instanceName, eventType);
        } catch (msgError) {
          console.error('[WEBHOOK] handleMessage (chat) crashed:', msgError);
          return respond({ success: false, error: 'message_handler_error', detail: String(msgError) });
        }
      }
      return respond({ success: true, ignored: true, reason: 'chat_update' });
    }


    console.log('Ignoring unknown event type:', eventType);
    return respond({ success: true, ignored: true, type: eventType });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function respond(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleMessage(supabase: any, payload: any, instanceId: string, instanceName: string, eventType: string) {
  // Log payload keys for diagnostics (helps identify media field names)
  console.log(`[WEBHOOK handleMessage] Payload keys: ${Object.keys(payload).join(', ')}`);
  if (payload.event) {
    console.log(`[WEBHOOK handleMessage] event keys: ${Object.keys(payload.event).join(', ')}`);
    if (payload.event.Message) {
      console.log(`[WEBHOOK handleMessage] event.Message keys: ${Object.keys(payload.event.Message).join(', ')}`);
    }
  }

  // ==================================================================
  // UAZAPI sends messages in TWO possible formats:
  //   Format A (wuzapi/UAZAPI native):
  //     payload.type = "Message"
  //     payload.event = { Info: { ID, IsFromMe, MessageSource: { Chat } }, Message: { conversation, audioMessage, imageMessage, ... } }
  //     payload.base64, payload.mimeType (for media)
  //   Format B (legacy/alternative):
  //     payload.message = { msgid, fromMe, type, content, chatid, ... }
  //     payload.chat = { phone, wa_chatid, ... }
  // We handle BOTH formats by normalizing into common variables.
  // ==================================================================

  const event = payload.event || {};
  const eventInfo = event.Info || event.info || {};
  const eventMessage = event.Message || event.message || {};
  const evolutionData = payload.data || {};
  const evolutionKey = evolutionData.key || {};
  const evolutionMessage = evolutionData.message || {};
  const msgSource = eventInfo.MessageSource || eventInfo.messageSource || eventInfo;
  const msg = payload.message || {};
  const chat = payload.chat || {};

  // --- Extract phone (JID -> phone) ---
  const chatJid = msgSource.Chat || msgSource.chat || eventInfo.Chat || eventInfo.chat || evolutionKey.remoteJid || '';
  const senderJid = msgSource.Sender || msgSource.sender || eventInfo.Sender || eventInfo.sender || evolutionKey.participant || '';
  const chatid = msg.chatid || chat.wa_chatid || chatJid || '';

  if (isGroupChat(chatid) || chatid.includes('@g.us')) {
    return respond({ success: true, ignored: true, reason: 'group_message' });
  }

  // Skip LID identifiers
  if (chatid.includes('@lid') || senderJid.includes('@lid')) {
    console.log('Skipping @lid message');
    return respond({ success: true, ignored: true, reason: 'lid_message' });
  }

  let phone = '';
  // Try UAZAPI JID format first
  if (chatJid && !chatJid.includes('@lid')) {
    phone = cleanPhone(chatJid.split('@')[0]);
  }
  // Fallback to legacy format
  if (!phone && chat.phone) phone = cleanPhone(chat.phone);
  if (!phone && chatid) phone = cleanPhone(chatid);
  if (!phone && msg.phone) phone = cleanPhone(msg.phone);
  if (!phone && evolutionKey.remoteJid) phone = cleanPhone(evolutionKey.remoteJid);

  if (!phone || !isValidPhoneNumber(phone)) {
    console.log('Skipping invalid phone:', phone, 'chatJid:', chatJid, 'chatid:', chatid);
    return respond({ success: true, ignored: true, reason: 'invalid_phone' });
  }

  // --- Extract fromMe, msgId, pushName ---
  const fromMe = (eventInfo.IsFromMe ?? eventInfo.isFromMe) || msg.fromMe === true || msg.fromMe === 'true' || evolutionKey.fromMe === true;
  const msgId = eventInfo.ID || eventInfo.Id || eventInfo.id || msg.msgid || msg.id || msg.key?.id || evolutionKey.id || '';
  const pushName = eventInfo.PushName || eventInfo.pushName || chat.wa_contactName || chat.name || chat.wa_name || msg.senderName || evolutionData.pushName || '';

  // --- Determine message type and content ---
  let textContent: string | null = null;
  let messageType = 'text';
  let mediaUrl: string | null = null;

  // Check UAZAPI native format first (payload.event.Message sub-objects)
  const conversationText = eventMessage.conversation || eventMessage.Conversation || evolutionMessage.conversation;
  const extendedText = eventMessage.extendedTextMessage || eventMessage.ExtendedTextMessage || evolutionMessage.extendedTextMessage;
  const imageMsg = eventMessage.imageMessage || eventMessage.ImageMessage || evolutionMessage.imageMessage;
  const audioMsg = eventMessage.audioMessage || eventMessage.AudioMessage || evolutionMessage.audioMessage;
  const videoMsg = eventMessage.videoMessage || eventMessage.VideoMessage || evolutionMessage.videoMessage;
  const documentMsg = eventMessage.documentMessage || eventMessage.DocumentMessage || evolutionMessage.documentMessage;
  const stickerMsg = eventMessage.stickerMessage || eventMessage.StickerMessage || evolutionMessage.stickerMessage;
  const locationMsg = eventMessage.locationMessage || eventMessage.LocationMessage || evolutionMessage.locationMessage;
  const contactMsg = eventMessage.contactMessage || eventMessage.ContactMessage || evolutionMessage.contactMessage;

  if (conversationText) {
    messageType = 'text';
    textContent = conversationText;
  } else if (extendedText) {
    messageType = 'text';
    textContent = extendedText.text || extendedText.Text || '';
  } else if (imageMsg) {
    messageType = 'image';
    textContent = imageMsg.caption || imageMsg.Caption || null;
  } else if (audioMsg) {
    messageType = 'audio';
    console.log('[DEBUG] Audio message detected:', JSON.stringify(audioMsg));
  } else if (videoMsg) {
    messageType = 'video';
    textContent = videoMsg.caption || videoMsg.Caption || null;
  } else if (documentMsg) {
    messageType = 'document';
    textContent = documentMsg.fileName || documentMsg.FileName || documentMsg.title || null;
    console.log('[DEBUG] Document message detected:', JSON.stringify(documentMsg));
  } else if (stickerMsg) {
    messageType = 'sticker';
  } else if (locationMsg) {
    messageType = 'location';
    const lat = locationMsg.degreesLatitude || locationMsg.DegreesLatitude || 0;
    const lng = locationMsg.degreesLongitude || locationMsg.DegreesLongitude || 0;
    textContent = locationMsg.name || locationMsg.address || `${lat}, ${lng}`;
  } else if (contactMsg) {
    messageType = 'contact';
    textContent = contactMsg.displayName || contactMsg.DisplayName || '';
  } else if (payload.caption || payload.text || payload.content) {
    // Fallback for media payloads that might have root fields
    textContent = payload.caption || payload.text || (typeof payload.content === 'string' ? payload.content : null);

    const pType = (payload.type || '').toLowerCase();
    if (pType === 'image') messageType = 'image';
    else if (pType === 'audio' || pType === 'ptt') messageType = 'audio';
    else if (pType === 'video') messageType = 'video';
    else if (pType === 'document') messageType = 'document';
  } else {
    // Fallback to legacy format parsing (UAZAPI native format)
    const content = msg.content || {};
    if (typeof content === 'string') {
      textContent = content;
    } else if (content.text) {
      textContent = content.text;
    } else if (msg.text) {
      textContent = typeof msg.text === 'string' ? msg.text : msg.text?.message || null;
    } else if (msg.conversation) {
      textContent = msg.conversation;
    }

    // UAZAPI uses msg.messageType (e.g. "AudioMessage", "ImageMessage") which is more specific
    // than msg.type which is often just "media" for all media types
    const msgTypeRaw = msg.messageType || msg.type || chat.wa_lastMessageType || '';
    const msgType = msgTypeRaw.toLowerCase();

    // Extract media URL from content.URL (UAZAPI puts encrypted WhatsApp URL there)
    // or from msg.mediaUrl / msg.media.url
    const contentMediaUrl = (typeof content === 'object' && content !== null) ? content.URL || content.url : null;
    const legacyMediaUrl = msg.mediaUrl || msg.media?.url || contentMediaUrl || null;

    if (msgType.includes('image')) {
      messageType = 'image';
      mediaUrl = legacyMediaUrl;
      if (!textContent) textContent = content.caption || msg.caption || null;
    } else if (msgType.includes('audio') || msgType.includes('ptt')) {
      messageType = 'audio';
      mediaUrl = legacyMediaUrl;
    } else if (msgType.includes('video')) {
      messageType = 'video';
      mediaUrl = legacyMediaUrl;
      if (!textContent) textContent = content.caption || msg.caption || null;
    } else if (msgType.includes('document')) {
      messageType = 'document';
      mediaUrl = legacyMediaUrl;
      if (!textContent) textContent = content.fileName || content.title || msg.fileName || null;
    } else if (msgType.includes('sticker')) {
      messageType = 'sticker';
      mediaUrl = legacyMediaUrl;
    } else if (msgType.includes('location')) {
      messageType = 'location';
    } else if (msgType.includes('contact')) {
      messageType = 'contact';
    }
  }

  // --- Extract quoted/reply context ---
  // WhatsApp reply messages contain contextInfo with stanzaId (original message ID)
  let quotedMessageMeta: any = null;
  const contextInfo = extendedText?.contextInfo || extendedText?.ContextInfo
    || imageMsg?.contextInfo || imageMsg?.ContextInfo
    || audioMsg?.contextInfo || audioMsg?.ContextInfo
    || videoMsg?.contextInfo || videoMsg?.ContextInfo
    || documentMsg?.contextInfo || documentMsg?.ContextInfo
    || eventMessage?.contextInfo || eventMessage?.ContextInfo
    || null;
  
  if (contextInfo) {
    const stanzaId = contextInfo.stanzaId || contextInfo.StanzaId || contextInfo.quotedMessageId || null;
    const participant = contextInfo.participant || contextInfo.Participant || null;
    const quotedMsg = contextInfo.quotedMessage || contextInfo.QuotedMessage || null;
    
    if (stanzaId) {
      let quotedText = null;
      if (quotedMsg) {
        quotedText = quotedMsg.conversation || quotedMsg.Conversation
          || quotedMsg.extendedTextMessage?.text || quotedMsg.ExtendedTextMessage?.Text
          || quotedMsg.imageMessage?.caption || quotedMsg.ImageMessage?.Caption
          || quotedMsg.videoMessage?.caption || quotedMsg.VideoMessage?.Caption
          || null;
      }
      quotedMessageMeta = {
        zapi_message_id: stanzaId,
        content: quotedText,
        participant: participant,
      };
      console.log(`[WEBHOOK] Quoted message detected: stanzaId=${stanzaId}, text=${quotedText?.substring(0, 50) || 'none'}`);
    }
  }

  // Skip protocol/system messages
  if (eventMessage.protocolMessage || eventMessage.ProtocolMessage) {
    return respond({ success: true, ignored: true, reason: 'protocol_message' });
  }

  // Skip empty text messages (but allow media-only messages)
  // Media messages have messageType != 'text' OR have base64 data
  const hasBase64 = !!(payload.base64 || payload.Base64);
  const isMediaType = ['image', 'audio', 'video', 'document', 'sticker'].includes(messageType);
  if (!textContent && !mediaUrl && !isMediaType && !hasBase64) {
    console.log(`[WEBHOOK] Skipping empty message: type=${messageType}, hasBase64=${hasBase64}, isMediaType=${isMediaType}`);
    return respond({ success: true, ignored: true, reason: 'empty_message' });
  }

  console.log(`[WEBHOOK] Processing message: type=${messageType}, fromMe=${fromMe}, phone=${phone}, hasBase64=${hasBase64}, isMediaType=${isMediaType}, mimeType=${payload.mimeType || payload.MimeType || 'none'}`);

  // Handle media upload (UAZAPI sends media as base64 in the payload)
  // Try multiple field name variations for base64 and mimeType (Evolution v1/v2, Z-API, Wuzapi)
  let base64Data = payload.base64 || payload.Base64 || null;
  if (!base64Data && payload.data?.message?.base64) base64Data = payload.data.message.base64;
  if (!base64Data && payload.message?.base64) base64Data = payload.message.base64;
  if (!base64Data && payload.data?.base64) base64Data = payload.data.base64;
  if (!base64Data && eventMessage?.base64) base64Data = eventMessage.base64;

  let mimeType = payload.mimeType || payload.MimeType || payload.mimetype || null;
  if (!mimeType) mimeType = payload.data?.message?.mimetype || payload.message?.mimetype || payload.data?.mimetype;
  if (!mimeType) mimeType = documentMsg?.mimetype || audioMsg?.mimetype || videoMsg?.mimetype || imageMsg?.mimetype || null;

  let directMediaUrl = payload.mediaUrl || payload.MediaUrl || msg.mediaUrl || msg.media?.url || null;

  // Fetch WhatsApp Instance early for API calls
  // Robust lookup: try zapi_instance_id first, then fallback to zapi_token
  const payloadToken = payload.token || '';
  let whatsappInstance: any = null;
  let instanceError: any = null;

  // Strategy 1: lookup by zapi_instance_id (instanceId or instanceName)
  if (instanceId || instanceName) {
    const orFilters = [];
    if (instanceId) orFilters.push(`zapi_instance_id.eq.${instanceId}`);
    if (instanceName) orFilters.push(`zapi_instance_id.eq.${instanceName}`);
    if (instanceName) orFilters.push(`evolution_instance_name.eq.${instanceName}`);
    if (instanceId) orFilters.push(`evolution_instance_id.eq.${instanceId}`);
    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .or(orFilters.join(','))
      .maybeSingle();
    whatsappInstance = data;
    instanceError = error;
  }

  // Strategy 2: fallback lookup by zapi_token from payload
  if (!whatsappInstance && payloadToken) {
    console.log(`[WEBHOOK] Fallback: looking up instance by token`);
    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('zapi_token', payloadToken)
      .maybeSingle();
    whatsappInstance = data;
    instanceError = error;
  }

  if (instanceError || !whatsappInstance) {
    console.error(`[WEBHOOK] Instance not found for ID: ${instanceId}, Name: ${instanceName}, Token: ${payloadToken ? 'present' : 'absent'}. EventType: ${eventType}`);
    console.log(`[WEBHOOK] Full payload for debug:`, JSON.stringify(payload));
    return respond({ success: false, error: 'instance_not_found', instanceId, instanceName });
  }

  // Fetch missing Base64 directly from UAZAPI if not in payload
  if (!base64Data && isMediaType && whatsappInstance && msgId && (whatsappInstance.provider || 'uazapi') === 'uazapi') {
    try {
      console.log(`[WEBHOOK] Fetching decrypted media via /message/download for ID: ${msgId}...`);
      const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
      // Documentation at https://docs.uazapi.com/endpoint/post/message~download
      const resp = await fetch(`${uazapiBaseUrl}/message/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': whatsappInstance.zapi_token
        },
        body: JSON.stringify({
          id: msgId,
          return_base64: true,
          generate_mp3: true,
          return_link: true
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.base64Data) {
          base64Data = data.base64Data;
          if (!mimeType) mimeType = data.mimetype || null;
          console.log(`[WEBHOOK] Successfully downloaded media: ${base64Data.length} chars, mimeType=${mimeType}`);
        } else if (data && data.fileURL && !base64Data) {
          // If only link is returned but no base64, we can use the link directly
          directMediaUrl = data.fileURL;
          console.log(`[WEBHOOK] Using temporary decrypted URL from API: ${directMediaUrl}`);
        }
      } else {
        const errText = await resp.text();
        console.error(`[WEBHOOK] Failed to download media via API: ${resp.status} ${errText}`);
      }
    } catch (e) {
      console.error('[WEBHOOK] Media Download API exception:', e);
    }
  }

  console.log(`[WEBHOOK] Media check: hasBase64=${!!base64Data} (${base64Data ? base64Data.length + ' chars' : '0'}), mimeType=${mimeType}, directUrl=${!!directMediaUrl}`);

  if (base64Data && mimeType) {
    try {
      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
        'audio/ogg; codecs=opus': 'ogg', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/aac': 'aac',
        'video/mp4': 'mp4', 'video/3gpp': '3gp',
        'application/pdf': 'pdf', 'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/vnd.ms-powerpoint': 'ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
        'text/plain': 'txt',
      };

      // Try to get file extension from multiple sources
      const docFileName = documentMsg?.fileName || documentMsg?.FileName || payload.fileName || '';
      const extFromMap = extMap[mimeType];
      const extFromFileName = docFileName ? docFileName.split('.').pop() : null;
      const ext = extFromMap || extFromFileName || 'bin';

      const safeId = (msgId || String(Date.now())).replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${safeId}.${ext}`;
      const storagePath = `webhook-media/${fileName}`;

      console.log(`[WEBHOOK] Uploading media: path=${storagePath}, mimeType=${mimeType}, base64Length=${base64Data.length}`);

      let pureBase64 = base64Data;
      if (pureBase64.includes('base64,')) {
        pureBase64 = pureBase64.split('base64,')[1];
      }
      // Clean up whitespaces and convert base64url characters
      pureBase64 = pureBase64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
      const padLen = 4 - (pureBase64.length % 4);
      if (padLen < 4 && padLen > 0) pureBase64 += '='.repeat(padLen);

      const binaryData = decodeBase64(pureBase64);

      // Try upload, create bucket if it doesn't exist
      let uploadResult = await supabase.storage
        .from('chat-media')
        .upload(storagePath, binaryData, { contentType: mimeType, upsert: true });

      if (uploadResult.error) {
        console.error('[WEBHOOK] First upload attempt failed:', uploadResult.error.message);

        // If bucket doesn't exist, try to create it
        if (uploadResult.error.message?.includes('not found') || uploadResult.error.message?.includes('Bucket')) {
          console.log('[WEBHOOK] Attempting to create chat-media bucket...');
          await supabase.storage.createBucket('chat-media', { public: true });

          // Retry upload
          uploadResult = await supabase.storage
            .from('chat-media')
            .upload(storagePath, binaryData, { contentType: mimeType, upsert: true });
        }
      }

      if (!uploadResult.error) {
        const { data: publicUrl } = supabase.storage.from('chat-media').getPublicUrl(storagePath);
        mediaUrl = publicUrl?.publicUrl || null;
        console.log(`[WEBHOOK] Media uploaded successfully: ${mediaUrl}`);
      } else {
        console.error('[WEBHOOK] Final upload error:', uploadResult.error);
      }
    } catch (e) {
      console.error('[WEBHOOK] Media upload exception:', e);
    }
  } else if (directMediaUrl) {
    mediaUrl = directMediaUrl;
    console.log(`[WEBHOOK] Using direct media URL: ${mediaUrl}`);
  } else if (isMediaType && !mediaUrl) {
    console.warn(`[WEBHOOK] WARNING: Media message type=${messageType} but no base64 or URL found! Payload keys: ${Object.keys(payload).join(', ')}`);
    // Still save the message so user sees it (even without actual media file)
    if (!textContent) {
      textContent = messageType === 'audio' ? '🎵 Áudio' : messageType === 'document' ? '📄 Documento' : `📎 ${messageType}`;
    }
  }

  const organizationId = whatsappInstance.organization_id;

  // Find or create contact
  // If the message is fromMe, pushName is our own pushName, not the client's.
  // We should pass null so we don't accidentally rename the client's profile.
  const contactNameToSave = fromMe ? null : pushName;
  let contact = await findOrCreateContact(supabase, phone, organizationId, contactNameToSave, chat.imagePreview || chat.image || null);

  // Fetch profile from UAZAPI if no name
  if (!contact.name && phone) {
    try {
      const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
      const resp = await fetch(`${uazapiBaseUrl}/contact/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': whatsappInstance.zapi_token },
        body: JSON.stringify({ number: phone }),
      });
      if (resp.ok) {
        const profileData = await resp.json();
        const profileName = profileData.name || profileData.pushname || profileData.notify;
        const profilePic = profileData.profilePicUrl || profileData.profilePictureUrl || profileData.imgUrl;
        const updateData: any = {};
        if (profileName) updateData.name = profileName;
        if (profilePic) updateData.avatar_url = profilePic;
        if (Object.keys(updateData).length > 0) {
          await supabase.from('contacts').update(updateData).eq('id', contact.id);
          contact = { ...contact, ...updateData };
        }
      }
    } catch (e) {
      console.error('Profile fetch error:', e);
    }
  }

  // Find or create conversation for THIS specific contact
  const conversation = await findOrCreateConversation(supabase, contact.id, organizationId, whatsappInstance.id, whatsappInstance.phone_number);

  // Check for duplicate message (Deduplication)
  if (msgId) {
    const { data: existing } = await supabase
      .from('messages').select('*')
      .eq('zapi_message_id', msgId).maybeSingle();

    if (existing) {
      console.log(`[WEBHOOK] Duplicate message detected (msgId: ${msgId}). Updating status only.`);

      // If it exists, just update timestamps/metadata if needed and skip insert
      if (fromMe) {
        // If it's an eco and we already have it, it's definitely the one we sent.
        return respond({ success: true, duplicate: true });
      }

      // If it's NOT from me (inbound) and we have it, it's also a duplicate.
      return respond({ success: true, duplicate: true });
    }
  }

  // Determine final is_from_bot status
  // For outbound (fromMe) messages:
  //   - If conversation is in IA mode, the orchestrator/flow-execute already saves the message
  //     to the DB with is_from_bot=true. The webhook echo arrives later (race condition).
  //     We must SKIP to avoid duplicates. Wait briefly and re-check dedup.
  //   - If conversation is NOT in IA mode, the message was sent by a human via zapi-send-message
  //     which saves synchronously before the echo. Dedup above should catch it, but as safety:
  let finalIsFromBot = false;
  if (fromMe) {
    if (conversation.service_mode === 'ia') {
      // In IA mode, the AI system (orchestrator/flow-execute) saves its own messages.
      // The webhook echo is just a confirmation — skip it to avoid duplicates.
      // Wait a moment for the orchestrator to finish saving, then re-check dedup.
      await new Promise(r => setTimeout(r, 2000));
      if (msgId) {
        const { data: nowExists } = await supabase
          .from('messages').select('id')
          .eq('zapi_message_id', msgId).maybeSingle();
        if (nowExists) {
          console.log(`[WEBHOOK] IA mode echo dedup (after wait): msgId=${msgId} already saved by orchestrator.`);
          return respond({ success: true, duplicate: true, ia_echo: true });
        }
      }
      // If still not found after wait, it might be a system message not tracked — save as bot
      finalIsFromBot = true;
      console.log(`[WEBHOOK] IA mode outbound not found after wait — saving as bot message.`);
    } else {
      // Not in IA mode — this echo is from a human-sent message.
      // zapi-send-message saves synchronously, so dedup above should have caught it.
      // If we reach here, it means the message wasn't found by zapi_message_id dedup.
      // Check by sent_by as extra safety.
      if (msgId) {
        const { data: existingSentByHuman } = await supabase
          .from('messages')
          .select('id, sent_by')
          .eq('zapi_message_id', msgId)
          .not('sent_by', 'is', null)
          .maybeSingle();
        if (existingSentByHuman) {
          console.log(`[WEBHOOK] Human echo dedup: msgId=${msgId}, sent_by=${existingSentByHuman.sent_by}`);
          return respond({ success: true, duplicate: true, human_sent: true });
        }
      }
      // Not found — save as human outbound (is_from_bot=false)
      finalIsFromBot = false;
    }
  }

  // Build metadata with quoted message info if present
  let messageMetadata: any = null;
  if (quotedMessageMeta) {
    // Try to resolve the quoted message's internal ID by zapi_message_id
    let resolvedQuotedId: string | null = null;
    let resolvedQuotedSender: string | null = null;
    if (quotedMessageMeta.zapi_message_id) {
      const { data: quotedRow } = await supabase
        .from('messages')
        .select('id, direction, content')
        .eq('zapi_message_id', quotedMessageMeta.zapi_message_id)
        .maybeSingle();
      if (quotedRow) {
        resolvedQuotedId = quotedRow.id;
        resolvedQuotedSender = quotedRow.direction === 'inbound' ? (contact.name || phone) : 'Você';
        // Use the stored content if webhook didn't provide it
        if (!quotedMessageMeta.content && quotedRow.content) {
          quotedMessageMeta.content = quotedRow.content;
        }
      }
    }
    messageMetadata = {
      quoted_message: {
        id: resolvedQuotedId || null,
        zapi_message_id: quotedMessageMeta.zapi_message_id,
        content: quotedMessageMeta.content || null,
        sender: resolvedQuotedSender || quotedMessageMeta.participant || null,
      }
    };
  }

  // Insert message into the CORRECT conversation
  const { data: savedMessage, error: messageError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      content: textContent,
      type: messageType,
      direction: fromMe ? 'outbound' : 'inbound',
      is_from_bot: finalIsFromBot,
      media_url: mediaUrl,
      zapi_message_id: msgId || null,
      ...(messageMetadata ? { metadata: messageMetadata } : {}),
    })
    .select().maybeSingle();

  if (messageError) {
    console.error('Error inserting message:', messageError);
    throw messageError;
  }

  // Update conversation timestamps
  const updateData: any = { last_message_at: new Date().toISOString(), status: 'open' };
  if (!fromMe) updateData.unread_count = (conversation.unread_count || 0) + 1;
  await supabase.from('conversations').update(updateData).eq('id', conversation.id);

  console.log(`Message saved: ${msgId} for contact ${phone} in conversation ${conversation.id}`);

  // Auto-transcribe media messages in background (audio, image, video)
  if (savedMessage && mediaUrl && ['audio', 'image', 'video'].includes(messageType)) {
    console.log(`[WEBHOOK] Triggering auto-transcription for ${messageType} message ${savedMessage.id}`);
    const transcribePromise = (async () => {
      try {
        // Get org integration config for AI
        const { data: intConfig } = await supabase
          .from('integration_configs')
          .select('*')
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (!intConfig) {
          console.log('[WEBHOOK] No AI integration config, skipping auto-transcription');
          return;
        }

        // Call transcribe-media with service role key (bypasses user auth)
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const resp = await fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/transcribe-media`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            messageId: savedMessage.id,
            mediaUrl: mediaUrl,
            mediaType: messageType,
            organizationId: organizationId,
          }),
        });
        if (resp.ok) {
          const result = await resp.json();
          console.log(`[WEBHOOK] Auto-transcription result for ${savedMessage.id}: ${result.transcription?.substring(0, 80) || 'empty'}`);
        } else {
          console.log(`[WEBHOOK] Auto-transcription failed: ${resp.status}`);
        }
      } catch (e) {
        console.error('[WEBHOOK] Auto-transcription error:', e);
      }
    })();
    runBackground(transcribePromise);
  }

  // Trigger AI agent or Campaigns if needed
  if (!fromMe) {
    const triggerText = textContent || '';
    console.log(`Checking triggers for message: "${triggerText}" type=${messageType} in org: ${organizationId}`);
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Check for Campaign Triggers (highest priority) - only for text messages with content
    if (triggerText) {
      const campaignTrigger = await checkCampaignTriggers(supabase, organizationId, triggerText);

      if (campaignTrigger) {
        console.log('Campaign trigger matched:', JSON.stringify(campaignTrigger));
        const { flowId: campaignFlowId, campaignId } = campaignTrigger;
        console.log(`[CAMPAIGN TRIGGERED] Starting flow ${campaignFlowId} for conversation ${conversation.id}`);
        // Mark as IA mode
        await supabase.from('conversations').update({ service_mode: 'ia' }).eq('id', conversation.id);

        // Apply campaign workspace if configured
        const { data: campaignFull } = await supabase.from('campaigns').select('workspace_id, start_time, end_time').eq('id', campaignId).single();
        if (campaignFull?.workspace_id) {
          console.log(`[CAMPAIGN] Assigning workspace ${campaignFull.workspace_id} from campaign`);
          await supabase.from('contacts').update({ workspace_id: campaignFull.workspace_id }).eq('id', contact.id);
          await supabase.from('conversations').update({ workspace_id: campaignFull.workspace_id }).eq('id', conversation.id);
        }

        // Increment campaign counter
        await supabase.rpc('increment_campaign_count', { campaign_id: campaignId });

        // Get organization timezone
        const { data: orgData } = await supabase.from('organizations').select('timezone').eq('id', organizationId).single();
        const orgTimezone = orgData?.timezone || 'America/Sao_Paulo';

        // Check if within business hours using org timezone
        const now = new Date();
        const bzTimeStr = new Intl.DateTimeFormat('pt-BR', {
            timeZone: orgTimezone,
            hour: '2-digit', minute: '2-digit', hour12: false
        }).format(now);

        const startT = campaignFull?.start_time || "00:00";
        const endT = campaignFull?.end_time || "23:59";

        let isOutsideHours = false;
        if (startT <= endT) {
            isOutsideHours = bzTimeStr < startT || bzTimeStr > endT;
        } else {
            // Crosses midnight
            isOutsideHours = bzTimeStr < startT && bzTimeStr > endT;
        }

        if (isOutsideHours) {
          console.log(`[CAMPAIGN QUEUED] Outside hours (${bzTimeStr} vs ${startT}-${endT}). Adding to queue.`);
          
          // Calculate when the queue should run (next start time) in UTC
          const [sHour, sMin] = startT.split(':').map(Number);
          const [cHour] = bzTimeStr.split(':').map(Number);
          
          // Get org timezone offset by comparing UTC and local representations
          const localNow = new Date(now.toLocaleString("en-US", { timeZone: orgTimezone }));
          const offsetMs = localNow.getTime() - now.getTime();
          
          // Build the target date in org local time, then convert to UTC
          const localDate = new Date(localNow);
          if (cHour >= sHour) {
              // It's after start hour but outside hours (means it's after end time), schedule for tomorrow
              localDate.setDate(localDate.getDate() + 1);
          }
          localDate.setHours(sHour, sMin, 0, 0);
          
          // Convert local time back to real UTC by subtracting the offset
          const scheduledUTC = new Date(localDate.getTime() - offsetMs);
          
          console.log(`[CAMPAIGN QUEUED] Scheduled for ${scheduledUTC.toISOString()} (${startT} ${orgTimezone})`);

          await supabase.from('campaign_queue').insert({
            organization_id: organizationId,
            campaign_id: campaignId,
            conversation_id: conversation.id,
            contact_id: contact.id,
            message_content: triggerText,
            scheduled_for: scheduledUTC.toISOString(),
            status: 'pending'
          });
          return respond({ success: true, messageId: savedMessage.id, queued: true });
        }

        console.log(`[WEBHOOK] Invoking flow-execute for campaign ${campaignId}, flow ${campaignFlowId}`);
        // Call flow execution engine — await to ensure it starts (don't fire-and-forget)
        const flowExecPromise = (async () => {
          try {
            const resp = await fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/flow-execute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
              body: JSON.stringify({ 
                flowId: campaignFlowId, 
                conversationId: conversation.id,
                triggerMessage: triggerText || '[mídia]'
              }),
            });
            if (!resp.ok) {
              const errText = await resp.text();
              console.error(`[WEBHOOK] flow-execute failed for campaign ${campaignId}: ${resp.status} ${errText}`);
            } else {
              console.log(`[WEBHOOK] flow-execute started successfully for campaign ${campaignId}`);
            }
          } catch (err) {
            console.error(`[WEBHOOK] flow-execute fetch error for campaign ${campaignId}:`, err);
          }
        })();
        runBackground(flowExecPromise);

        return respond({ success: true, messageId: savedMessage.id, triggeredCampaign: true });
      }
    }

    // 2. Check for active flow execution
    const { data: activeFlowExec } = await supabase
      .from('flow_executions')
      .select('id, status, current_node_id, flow_id, variables, flow:flows(nodes, edges, master_prompt, is_master_active, name)')
      .eq('conversation_id', conversation.id)
      .in('status', ['running', 'waiting_input'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeFlowExec) {
      console.log(`[WEBHOOK] Active flow execution ${activeFlowExec.id} (status=${activeFlowExec.status}, node=${activeFlowExec.current_node_id})`);

      // Check if the flow is paused at an ai-handoff node
      const flowNodes = (activeFlowExec.flow?.nodes || []) as any[];
      const currentNode = flowNodes.find((n: any) => n.id === activeFlowExec.current_node_id);
      const isAtAIHandoff = currentNode?.type === 'ai-handoff';
      const isAtContentBlockWaiting = currentNode?.type === 'content-block' && currentNode.data?.waitForResponse;
      const isAtActionFlow = currentNode?.type === 'action-flow' && (currentNode.data?.waitForResponse || (currentNode.data?.remarketingSteps as any[])?.length > 0);
      const isAtMessageButtons = currentNode?.type === 'message-buttons';
      const isAtMessageList = currentNode?.type === 'message-list';

      if (isAtAIHandoff && activeFlowExec.status === 'waiting_input') {
        // Check if AI is paused by the human agent
        if (isAIPaused(conversation.metadata)) {
          console.log(`[WEBHOOK] AI is PAUSED for conversation ${conversation.id} — skipping orchestrator`);
        } else {
        console.log(`[WEBHOOK] Flow paused at ai-handoff node — routing message to agent-orchestrator`);

        // Get the ai_handoff_context from conversation metadata
        const convMetadata = conversation.metadata || {};
        const handoffContext = convMetadata.ai_handoff_context || {};

        const orchestratorBody: Record<string, unknown> = {
          conversationId: conversation.id,
          messageContent: triggerText || '[mídia]',
          messageId: savedMessage.id, // Pass messageId for hydration/transcription sync
          flowExecutionId: activeFlowExec.id, // So orchestrator can advance the flow
        };

        // Pass master prompt override from flow context
        if (handoffContext.masterPromptOverride) {
          orchestratorBody.masterPromptOverride = handoffContext.masterPromptOverride;
        }
        if (handoffContext.additionalContext) {
          orchestratorBody.additionalContext = handoffContext.additionalContext;
        }

        scheduleDebouncedOrchestrator(supabase, conversation.id, serviceRoleKey, orchestratorBody, triggerText || '[mídia]');
        } // end else (not paused)
      } else if (isAtActionFlow && activeFlowExec.status === 'waiting_input') {
        // action-flow node waiting for response — user responded! Route via 'responded' handle
        console.log(`[WEBHOOK] action-flow waiting_input — user responded! Routing via 'responded' handle`);

        const flowEdges = (activeFlowExec.flow?.edges || []) as any[];
        const respondedEdge = flowEdges.find((e: any) => e.source === activeFlowExec.current_node_id && e.sourceHandle === 'responded');
        const fallbackEdge = flowEdges.find((e: any) => e.source === activeFlowExec.current_node_id && !e.sourceHandle);
        const respondedTarget = respondedEdge?.target || fallbackEdge?.target || null;

        console.log(`[WEBHOOK] action-flow responded edge target: ${respondedTarget}`);

        if (respondedTarget) {
          // Clear timeout and remarketing, advance to responded node
          await supabase.from('flow_executions').update({
            status: 'running',
            current_node_id: respondedTarget,
            timeout_at: null,
            remarketing_step: 0,
          }).eq('id', activeFlowExec.id);

          const resumePromise = fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/flow-execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
            body: JSON.stringify({
              flowId: activeFlowExec.flow_id,
              conversationId: conversation.id,
              startNodeId: respondedTarget,
              triggerMessage: triggerText || '[mídia]',
            }),
          });
          runBackground(resumePromise);
        } else {
          // No responded edge — flow STOPS here. Complete and cleanup.
          console.log(`[WEBHOOK] action-flow has NO responded edge — flow STOPS`);
          await supabase.from('flow_executions').update({
            status: 'completed',
            timeout_at: null,
            completed_at: new Date().toISOString(),
          }).eq('id', activeFlowExec.id);

          // Cleanup: reset service_mode and ai_agent_id
          const { data: convMeta } = await supabase.from('conversations').select('metadata').eq('id', conversation.id).single();
          const cleanMeta = { ...(convMeta?.metadata || {}) };
          delete cleanMeta.ai_handoff_context;
          cleanMeta.flow_ended_at = new Date().toISOString();
          await supabase.from('conversations').update({
            service_mode: 'humano', ai_agent_id: null, metadata: cleanMeta,
          }).eq('id', conversation.id);
        }
      } else if (isAtContentBlockWaiting && activeFlowExec.status === 'waiting_input') {
        // Content block is waiting for user response — save variable and resume flow via 'responded' handle
        console.log(`[WEBHOOK] Content block waiting_input — saving response and resuming flow`);
        
        // Save the response to flow variables
        const existingVars = (activeFlowExec as any).variables || {};
        const saveVariable = currentNode.data?.saveVariable;
        if (saveVariable && triggerText) {
          existingVars[saveVariable] = triggerText;
        }

        // Find the 'responded' edge from this content-block node
        const flowEdges = (activeFlowExec.flow?.edges || []) as any[];
        const respondedEdge = flowEdges.find((e: any) => e.source === activeFlowExec.current_node_id && e.sourceHandle === 'responded');
        const nextEdge = respondedEdge || flowEdges.find((e: any) => e.source === activeFlowExec.current_node_id);
        const nextNodeId = nextEdge?.target || null;

        if (nextNodeId) {
          await supabase.from('flow_executions').update({
            status: 'running',
            current_node_id: nextNodeId,
            variables: existingVars,
            timeout_at: null,
            remarketing_step: 0,
          }).eq('id', activeFlowExec.id);

          const resumePromise = fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/flow-execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
            body: JSON.stringify({
              flowId: activeFlowExec.flow_id,
              conversationId: conversation.id,
              startNodeId: nextNodeId,
              triggerMessage: triggerText || '[mídia]',
            }),
          });
          runBackground(resumePromise);
        } else {
          // No next node — flow STOPS here. Complete and cleanup.
          console.log(`[WEBHOOK] Content block has NO outgoing edge — flow STOPS`);
          await supabase.from('flow_executions').update({
            status: 'completed',
            variables: existingVars,
            completed_at: new Date().toISOString(),
            timeout_at: null,
            remarketing_step: 0,
          }).eq('id', activeFlowExec.id);

          // Cleanup: reset service_mode and ai_agent_id
          const { data: convMeta2 } = await supabase.from('conversations').select('metadata').eq('id', conversation.id).single();
          const cleanMeta2 = { ...(convMeta2?.metadata || {}) };
          delete cleanMeta2.ai_handoff_context;
          cleanMeta2.flow_ended_at = new Date().toISOString();
          await supabase.from('conversations').update({
            service_mode: 'humano', ai_agent_id: null, metadata: cleanMeta2,
          }).eq('id', conversation.id);
        }
      } else if ((isAtMessageButtons || isAtMessageList) && activeFlowExec.status === 'waiting_input') {
        // Message buttons/list waiting for user choice — match response to specific option handle
        console.log(`[WEBHOOK] ${currentNode.type} waiting_input — matching user response to option`);
        
        const flowEdges = (activeFlowExec.flow?.edges || []) as any[];
        const userResponse = (triggerText || '').trim().toLowerCase();
        let matchedHandle: string | null = null;

        if (isAtMessageButtons) {
          const buttons = (currentNode.data?.buttons || []) as Array<{ id: string; label: string }>;
          // Match by: exact label, button number (1, 2, 3), or partial match
          for (let i = 0; i < buttons.length; i++) {
            const btnLabel = buttons[i].label.toLowerCase();
            const btnNumber = String(i + 1);
            if (userResponse === btnLabel || userResponse === btnNumber || userResponse.includes(btnLabel) || btnLabel.includes(userResponse)) {
              matchedHandle = `btn_${i}`;
              console.log(`[WEBHOOK] Matched button ${i}: "${buttons[i].label}" (handle: ${matchedHandle})`);
              break;
            }
          }
        } else {
          // List: match rows
          const sections = (currentNode.data?.sections || []) as Array<{ title: string; rows: Array<{ id: string; title: string }> }>;
          let rowIndex = 0;
          for (const section of sections) {
            for (const row of section.rows || []) {
              const rowTitle = row.title.toLowerCase();
              if (userResponse === rowTitle || userResponse.includes(rowTitle) || rowTitle.includes(userResponse)) {
                matchedHandle = `row_${rowIndex}`;
                console.log(`[WEBHOOK] Matched list row ${rowIndex}: "${row.title}" (handle: ${matchedHandle})`);
                break;
              }
              rowIndex++;
            }
            if (matchedHandle) break;
          }
        }

        // Find the target edge: specific handle match > 'responded' fallback > any edge
        let targetEdge = matchedHandle ? flowEdges.find((e: any) => e.source === activeFlowExec.current_node_id && e.sourceHandle === matchedHandle) : null;
        if (!targetEdge) {
          // Fallback: try 'responded' handle or any edge without specific handle
          targetEdge = flowEdges.find((e: any) => e.source === activeFlowExec.current_node_id && e.sourceHandle === 'responded');
        }
        if (!targetEdge) {
          targetEdge = flowEdges.find((e: any) => e.source === activeFlowExec.current_node_id && !e.sourceHandle);
        }
        const nextNodeId = targetEdge?.target || null;

        console.log(`[WEBHOOK] ${currentNode.type}: matchedHandle=${matchedHandle}, nextNodeId=${nextNodeId}`);

        if (nextNodeId) {
          const existingVars = (activeFlowExec as any).variables || {};
          existingVars._lastChoice = triggerText || '';
          existingVars._lastChoiceHandle = matchedHandle || 'none';

          await supabase.from('flow_executions').update({
            status: 'running',
            current_node_id: nextNodeId,
            variables: existingVars,
            timeout_at: null,
            remarketing_step: 0,
          }).eq('id', activeFlowExec.id);

          const resumePromise = fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/flow-execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
            body: JSON.stringify({
              flowId: activeFlowExec.flow_id,
              conversationId: conversation.id,
              startNodeId: nextNodeId,
              triggerMessage: triggerText || '[mídia]',
            }),
          });
          runBackground(resumePromise);
        } else {
          // No matching edge — flow STOPS
          console.log(`[WEBHOOK] ${currentNode.type} has NO matching edge — flow STOPS`);
          await supabase.from('flow_executions').update({
            status: 'completed',
            timeout_at: null,
            completed_at: new Date().toISOString(),
          }).eq('id', activeFlowExec.id);

          const { data: convMetaBtn } = await supabase.from('conversations').select('metadata').eq('id', conversation.id).single();
          const cleanMetaBtn = { ...(convMetaBtn?.metadata || {}) };
          delete cleanMetaBtn.ai_handoff_context;
          cleanMetaBtn.flow_ended_at = new Date().toISOString();
          await supabase.from('conversations').update({
            service_mode: 'humano', ai_agent_id: null, metadata: cleanMetaBtn,
          }).eq('id', conversation.id);
        }
      } else if (activeFlowExec.status === 'waiting_input') {
        // Flow is waiting for input at a non-AI node (e.g., user-input)
        // First check if this node has any outgoing edge — if not, flow stops
        const flowEdgesGeneric = (activeFlowExec.flow?.edges || []) as any[];
        const hasOutgoingEdge = flowEdgesGeneric.some((e: any) => e.source === activeFlowExec.current_node_id);

        if (!hasOutgoingEdge) {
          console.log(`[WEBHOOK] Node ${activeFlowExec.current_node_id} has NO outgoing edge — flow STOPS`);
          await supabase.from('flow_executions').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            timeout_at: null,
            remarketing_step: 0,
          }).eq('id', activeFlowExec.id);

          const { data: convMeta3 } = await supabase.from('conversations').select('metadata').eq('id', conversation.id).single();
          const cleanMeta3 = { ...(convMeta3?.metadata || {}) };
          delete cleanMeta3.ai_handoff_context;
          cleanMeta3.flow_ended_at = new Date().toISOString();
          await supabase.from('conversations').update({
            service_mode: 'humano', ai_agent_id: null, metadata: cleanMeta3,
          }).eq('id', conversation.id);
        } else {
          console.log(`[WEBHOOK] Flow waiting_input at node ${activeFlowExec.current_node_id} — resuming flow execution`);
          const resumePromise = fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/flow-execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
            body: JSON.stringify({
              flowId: activeFlowExec.flow_id,
              conversationId: conversation.id,
              startNodeId: activeFlowExec.current_node_id,
              triggerMessage: triggerText || '[mídia]',
            }),
          });
          runBackground(resumePromise);
        }
      } else {
        console.log(`[WEBHOOK] Flow is running — skipping independent agent trigger`);
      }
    } else {
      // 3. No active flow — Check for Master Prompt / AI routing
      // Also check if service_mode is 'ia' but flow just ended — if so, the service_mode
      // might be stale from a previous flow that didn't clean up properly
      let shouldTrigger = false;
      
      if (conversation.service_mode === 'ia') {
        // Double-check: if there's a flow_ended_at flag, the 'ia' mode might be stale
        const flowEndedAt = conversation.metadata?.flow_ended_at;
        if (flowEndedAt) {
          const elapsedMs = Date.now() - new Date(flowEndedAt).getTime();
          if (elapsedMs < 60000) {
            console.log(`[WEBHOOK] service_mode=ia but flow ended ${Math.round(elapsedMs/1000)}s ago — NOT triggering agent`);
            // Force reset to humano since it's stale
            await supabase.from('conversations').update({ service_mode: 'humano', ai_agent_id: null }).eq('id', conversation.id);
            shouldTrigger = false;
          } else {
            shouldTrigger = true;
          }
        } else {
          shouldTrigger = true;
        }
      }

      if (!shouldTrigger && triggerText) {
        shouldTrigger = await checkMasterPromptTriggers(supabase, organizationId, contact.id, triggerText, conversation.id);
      }

      // Check if AI is paused by human agent
      if (shouldTrigger && isAIPaused(conversation.metadata)) {
        console.log(`[WEBHOOK] AI is PAUSED for conversation ${conversation.id} — skipping standalone orchestrator trigger`);
        shouldTrigger = false;
      }

      if (shouldTrigger) {
        console.log(`[WEBHOOK] Triggering agent-orchestrator for conversation ${conversation.id}. Mode: ${conversation.service_mode}, Text: "${triggerText}"`);
        const orchestratorBody: Record<string, unknown> = { 
          conversationId: conversation.id, 
          messageContent: triggerText || '[mídia]',
          messageId: savedMessage.id // Pass messageId for hydration
        };

        scheduleDebouncedOrchestrator(supabase, conversation.id, serviceRoleKey, orchestratorBody, triggerText || '[mídia]');
      }
    }
  }
  return respond({ success: true, messageId: savedMessage.id });
}

async function handleReadReceipt(supabase: any, payload: any) {
    const msg = payload.message || {};
    const msgId = msg.msgid || msg.id;
    if (!msgId) return respond({ success: true, ignored: true });

    const ack = msg.ack || payload.ack || 0; // Update status
    const updateData: any = {};
    if (ack >= 1) updateData.sent_at = updateData.sent_at || new Date().toISOString();
    if (ack >= 2) updateData.delivered_at = updateData.delivered_at || new Date().toISOString();
    if (ack >= 3) updateData.read_at = updateData.read_at || new Date().toISOString();

    if (ack >= 4) {
      // Audio played status
      updateData.metadata = {
        ...(msg.metadata || {}),
        played_at: msg.metadata?.played_at || new Date().toISOString()
      };
      // Ensure it's marked as read too
      updateData.read_at = updateData.read_at || new Date().toISOString();
    }

    if (Object.keys(updateData).length > 0) {
      await supabase.from('messages').update(updateData).eq('zapi_message_id', msgId);
    }

    return respond({ success: true });
  }

async function handlePresence(supabase: any, payload: any, instanceId: string, instanceName: string) {
  const chat = payload.chat || {};
  // Fallback to chatId, sender or number if phone is missing
  const rawPhone = chat.phone || chat.wa_chatid || payload.chatId || payload.sender || payload.number || '';
  const phone = cleanPhone(rawPhone);

  if (!phone) {
    console.log(`[Presence] No phone found in payload for instanceId=${instanceId}, instanceName=${instanceName}`);
    return new Response(JSON.stringify({ error: 'Phone not found' }), { status: 400 });
  }

  // Identify instance for presence
  const { data: whatsappInstance, error: presenceInstanceError } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .or(`zapi_instance_id.eq.${instanceId},zapi_instance_id.eq.${instanceName}`)
    .maybeSingle();

  if (presenceInstanceError || !whatsappInstance) {
    console.warn(`[WEBHOOK presence] No instance found: ID=${instanceId}, Name=${instanceName}`);
    return respond({ success: true, ignored: true, reason: 'instance_not_found' });
  }

    const variants = phoneVariants(phone);
    const { data: contact } = await supabase.from('contacts').select('id')
      .eq('organization_id', whatsappInstance.organization_id)
      .in('phone', variants.length > 0 ? variants : [phone])
      .limit(1)
      .maybeSingle();
    if (!contact) return respond({ success: true });

    const state = (payload.state || payload.presenceType || payload.presence || '').toLowerCase();
    let presenceType: string;
    switch (state) {
      case 'composing': case 'typing': presenceType = 'typing'; break;
      case 'recording': presenceType = 'recording'; break;
      case 'online': case 'available': case 'active': presenceType = 'online'; break;
      default: presenceType = 'offline';
    }

    await supabase.from('contact_presence').upsert({
      contact_id: contact.id, organization_id: whatsappInstance.organization_id,
      presence_type: presenceType, started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30000).toISOString(),
    }, { onConflict: 'contact_id' });

    return respond({ success: true });
}

// ========== HELPERS ==========

  async function findOrCreateContact(supabase: any, phone: string, organizationId: string, name: string | null, avatarUrl: string | null) {
    const variants = phoneVariants(phone);
    const canonical = canonicalPhone(phone);

    // Try any known representation first. Providers sometimes disagree about:
    // country code, the Brazilian ninth digit, or append a transient trailing digit.
    const { data: existingContacts } = await supabase
      .from('contacts').select('*')
      .eq('organization_id', organizationId)
      .in('phone', variants.length > 0 ? variants : [phone])
      .order('updated_at', { ascending: false })
      .limit(20);

    const existing = (existingContacts || []).sort((a: any, b: any) => {
      const aPhone = canonicalPhone(a.phone || '');
      const bPhone = canonicalPhone(b.phone || '');
      const aCanonical = aPhone === canonical || a.metadata?.canonical_phone === canonical;
      const bCanonical = bPhone === canonical || b.metadata?.canonical_phone === canonical;
      if (aCanonical !== bCanonical) return aCanonical ? -1 : 1;
      const aHasCountryCode = String(a.phone || '').replace(/\D/g, '').startsWith('55');
      const bHasCountryCode = String(b.phone || '').replace(/\D/g, '').startsWith('55');
      if (aHasCountryCode !== bHasCountryCode) return aHasCountryCode ? -1 : 1;
      return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
    })[0];

    if (existing) {
      if ((existingContacts || []).length > 1) {
        await mergeDuplicateContactConversations(
          supabase,
          organizationId,
          existing,
          (existingContacts || []).filter((contact: any) => contact.id !== existing.id),
        );
      }

      const updateData: any = {};
      if (name && !existing.name) updateData.name = name;
      if (avatarUrl && !existing.avatar_url) updateData.avatar_url = avatarUrl;
      const metadata = { ...(existing.metadata || {}) };
      const aliases = uniquePhones([...(metadata.phone_aliases || []), phone, canonical, ...variants]);
      updateData.metadata = { ...metadata, phone_aliases: aliases, canonical_phone: canonical };
      if (Object.keys(updateData).length > 0) {
        await supabase.from('contacts').update(updateData).eq('id', existing.id);
      }
      return { ...existing, ...updateData };
    }

    // Create new
    const { data: newContact, error } = await supabase
      .from('contacts')
      .insert({
        phone: canonical,
        name: name || null,
        avatar_url: avatarUrl || null,
        organization_id: organizationId,
        metadata: { phone_aliases: uniquePhones([phone, canonical, ...variants]), canonical_phone: canonical },
      })
      .select().single();
    if (error) throw error;
    return newContact;
  }

  async function mergeDuplicateContactConversations(
    supabase: any,
    organizationId: string,
    keeperContact: any,
    duplicateContacts: any[],
  ) {
    if (!duplicateContacts.length) return;

    try {
      const { data: keeperConversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('contact_id', keeperContact.id)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      let targetConversation = keeperConversation;

      for (const duplicateContact of duplicateContacts) {
        const { data: duplicateConversations } = await supabase
          .from('conversations')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('contact_id', duplicateContact.id)
          .order('last_message_at', { ascending: false, nullsFirst: false });

        for (const duplicateConversation of duplicateConversations || []) {
          if (!targetConversation) {
            const { data: movedConversation, error: moveError } = await supabase
              .from('conversations')
              .update({
                contact_id: keeperContact.id,
                metadata: {
                  ...(duplicateConversation.metadata || {}),
                  merged_from_contact_ids: [duplicateContact.id],
                },
              })
              .eq('id', duplicateConversation.id)
              .select()
              .maybeSingle();
            if (!moveError && movedConversation) targetConversation = movedConversation;
            continue;
          }

          if (duplicateConversation.id === targetConversation.id) continue;

          await supabase
            .from('messages')
            .update({ conversation_id: targetConversation.id })
            .eq('conversation_id', duplicateConversation.id);

          const mergedIds = [
            ...((targetConversation.metadata || {}).merged_conversation_ids || []),
            duplicateConversation.id,
          ];

          const newestLastMessage =
            new Date(duplicateConversation.last_message_at || 0).getTime() >
            new Date(targetConversation.last_message_at || 0).getTime()
              ? duplicateConversation.last_message_at
              : targetConversation.last_message_at;

          await supabase
            .from('conversations')
            .update({
              last_message_at: newestLastMessage || new Date().toISOString(),
              unread_count: (targetConversation.unread_count || 0) + (duplicateConversation.unread_count || 0),
              metadata: {
                ...(targetConversation.metadata || {}),
                merged_conversation_ids: Array.from(new Set(mergedIds)),
              },
            })
            .eq('id', targetConversation.id);

          await supabase
            .from('conversations')
            .delete()
            .eq('id', duplicateConversation.id);
        }

        const duplicateMetadata = { ...(duplicateContact.metadata || {}) };
        duplicateMetadata.merged_into_contact_id = keeperContact.id;
        duplicateMetadata.merged_at = new Date().toISOString();
        await supabase
          .from('contacts')
          .update({ metadata: duplicateMetadata })
          .eq('id', duplicateContact.id);
      }
    } catch (error) {
      console.error('[CONTACT_MERGE] Failed to merge duplicate contact conversations:', error);
    }
  }

  async function findOrCreateConversation(supabase: any, contactId: string, organizationId: string, whatsappInstanceId: string, sourcePhone?: string) {
    // IMPORTANT: Find conversation by contact_id to avoid mixing messages
    const { data: existing } = await supabase
      .from('conversations').select('*')
      .eq('contact_id', contactId).eq('organization_id', organizationId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (existing) {
      if (existing.whatsapp_instance_id !== whatsappInstanceId) {
        await supabase.from('conversations').update({ whatsapp_instance_id: whatsappInstanceId }).eq('id', existing.id);
      }
      return existing;
    }

    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({
        contact_id: contactId, organization_id: organizationId,
        whatsapp_instance_id: whatsappInstanceId, source_phone: sourcePhone || null,
        status: 'open', unread_count: 0,
      })
      .select().single();

    if (error) {
      if (error.code === '23505') {
        const { data: raceExisting } = await supabase
          .from('conversations').select('*')
          .eq('contact_id', contactId).eq('organization_id', organizationId).limit(1).maybeSingle();
        if (raceExisting) return raceExisting;
      }
      throw error;
    }
    return newConv;
  }

  async function checkMasterPromptTriggers(supabase: any, organizationId: string, contactId: string, messageContent: string, conversationId: string): Promise<boolean> {
    // Check if a flow just ended recently (within last 30 seconds) — if so, don't re-trigger
    const { data: convCheck } = await supabase
      .from('conversations')
      .select('metadata')
      .eq('id', conversationId)
      .single();
    
    const flowEndedAt = convCheck?.metadata?.flow_ended_at;
    if (flowEndedAt) {
      const elapsedMs = Date.now() - new Date(flowEndedAt).getTime();
      if (elapsedMs < 60000) { // 60 seconds grace period
        console.log(`[WEBHOOK] Skipping master prompt triggers — flow ended ${Math.round(elapsedMs/1000)}s ago`);
        return false;
      }
    }

    const { data: masterPrompts } = await supabase
      .from('master_prompts')
      .select('id, trigger_type, trigger_tags, trigger_keywords')
      .eq('organization_id', organizationId).eq('is_active', true)
      .neq('trigger_type', 'disabled');
    if (!masterPrompts?.length) return false;

    for (const mp of masterPrompts) {
      if (mp.trigger_type === 'tag' && mp.trigger_tags?.length > 0) {
        const { data: contactTags } = await supabase
          .from('contact_tags').select('tag_id')
          .eq('contact_id', contactId).in('tag_id', mp.trigger_tags);
        if (contactTags?.length > 0) {
          await supabase.from('conversations').update({ service_mode: 'ia' }).eq('id', conversationId);
          return true;
        }
      }
      if (mp.trigger_type === 'keyword' && mp.trigger_keywords?.length > 0) {
        const msgLower = messageContent.toLowerCase().trim();
        for (const kw of mp.trigger_keywords) {
          if (!kw.value) continue;
          let matched = false;
          const msgNormalized = normalizeText(msgLower);
          const kwNormalized = normalizeText(kw.value);
          switch (kw.match_type) {
            case 'exact': matched = msgNormalized === kwNormalized; break;
            case 'contains': {
              const words = kwNormalized.split(',').map((w: string) => w.trim()).filter(Boolean);
              matched = words.some((w: string) => msgNormalized.includes(w));
              break;
            }
            case 'starts_with': matched = msgNormalized.startsWith(kwNormalized); break;
          }
          if (matched) {
            await supabase.from('conversations').update({ service_mode: 'ia' }).eq('id', conversationId);
            return true;
          }
        }
      }
    }
    return false;
  }

  // Check for exact, contains, or starts_with matches in active campaigns
  async function checkCampaignTriggers(supabase: any, organizationId: string, messageContent: string): Promise<{ flowId: string, campaignId: string } | null> {
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select('id, trigger_keyword, match_type, flow_id, is_active')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (campaignsError) {
      console.error('Error fetching campaigns:', campaignsError);
      return null;
    }

    console.log(`Found ${campaigns?.length || 0} active campaigns for org ${organizationId}`);

    if (!campaigns?.length) return null;

    const msgLower = messageContent.toLowerCase().trim();
    console.log(`Comparing message "${msgLower}" against campaigns...`);

    for (const campaign of campaigns) {
      if (!campaign.trigger_keyword) continue;

      // words might be comma separated "sim, quero, gosto"
      const keywords = campaign.trigger_keyword.split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean);
      console.log(`Campaign ${campaign.id} keywords:`, keywords, `Match type: ${campaign.match_type}`);

      const msgNormalized = normalizeText(msgLower);
      for (const kw of keywords) {
        let matched = false;
        const kwNormalized = normalizeText(kw);
        switch (campaign.match_type) {
          case 'exact':
            matched = msgNormalized === kwNormalized;
            break;
          case 'contains':
            matched = msgNormalized.includes(kwNormalized);
            break;
          case 'starts_with':
            matched = msgNormalized.startsWith(kwNormalized);
            break;
          default:
            matched = msgNormalized === kwNormalized;
        }

        if (matched) {
          console.log(`MATCH FOUND! Campaign: ${campaign.id}, Keyword: ${kw}`);
          return { flowId: campaign.flow_id, campaignId: campaign.id };
        }
      }
    }

    console.log('[WEBHOOK] No campaign match found for message:', msgLower);
    return null;
  }

  function normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }
