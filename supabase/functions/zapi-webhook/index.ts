import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
      fetch(`${baseUrl}/functions/v1/zapi-sync-chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ instanceId: instanceName }), // sync-chats now handles instanceName or DB ID
      }).catch(err => console.error('Auto-sync chats error:', err));

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
  const msg = payload.message || {};
  const chat = payload.chat || {};

  // Extract chatid to determine if group
  const chatid = msg.chatid || chat.wa_chatid || '';
  if (isGroupChat(chatid)) {
    return respond({ success: true, ignored: true, reason: 'group_message' });
  }

  // Extract phone number - prefer chat.phone (formatted like "+55 27 99920-9156")
  // or extract from chatid (like "5527999209156@s.whatsapp.net")
  let phone = '';
  if (chat.phone) {
    phone = cleanPhone(chat.phone);
  } else if (chatid) {
    phone = cleanPhone(chatid);
  } else if (msg.phone) {
    phone = cleanPhone(msg.phone);
  }

  if (!phone || !isValidPhoneNumber(phone)) {
    console.log('Skipping invalid phone:', phone, 'from chat.phone:', chat.phone, 'chatid:', chatid);
    return respond({ success: true, ignored: true, reason: 'invalid_phone' });
  }

  // Extract message content
  const fromMe = msg.fromMe === true || msg.fromMe === 'true';
  const msgId = msg.msgid || msg.id || msg.key?.id || '';
  const pushName = chat.wa_contactName || chat.name || chat.wa_name || msg.senderName || '';

  // Get text content from various UAZAPI formats
  let textContent: string | null = null;
  let messageType = 'text';
  let mediaUrl: string | null = null;

  // UAZAPI format: message.content.text or message.content directly
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

  // Check for media types
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

  // Skip empty messages
  if (!textContent && !mediaUrl && messageType === 'text') {
    return respond({ success: true, ignored: true, reason: 'empty_message' });
  }

  // Handle base64 media
  if (payload.base64 && payload.mimeType) {
    try {
      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
        'audio/ogg; codecs=opus': 'ogg', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
        'video/mp4': 'mp4', 'application/pdf': 'pdf',
      };
      const ext = extMap[payload.mimeType] || 'bin';
      const fileName = `${msgId || Date.now()}.${ext}`;
      const storagePath = `webhook-media/${fileName}`;
      const binaryData = Uint8Array.from(atob(payload.base64), c => c.charCodeAt(0));

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(storagePath, binaryData, { contentType: payload.mimeType, upsert: true });
      if (!uploadError) {
        const { data: publicUrl } = supabase.storage.from('chat-media').getPublicUrl(storagePath);
        mediaUrl = publicUrl?.publicUrl || null;
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

  // Trigger AI agent or Campaigns if needed
  if (!fromMe && textContent) {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Check for Campaign Triggers (highest priority)
    const campaignFlowId = await checkCampaignTriggers(supabase, organizationId, textContent);

    if (campaignFlowId) {
      console.log(`[CAMPAIGN TRIGGERED] Starting flow ${campaignFlowId} for conversation ${conversation.id}`);
      // Mark as IA mode to prevent human collision if needed, or leave as is. We'll set to ia.
      await supabase.from('conversations').update({ service_mode: 'ia' }).eq('id', conversation.id);

      // Call flow execution engine
      fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/flow-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ flowId: campaignFlowId, conversationId: conversation.id }),
      }).catch(err => console.error('Campaign flow execute error:', err));

      return respond({ success: true, messageId: savedMessage.id, triggeredCampaign: true });
    }

    // 2. Check for Master Prompt / AI routing
    let shouldTrigger = conversation.service_mode === 'ia';

    if (!shouldTrigger) {
      shouldTrigger = await checkMasterPromptTriggers(supabase, organizationId, contact.id, textContent, conversation.id);
    }

    if (shouldTrigger) {
      fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/agent-orchestrator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ conversationId: conversation.id, messageContent: textContent }),
      }).catch(err => console.error('Agent orchestrator error:', err));
    }
  }

  return respond({ success: true, messageId: savedMessage.id });
}

async function handleReadReceipt(supabase: any, payload: any) {
  const msg = payload.message || {};
  const msgId = msg.msgid || msg.id;
  if (!msgId) return respond({ success: true, ignored: true });

  const ack = msg.ack || payload.ack || 0;
  const updateData: any = {};
  if (ack >= 2) updateData.delivered_at = new Date().toISOString();
  if (ack >= 3) updateData.read_at = new Date().toISOString();

  if (Object.keys(updateData).length > 0) {
    await supabase.from('messages').update(updateData).eq('zapi_message_id', msgId);
  }

  return respond({ success: true });
}

async function handlePresence(supabase: any, payload: any, instanceName: string) {
  const chat = payload.chat || {};
  const phone = cleanPhone(chat.phone || chat.wa_chatid || '');
  if (!phone) return respond({ success: true });

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

  const state = (payload.state || payload.presenceType || '').toLowerCase();
  let presenceType: string;
  switch (state) {
    case 'composing': case 'typing': presenceType = 'typing'; break;
    case 'recording': presenceType = 'recording'; break;
    case 'online': case 'available': presenceType = 'online'; break;
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
async function checkCampaignTriggers(supabase: any, organizationId: string, messageContent: string): Promise<string | null> {
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, trigger_keyword, match_type, flow_id')
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  if (!campaigns?.length) return null;

  const msgLower = messageContent.toLowerCase().trim();

  for (const campaign of campaigns) {
    if (!campaign.trigger_keyword) continue;

    // words might be comma separated "sim, quero, gosto"
    const keywords = campaign.trigger_keyword.split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean);

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
        return campaign.flow_id;
      }
    }
  }

  return null;
}
