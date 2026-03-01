import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// List of notification/event types to ignore
const IGNORED_EVENT_TYPES = [
  'notification',
  'e2e_notification',
  'ciphertext',
  'revoked',
  'protocol',
  'templateButtonReplyMessage',
];

// Ensure phone has country code (default Brazil 55)
function ensureCountryCode(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length >= 12) return clean;
  if (clean.length >= 10 && clean.length <= 11) return `55${clean}`;
  return clean;
}

function isValidPhoneNumber(phone: string): boolean {
  if (!phone) return false;
  const cleanPhone = phone.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@lid', '');
  if (cleanPhone.length < 10 || cleanPhone.length > 15) return false;
  if (cleanPhone === '0') return false;
  const digitsOnly = cleanPhone.replace(/^\+/, '');
  if (!/^\d+$/.test(digitsOnly)) return false;
  if (phone.includes('@lid') || phone.includes('lid:')) return false;
  if (phone.includes('@g.us') || phone.includes('-group') || phone.includes('group')) return false;
  return true;
}

// Extract clean phone from JID and ensure country code
function jidToPhone(jid: string): string {
  if (!jid) return '';
  const raw = jid.split('@')[0].split('.')[0].split(':')[0];
  return ensureCountryCode(raw);
}

function isGroupJid(jid: string): boolean {
  return jid?.includes('@g.us') || jid?.includes('@broadcast') || false;
}

async function parseUazapiPayload(req: Request): Promise<any> {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await req.text();
    const params = new URLSearchParams(formData);
    const jsonData = params.get('jsonData');
    if (jsonData) {
      const parsed = JSON.parse(jsonData);
      if (params.get('token')) parsed._token = params.get('token');
      if (params.get('userID')) parsed.userID = params.get('userID');
      if (params.get('instanceName')) parsed.instanceName = params.get('instanceName');
      return parsed;
    }
    throw new Error('No jsonData in form payload');
  }
  return await req.json();
}

