import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const EdgeRuntime: any;

function runBackground(promise: Promise<any>) {
  if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
    EdgeRuntime.waitUntil(promise);
  } else {
    promise.catch(err => console.error('Background task error:', err));
  }
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
  if (clean.length < 12 || clean.length > 15) return false;

  if (clean.startsWith('55')) {
    const ddd = parseInt(clean.substring(2, 4), 10);
    if (!VALID_DDDS.has(ddd)) return false;
    const numberPart = clean.substring(4);
    if (numberPart.length < 8 || numberPart.length > 9) return false;
  }
  return true;
}

function cleanPhone(raw: string): string {
  if (!raw) return '';
  const stripped = raw.replace(/@.*$/, '').replace(/[:\s\-\+\(\)]/g, '').replace(/\D/g, '');
  const phone = ensureCountryCode(stripped);
  if (!phone || !isValidPhoneNumber(phone)) return '';
  return phone;
}

function isGroupChat(chatid: string): boolean {
  return chatid?.includes('@g.us') || chatid?.includes('@broadcast') || false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();

    // UAZAPI uses EventType, not type
    console.log('UAZAPI Full Payload:', JSON.stringify(payload, null, 2));

    const eventType = (payload.EventType || payload.eventType || payload.type || '').toLowerCase();
    const instanceName = payload.instanceName || payload.userID || '';

    console.log('=== UAZAPI WEBHOOK ===');
    console.log('EventType:', eventType, '| Instance:', instanceName);

    // System events to ignore
    if (['connectfailure', 'qr', 'qrtimeout', 'historysync',
      'notification', 'e2e_notification', 'ciphertext', 'revoked', 'protocol'].includes(eventType)) {
      return respond({ success: true, ignored: true, reason: 'system_event' });
    }

    // Handle connection events
    if (eventType === 'connected' || eventType === 'pairsuccess') {
      console.log(`[BOOTSTRAP] Instance ${instanceName} connected. Triggering sync...`);

      // Update instance status in background
      if (instanceName) {
        supabase.from('whatsapp_instances')
          .update({ status: 'connected', is_active: true, connected_at: new Date().toISOString() })
          .eq('zapi_instance_id', instanceName)
          .then(({ error }) => {
            if (error) console.error('Error updating instance on connect:', error);
          });
      }

      // Trigger sync functions in background
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const baseUrl = Deno.env.get('SUPABASE_URL')!;

      // Use internal function call or fetch
      const syncPromise = fetch(`${baseUrl}/functions/v1/zapi-sync-chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ instanceId: instanceName }), // sync-chats now handles instanceName or DB ID
      });
      runBackground(syncPromise);

      return respond({ success: true, message: 'connection_handled' });
    }

    // Handle message events
    if (eventType === 'messages' || eventType === 'message') {
      return await handleMessage(supabase, payload, instanceName);
    }

    // Handle read receipts
    if (eventType === 'readreceipt' || eventType === 'ack') {
      return await handleReadReceipt(supabase, payload);
    }

    // Handle presence
    if (eventType === 'presence' || eventType === 'chatpresence') {
      return await handlePresence(supabase, payload, instanceName);
    }

    // Handle call events
    if (eventType.startsWith('call')) {
      return respond({ success: true, ignored: true, reason: 'call_event' });
    }

    // Handle chat updates (UAZAPI sends these too) - extract message from it
    if (eventType === 'chats' || eventType === 'chat') {
      // Chat update events sometimes contain messages
      if (payload.message?.msgid) {
        return await handleMessage(supabase, payload, instanceName);
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

async function handleMessage(supabase: any, payload: any, instanceName: string) {
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
  const msgSource = eventInfo.MessageSource || eventInfo.messageSource || eventInfo;
  const msg = payload.message || {};
  const chat = payload.chat || {};

  // --- Extract phone (JID -> phone) ---
  const chatJid = msgSource.Chat || msgSource.chat || eventInfo.Chat || eventInfo.chat || '';
  const senderJid = msgSource.Sender || msgSource.sender || eventInfo.Sender || eventInfo.sender || '';
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

  if (!phone || !isValidPhoneNumber(phone)) {
    console.log('Skipping invalid phone:', phone, 'chatJid:', chatJid, 'chatid:', chatid);
    return respond({ success: true, ignored: true, reason: 'invalid_phone' });
  }

  // --- Extract fromMe, msgId, pushName ---
  const fromMe = (eventInfo.IsFromMe ?? eventInfo.isFromMe) || msg.fromMe === true || msg.fromMe === 'true';
  const msgId = eventInfo.ID || eventInfo.Id || eventInfo.id || msg.msgid || msg.id || msg.key?.id || '';
  const pushName = eventInfo.PushName || eventInfo.pushName || chat.wa_contactName || chat.name || chat.wa_name || msg.senderName || '';

  // --- Determine message type and content ---
  let textContent: string | null = null;
  let messageType = 'text';
  let mediaUrl: string | null = null;

  // Check UAZAPI native format first (payload.event.Message sub-objects)
  const conversationText = eventMessage.conversation || eventMessage.Conversation;
  const extendedText = eventMessage.extendedTextMessage || eventMessage.ExtendedTextMessage;
  const imageMsg = eventMessage.imageMessage || eventMessage.ImageMessage;
  const audioMsg = eventMessage.audioMessage || eventMessage.AudioMessage;
  const videoMsg = eventMessage.videoMessage || eventMessage.VideoMessage;
  const documentMsg = eventMessage.documentMessage || eventMessage.DocumentMessage;
  const stickerMsg = eventMessage.stickerMessage || eventMessage.StickerMessage;
  const locationMsg = eventMessage.locationMessage || eventMessage.LocationMessage;
  const contactMsg = eventMessage.contactMessage || eventMessage.ContactMessage;

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
  } else if (videoMsg) {
    messageType = 'video';
    textContent = videoMsg.caption || videoMsg.Caption || null;
  } else if (documentMsg) {
    messageType = 'document';
    textContent = documentMsg.fileName || documentMsg.FileName || documentMsg.title || null;
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
  } else {
    // Fallback to legacy format parsing
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

    // Check for media types from legacy msg.type
    const msgType = (msg.type || msg.messageType || chat.wa_lastMessageType || '').toLowerCase();
    if (msgType.includes('image')) {
      messageType = 'image';
      mediaUrl = msg.mediaUrl || msg.media?.url || null;
      if (!textContent) textContent = content.caption || msg.caption || null;
    } else if (msgType.includes('audio') || msgType.includes('ptt')) {
      messageType = 'audio';
      mediaUrl = msg.mediaUrl || msg.media?.url || null;
    } else if (msgType.includes('video')) {
      messageType = 'video';
      mediaUrl = msg.mediaUrl || msg.media?.url || null;
      if (!textContent) textContent = content.caption || msg.caption || null;
    } else if (msgType.includes('document')) {
      messageType = 'document';
      mediaUrl = msg.mediaUrl || msg.media?.url || null;
      if (!textContent) textContent = content.fileName || msg.fileName || null;
    } else if (msgType.includes('sticker')) {
      messageType = 'sticker';
      mediaUrl = msg.mediaUrl || msg.media?.url || null;
    } else if (msgType.includes('location')) {
      messageType = 'location';
    } else if (msgType.includes('contact')) {
      messageType = 'contact';
    }
  }

  // Skip protocol/system messages
  if (eventMessage.protocolMessage || eventMessage.ProtocolMessage) {
    return respond({ success: true, ignored: true, reason: 'protocol_message' });
  }

  // Skip empty text messages (but allow media-only messages)
  if (!textContent && !mediaUrl && messageType === 'text' && !payload.base64) {
    return respond({ success: true, ignored: true, reason: 'empty_message' });
  }

  console.log(`[WEBHOOK] Message: type=${messageType}, fromMe=${fromMe}, phone=${phone}, hasBase64=${!!payload.base64}`);

  // Handle base64 media (UAZAPI sends media as base64 in the payload)
  if (payload.base64 && payload.mimeType) {
    try {
      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
        'audio/ogg; codecs=opus': 'ogg', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
        'video/mp4': 'mp4', 'video/3gpp': '3gp',
        'application/pdf': 'pdf',
      };
      const ext = extMap[payload.mimeType] || payload.fileName?.split('.').pop() || 'bin';
      const fileName = `${msgId || Date.now()}.${ext}`;
      const storagePath = `webhook-media/${fileName}`;
      const binaryData = Uint8Array.from(atob(payload.base64), c => c.charCodeAt(0));

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(storagePath, binaryData, { contentType: payload.mimeType, upsert: true });
      if (!uploadError) {
        const { data: publicUrl } = supabase.storage.from('chat-media').getPublicUrl(storagePath);
        mediaUrl = publicUrl?.publicUrl || null;
        console.log(`[WEBHOOK] Media uploaded: ${mediaUrl?.substring(0, 80)}`);
      } else {
        console.error('[WEBHOOK] Media upload error:', uploadError);
      }
    } catch (e) {
      console.error('Media upload error:', e);
    }
  }

  // Find WhatsApp instance by instanceName
  let whatsappInstance = null;
  if (instanceName) {
    const { data: instance } = await supabase
      .from('whatsapp_instances').select('*')
      .eq('zapi_instance_id', instanceName).single();
    whatsappInstance = instance;
  }
  if (!whatsappInstance) {
    const { data: instances } = await supabase
      .from('whatsapp_instances').select('*')
      .eq('status', 'connected').limit(1);
    whatsappInstance = instances?.[0];
  }
  if (!whatsappInstance) {
    console.error('No connected instance found for:', instanceName);
    return respond({ error: 'No connected instance' }, 404);
  }

  const organizationId = whatsappInstance.organization_id;

  // Find or create contact
  let contact = await findOrCreateContact(supabase, phone, organizationId, pushName, chat.imagePreview || chat.image || null);

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

  // Check for duplicate message
  if (msgId) {
    const { data: existing } = await supabase
      .from('messages').select('id')
      .eq('zapi_message_id', msgId).maybeSingle();
    if (existing) {
      return respond({ success: true, duplicate: true });
    }
  }

  // Insert message into the CORRECT conversation
  const { data: savedMessage, error: messageError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      content: textContent,
      type: messageType,
      direction: fromMe ? 'outbound' : 'inbound',
      is_from_bot: false,
      media_url: mediaUrl,
      zapi_message_id: msgId || null,
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
  if (!fromMe && textContent) {
    console.log(`Checking triggers for message: "${textContent}" in org: ${organizationId}`);
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Check for Campaign Triggers (highest priority)
    const campaignTrigger = await checkCampaignTriggers(supabase, organizationId, textContent);

    if (campaignTrigger) {
      console.log('Campaign trigger matched:', JSON.stringify(campaignTrigger));
      const { flowId: campaignFlowId, campaignId } = campaignTrigger;
      console.log(`[CAMPAIGN TRIGGERED] Starting flow ${campaignFlowId} for conversation ${conversation.id}`);
      // Mark as IA mode to prevent human collision if needed, or leave as is. We'll set to ia.
      await supabase.from('conversations').update({ service_mode: 'ia' }).eq('id', conversation.id);

      try {
        const { data: c } = await supabase.from('campaigns').select('trigger_count').eq('id', campaignId).single();
        if (c) {
          await supabase.from('campaigns').update({ trigger_count: (c.trigger_count || 0) + 1 }).eq('id', campaignId);
        }
      } catch (err) {
        console.error('[WEBHOOK] Failed to increment trigger_count:', err);
      }

      console.log(`[WEBHOOK] Invoking flow-execute for campaign ${campaignId}, flow ${campaignFlowId}`);
      // Call flow execution engine
      const flowExecPromise = fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/flow-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ flowId: campaignFlowId, conversationId: conversation.id }),
      });
      runBackground(flowExecPromise);

      return respond({ success: true, messageId: savedMessage.id, triggeredCampaign: true });
    }

    // 2. Check for Master Prompt / AI routing
    let shouldTrigger = conversation.service_mode === 'ia';

    if (!shouldTrigger) {
      shouldTrigger = await checkMasterPromptTriggers(supabase, organizationId, contact.id, textContent, conversation.id);
    }

    if (shouldTrigger) {
      const agentPromise = fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/agent-orchestrator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ conversationId: conversation.id, messageContent: textContent }),
      });
      runBackground(agentPromise);
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

async function handlePresence(supabase: any, payload: any, instanceName: string) {
  const chat = payload.chat || {};
  // Fallback to chatId, sender or number if phone is missing
  const rawPhone = chat.phone || chat.wa_chatid || payload.chatId || payload.sender || payload.number || '';
  const phone = cleanPhone(rawPhone);

  if (!phone) {
    console.log(`[Presence] No phone found in payload for instance ${instanceName}`);
    return new Response(JSON.stringify({ error: 'Phone not found' }), { status: 400 });
  }

  let whatsappInstance = null;
  if (instanceName) {
    const { data } = await supabase.from('whatsapp_instances').select('*').eq('zapi_instance_id', instanceName).single();
    whatsappInstance = data;
  }
  if (!whatsappInstance) {
    const { data: instances } = await supabase.from('whatsapp_instances').select('*').eq('status', 'connected').limit(1);
    whatsappInstance = instances?.[0];
  }
  if (!whatsappInstance) return respond({ success: true });

  const { data: contact } = await supabase.from('contacts').select('id')
    .eq('phone', phone).eq('organization_id', whatsappInstance.organization_id).maybeSingle();
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
  // Try exact phone match
  const { data: existing } = await supabase
    .from('contacts').select('*')
    .eq('phone', phone).eq('organization_id', organizationId).maybeSingle();

  if (existing) {
    const updateData: any = {};
    if (name && !existing.name) updateData.name = name;
    if (avatarUrl && !existing.avatar_url) updateData.avatar_url = avatarUrl;
    if (Object.keys(updateData).length > 0) {
      await supabase.from('contacts').update(updateData).eq('id', existing.id);
    }
    return { ...existing, ...updateData };
  }

  // Try without country code (legacy)
  const shortPhone = phone.replace(/^55/, '');
  if (shortPhone !== phone) {
    const { data: shortContact } = await supabase
      .from('contacts').select('*')
      .eq('phone', shortPhone).eq('organization_id', organizationId).maybeSingle();
    if (shortContact) {
      const updateData: any = { phone };
      if (name && !shortContact.name) updateData.name = name;
      if (avatarUrl && !shortContact.avatar_url) updateData.avatar_url = avatarUrl;
      await supabase.from('contacts').update(updateData).eq('id', shortContact.id);
      return { ...shortContact, ...updateData };
    }
  }

  // Create new
  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({ phone, name: name || null, avatar_url: avatarUrl || null, organization_id: organizationId })
    .select().single();
  if (error) throw error;
  return newContact;
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
        switch (kw.match_type) {
          case 'exact': matched = msgLower === kw.value.toLowerCase().trim(); break;
          case 'contains': {
            const words = kw.value.split(',').map((w: string) => w.trim().toLowerCase()).filter(Boolean);
            matched = words.some((w: string) => msgLower.includes(w));
            break;
          }
          case 'starts_with': matched = msgLower.startsWith(kw.value.toLowerCase().trim()); break;
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

    for (const kw of keywords) {
      let matched = false;
      switch (campaign.match_type) {
        case 'exact':
          matched = msgLower === kw;
          break;
        case 'contains':
          matched = msgLower.includes(kw);
          break;
        case 'starts_with':
          matched = msgLower.startsWith(kw);
          break;
        default:
          matched = msgLower === kw;
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