function normalizeMessageEvent(payload: any) {
  const event = payload.event || {};
  const info = event.Info || event.info || {};
  const msgSource = info.MessageSource || info.messageSource || info;
  const message = event.Message || event.message || {};

  const chatJid = msgSource.Chat || msgSource.chat || info.Chat || info.chat || '';
  const senderJid = msgSource.Sender || msgSource.sender || info.Sender || info.sender || '';
  const phone = jidToPhone(chatJid) || jidToPhone(senderJid);
  
  const fromMe = msgSource.IsFromMe ?? msgSource.isFromMe ?? info.IsFromMe ?? info.isFromMe ?? false;
  const messageId = info.ID || info.Id || info.id || '';
  const isGroup = msgSource.IsGroup ?? msgSource.isGroup ?? info.IsGroup ?? info.isGroup ?? isGroupJid(chatJid);
  const pushName = info.PushName || info.pushName || '';
  
  let timestamp = 0;
  if (info.Timestamp) {
    const ts = new Date(info.Timestamp).getTime();
    timestamp = isNaN(ts) ? 0 : ts;
  }

  let messageType = 'text';
  let textContent: string | null = null;
  let caption: string | null = null;

  const conversation = message.conversation || message.Conversation;
  const extendedText = message.extendedTextMessage || message.ExtendedTextMessage;
  const imageMsg = message.imageMessage || message.ImageMessage;
  const audioMsg = message.audioMessage || message.AudioMessage;
  const videoMsg = message.videoMessage || message.VideoMessage;
  const documentMsg = message.documentMessage || message.DocumentMessage;
  const stickerMsg = message.stickerMessage || message.StickerMessage;
  const locationMsg = message.locationMessage || message.LocationMessage;
  const contactMsg = message.contactMessage || message.ContactMessage;

  if (conversation) {
    messageType = 'text';
    textContent = conversation;
  } else if (extendedText) {
    messageType = 'text';
    textContent = extendedText.text || extendedText.Text || '';
  } else if (imageMsg) {
    messageType = 'image';
    caption = imageMsg.caption || imageMsg.Caption || null;
    textContent = caption;
  } else if (audioMsg) {
    messageType = 'audio';
  } else if (videoMsg) {
    messageType = 'video';
    caption = videoMsg.caption || videoMsg.Caption || null;
    textContent = caption;
  } else if (documentMsg) {
    messageType = 'document';
    textContent = documentMsg.fileName || documentMsg.FileName || documentMsg.title || '';
  } else if (stickerMsg) {
    messageType = 'sticker';
  } else if (locationMsg) {
    messageType = 'location';
    const lat = locationMsg.degreesLatitude || locationMsg.DegreesLatitude || 0;
    const lng = locationMsg.degreesLongitude || locationMsg.DegreesLongitude || 0;
    const name = locationMsg.name || locationMsg.Name || '';
    const address = locationMsg.address || locationMsg.Address || '';
    textContent = name || address || `${lat}, ${lng}`;
  } else if (contactMsg) {
    messageType = 'contact';
    textContent = contactMsg.displayName || contactMsg.DisplayName || '';
  }

  const mediaBase64 = payload.base64 || null;
  const mediaMimeType = payload.mimeType || null;
  const mediaFileName = payload.fileName || null;
  const instanceId = payload.userID || payload.instanceName || null;
  const isLid = chatJid.includes('@lid') || senderJid.includes('@lid');
  const chatLid = isLid ? phone : null;

  return {
    phone, fromMe, messageId, isGroup, pushName, timestamp,
    textContent, mediaBase64, mediaMimeType, mediaFileName,
    messageType, caption, instanceId, isLid, chatLid, rawEvent: payload,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await parseUazapiPayload(req);
    
    console.log('=== UAZAPI WEBHOOK RECEIVED ===');
    console.log('Type:', payload.type);
    console.log('UserID:', payload.userID);

    const eventType = (payload.type || '').toLowerCase();

    // Ignore system events
    if (eventType === 'connected' || eventType === 'pairsuccess' || 
        eventType === 'connectfailure' || eventType === 'qr' || 
        eventType === 'qrtimeout' || eventType === 'historysync') {
      return new Response(JSON.stringify({ success: true, ignored: true, reason: 'system_event' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle call events
    if (eventType === 'call_voice' || eventType === 'call_video' || eventType === 'call_missed') {
      console.log('Call event received:', eventType);
      return new Response(JSON.stringify({ success: true, type: eventType }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (eventType === 'message') {
      return await handleMessage(supabase, payload);
    }

    if (eventType === 'readreceipt') {
      return await handleReadReceipt(supabase, payload);
    }

    if (eventType === 'presence' || eventType === 'chatpresence') {
      return await handlePresenceUpdate(supabase, payload);
    }

    console.log('Ignoring unknown event type:', eventType);
    return new Response(JSON.stringify({ success: true, ignored: true, type: eventType }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleMessage(supabase: any, payload: any) {
  const msg = normalizeMessageEvent(payload);

  if (msg.isGroup) {
    return new Response(JSON.stringify({ success: true, ignored: true, reason: 'group_message' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!msg.isLid && !isValidPhoneNumber(msg.phone)) {
    console.log('Skipping invalid phone:', msg.phone);
    return new Response(JSON.stringify({ success: true, ignored: true, reason: 'invalid_phone' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (msg.isLid && !msg.chatLid) {
    return new Response(JSON.stringify({ success: true, ignored: true, reason: 'lid_without_link' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!msg.textContent && !msg.mediaBase64 && msg.messageType === 'text') {
    return new Response(JSON.stringify({ success: true, ignored: true, reason: 'empty_message' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const event = payload.event || {};
  const message = event.Message || event.message || {};
  if (message.protocolMessage || message.ProtocolMessage) {
    return new Response(JSON.stringify({ success: true, ignored: true, reason: 'protocol_message' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Find WhatsApp instance
  let whatsappInstance = null;
  if (msg.instanceId) {
    const { data: instance } = await supabase
      .from('whatsapp_instances').select('*')
      .eq('zapi_instance_id', msg.instanceId).single();
    whatsappInstance = instance;
  }
  if (!whatsappInstance) {
    const { data: instances } = await supabase
      .from('whatsapp_instances').select('*')
      .eq('status', 'connected').limit(1);
    whatsappInstance = instances?.[0];
  }
  if (!whatsappInstance) {
    return new Response(JSON.stringify({ error: 'No connected instance' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  const organizationId = whatsappInstance.organization_id;

  // For @lid identifiers, try to find existing contact
  if (msg.isLid) {
    const existingContact = await findContactByPhoneOrLid(supabase, msg.phone, organizationId);
    if (!existingContact) {
      return new Response(JSON.stringify({ success: true, ignored: true, reason: 'lid_no_contact' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Find or create contact - also try partial phone match
  let contact = await findOrCreateContactWithLid(supabase, {
    phone: msg.phone,
    isLidIdentifier: msg.isLid,
    chatLid: msg.chatLid,
    name: msg.pushName,
    avatarUrl: null,
    organizationId,
  });

  // Fetch profile from UAZAPI if contact has no name
  if (!contact.name && msg.phone) {
    try {
      const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
      const resp = await fetch(`${uazapiBaseUrl}/contact/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': whatsappInstance.zapi_token },
        body: JSON.stringify({ number: msg.phone }),
      });
      if (resp.ok) {
        const profileData = await resp.json();
        const updateData: any = {};
        const profileName = profileData.name || profileData.pushname || profileData.notify;
        const profilePic = profileData.profilePicUrl || profileData.profilePictureUrl || profileData.imgUrl;
        if (profileName) updateData.name = profileName;
        if (profilePic) updateData.avatar_url = profilePic;
        if (Object.keys(updateData).length > 0) {
          await supabase.from('contacts').update(updateData).eq('id', contact.id);
          contact = { ...contact, ...updateData };
        }
      }
    } catch (e) {
      console.error('Failed to fetch contact profile:', e);
    }
  }

  const sourcePhone = whatsappInstance.phone_number;
  let conversation = await findOrCreateConversation(supabase, {
    contactId: contact.id,
    organizationId,
    whatsappInstanceId: whatsappInstance.id,
    sourcePhone,
  });

  // Handle media upload
  let mediaUrl: string | null = null;
  if (msg.mediaBase64 && msg.mediaMimeType) {
    try {
      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
        'audio/ogg; codecs=opus': 'ogg', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
        'video/mp4': 'mp4', 'video/3gpp': '3gp', 'application/pdf': 'pdf',
      };
      const ext = extMap[msg.mediaMimeType] || msg.mediaFileName?.split('.').pop() || 'bin';
      const fileName = `${msg.messageId || Date.now()}.${ext}`;
      const storagePath = `webhook-media/${organizationId}/${fileName}`;
      const binaryData = Uint8Array.from(atob(msg.mediaBase64), c => c.charCodeAt(0));
      
      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(storagePath, binaryData, { contentType: msg.mediaMimeType, upsert: true });

      if (!uploadError) {
        const { data: publicUrl } = supabase.storage.from('chat-media').getPublicUrl(storagePath);
        mediaUrl = publicUrl?.publicUrl || null;
      }
    } catch (e) {
      console.error('Error processing media:', e);
    }
  }

  // Check for duplicate
  if (msg.messageId) {
    const { data: existingMessage } = await supabase
      .from('messages').select('id')
      .eq('zapi_message_id', msg.messageId).maybeSingle();
    if (existingMessage) {
      return new Response(JSON.stringify({ success: true, duplicate: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Insert message
  const { data: savedMessage, error: messageError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      content: msg.textContent,
      type: msg.messageType,
      direction: msg.fromMe ? 'outbound' : 'inbound',
      is_from_bot: false,
      media_url: mediaUrl,
      zapi_message_id: msg.messageId,
      metadata: { original_payload: payload },
    })
    .select().single();

  if (messageError) {
    console.error('Error inserting message:', messageError);
    throw messageError;
  }

  // Update conversation
  const updateData: any = { last_message_at: new Date().toISOString(), status: 'open' };
  if (!msg.fromMe) updateData.unread_count = conversation.unread_count + 1;
  await supabase.from('conversations').update(updateData).eq('id', conversation.id);

  // Agent orchestrator trigger
  if (!msg.fromMe && msg.textContent) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    let shouldTrigger = conversation.service_mode === 'ia';

    if (!shouldTrigger) {
      shouldTrigger = await checkMasterPromptTriggers(supabase, {
        organizationId, contactId: contact.id,
        messageContent: msg.textContent, conversationId: conversation.id,
      });
    }

    if (shouldTrigger) {
      fetch(`${supabaseUrl}/functions/v1/agent-orchestrator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ conversationId: conversation.id, messageContent: msg.textContent }),
      }).catch(err => console.error('Failed to trigger agent orchestrator:', err));
    }
  }

  return new Response(JSON.stringify({ success: true, messageId: savedMessage.id }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleReadReceipt(supabase: any, payload: any) {
  const event = payload.event || {};
  const state = payload.state || '';
  const messageIds: string[] = event.MessageIDs || event.messageIDs || event.messageIds || [];
  
  if (messageIds.length === 0) {
    return new Response(JSON.stringify({ success: true, ignored: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const updateData: any = {};
  const stateLower = state.toLowerCase();
  if (stateLower === 'delivered') {
    updateData.delivered_at = new Date().toISOString();
  } else if (stateLower === 'read' || stateLower === 'readself') {
    updateData.delivered_at = new Date().toISOString();
    updateData.read_at = new Date().toISOString();
  }

  if (Object.keys(updateData).length > 0) {
    for (const msgId of messageIds) {
      await supabase.from('messages').update(updateData).eq('zapi_message_id', msgId);
    }
  }

  return new Response(JSON.stringify({ success: true, updated: messageIds.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handlePresenceUpdate(supabase: any, payload: any) {
  const event = payload.event || {};
  const state = (payload.state || '').toLowerCase();
  const fromJid = event.From || event.from || '';
  const phone = jidToPhone(fromJid);
  
  if (!phone) {
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const instanceId = payload.userID || payload.instanceName;
  let whatsappInstance = null;
  if (instanceId) {
    const { data: instance } = await supabase
      .from('whatsapp_instances').select('*')
      .eq('zapi_instance_id', instanceId).single();
    whatsappInstance = instance;
  }
  if (!whatsappInstance) {
    const { data: instances } = await supabase
      .from('whatsapp_instances').select('*')
      .eq('status', 'connected').limit(1);
    whatsappInstance = instances?.[0];
  }
  if (!whatsappInstance) {
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const organizationId = whatsappInstance.organization_id;
  const contact = await findContactByPhoneOrLid(supabase, phone, organizationId);
  if (!contact) {
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let presenceType: string;
  switch (state) {
    case 'composing': case 'typing': presenceType = 'typing'; break;
    case 'recording': presenceType = 'recording'; break;
    case 'online': case 'available': presenceType = 'online'; break;
    case 'offline': case 'unavailable': presenceType = 'offline'; break;
    default: presenceType = state || 'unknown';
  }

  const expiresAt = new Date(Date.now() + 30000).toISOString();
  await supabase.from('contact_presence').upsert({
    contact_id: contact.id, organization_id: organizationId,
    presence_type: presenceType, started_at: new Date().toISOString(), expires_at: expiresAt,
  }, { onConflict: 'contact_id' });

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ========== SHARED HELPERS ==========

async function findContactByPhoneOrLid(supabase: any, phoneOrLid: string, organizationId: string) {
  // Try exact match
  const { data: contactByPhone } = await supabase
    .from('contacts').select('id')
    .eq('phone', phoneOrLid).eq('organization_id', organizationId).maybeSingle();
  if (contactByPhone) return contactByPhone;

  // Try without country code (legacy data)
  const shortPhone = phoneOrLid.replace(/^55/, '');
  if (shortPhone !== phoneOrLid) {
    const { data: contactByShort } = await supabase
      .from('contacts').select('id')
      .eq('phone', shortPhone).eq('organization_id', organizationId).maybeSingle();
    if (contactByShort) {
      // Fix the number while we're at it
      await supabase.from('contacts').update({ phone: phoneOrLid }).eq('id', contactByShort.id);
      return contactByShort;
    }
  }

  // Try LID metadata
  const { data: contactByLid } = await supabase
    .from('contacts').select('id')
    .eq('organization_id', organizationId)
    .contains('metadata', { chat_lid: phoneOrLid }).maybeSingle();
  return contactByLid || null;
}

async function findOrCreateContactWithLid(
  supabase: any,
  { phone, isLidIdentifier, chatLid, name, avatarUrl, organizationId }: {
    phone: string; isLidIdentifier: boolean; chatLid: string | null;
    name?: string; avatarUrl?: string | null; organizationId: string;
  }
) {
  if (isLidIdentifier && chatLid) {
    const { data: contactByLid } = await supabase
      .from('contacts').select('*')
      .eq('organization_id', organizationId)
      .contains('metadata', { chat_lid: chatLid }).maybeSingle();
    if (contactByLid) {
      if ((name && name !== contactByLid.name) || (avatarUrl && avatarUrl !== contactByLid.avatar_url)) {
        const updateData: any = {};
        if (name && name !== contactByLid.name) updateData.name = name;
        if (avatarUrl && avatarUrl !== contactByLid.avatar_url) updateData.avatar_url = avatarUrl;
        await supabase.from('contacts').update(updateData).eq('id', contactByLid.id);
      }
      return contactByLid;
    }
  }

  // Try exact phone match
  const { data: existingContact } = await supabase
    .from('contacts').select('*')
    .eq('phone', phone).eq('organization_id', organizationId).maybeSingle();

  if (existingContact) {
    const updateData: any = {};
    const currentMetadata = existingContact.metadata || {};
    if (chatLid && !currentMetadata.chat_lid) updateData.metadata = { ...currentMetadata, chat_lid: chatLid };
    if (name && name !== existingContact.name) updateData.name = name;
    if (avatarUrl && avatarUrl !== existingContact.avatar_url) updateData.avatar_url = avatarUrl;
    if (Object.keys(updateData).length > 0) {
      await supabase.from('contacts').update(updateData).eq('id', existingContact.id);
    }
    if (chatLid) await mergeDuplicateContactsAndConversations(supabase, existingContact.id, chatLid, organizationId);
    return existingContact;
  }

  // Try short phone match (legacy without country code)
  const shortPhone = phone.replace(/^55/, '');
  if (shortPhone !== phone) {
    const { data: shortContact } = await supabase
      .from('contacts').select('*')
      .eq('phone', shortPhone).eq('organization_id', organizationId).maybeSingle();
    if (shortContact) {
      const updateData: any = { phone };
      if (name && name !== shortContact.name) updateData.name = name;
      if (avatarUrl && avatarUrl !== shortContact.avatar_url) updateData.avatar_url = avatarUrl;
      await supabase.from('contacts').update(updateData).eq('id', shortContact.id);
      return { ...shortContact, phone };
    }
  }

  const metadata: any = {};
  if (chatLid) metadata.chat_lid = chatLid;

  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({ phone, name: name || null, avatar_url: avatarUrl || null, organization_id: organizationId, metadata })
    .select().single();
  if (error) { console.error('Error creating contact:', error); throw error; }
  return newContact;
}

async function mergeDuplicateContactsAndConversations(supabase: any, primaryContactId: string, chatLid: string, organizationId: string) {
  const { data: duplicateContact } = await supabase
    .from('contacts').select('id')
    .eq('phone', chatLid).eq('organization_id', organizationId)
    .neq('id', primaryContactId).maybeSingle();
  if (!duplicateContact) return;

  const { data: duplicateConversations } = await supabase
    .from('conversations').select('id').eq('contact_id', duplicateContact.id);

  if (duplicateConversations?.length > 0) {
    const { data: primaryConversation } = await supabase
      .from('conversations').select('id')
      .eq('contact_id', primaryContactId).eq('organization_id', organizationId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (primaryConversation) {
      for (const dupConv of duplicateConversations) {
        await supabase.from('messages').update({ conversation_id: primaryConversation.id }).eq('conversation_id', dupConv.id);
      }
      await supabase.from('conversations').delete().eq('contact_id', duplicateContact.id);
    }
  }
  await supabase.from('contacts').delete().eq('id', duplicateContact.id);
}

async function findOrCreateConversation(
  supabase: any,
  { contactId, organizationId, whatsappInstanceId, sourcePhone }: {
    contactId: string; organizationId: string; whatsappInstanceId: string; sourcePhone?: string;
  }
) {
  const { data: anyExisting } = await supabase
    .from('conversations').select('*')
    .eq('contact_id', contactId).eq('organization_id', organizationId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (anyExisting) {
    const updateData: any = {};
    if (anyExisting.source_phone !== sourcePhone) updateData.source_phone = sourcePhone;
    if (anyExisting.status !== 'open' && anyExisting.status !== 'pending') updateData.status = 'open';
    if (Object.keys(updateData).length > 0) {
      await supabase.from('conversations').update(updateData).eq('id', anyExisting.id);
    }
    return { ...anyExisting, ...updateData };
  }

  const { data: newConversation, error } = await supabase
    .from('conversations')
    .upsert({
      contact_id: contactId, organization_id: organizationId,
      whatsapp_instance_id: whatsappInstanceId, source_phone: sourcePhone,
      status: 'open', unread_count: 0,
    }, { onConflict: 'contact_id,organization_id', ignoreDuplicates: false })
    .select().single();

  if (error) {
    if (error.code === '23505') {
      const { data: raceExisting } = await supabase
        .from('conversations').select('*')
        .eq('contact_id', contactId).eq('organization_id', organizationId)
        .limit(1).maybeSingle();
      if (raceExisting) return raceExisting;
    }
    throw error;
  }
  return newConversation;
}

async function checkMasterPromptTriggers(
  supabase: any,
  { organizationId, contactId, messageContent, conversationId }: {
    organizationId: string; contactId: string; messageContent: string; conversationId: string;
  }
): Promise<boolean> {
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
