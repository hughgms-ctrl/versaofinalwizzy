import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Accept global WhatsApp/E.164-style numbers without assuming a country.
function ensureCountryCode(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  return isValidPhoneNumber(clean) ? clean : '';
}

function isValidPhoneNumber(phone: string): boolean {
  if (!phone) return false;
  const clean = phone.replace(/\D/g, '');
  return /^\d{8,15}$/.test(clean);
}

function normalizeTimestamp(value: any): string {
  if (!value) return new Date().toISOString();
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  const MIN_TIMESTAMP = 946684800;
  const MAX_TIMESTAMP = 4102444800;
  let timestampSeconds = num;
  if (num > MAX_TIMESTAMP * 1000) return new Date().toISOString();
  else if (num > MAX_TIMESTAMP) timestampSeconds = Math.floor(num / 1000);
  if (timestampSeconds < MIN_TIMESTAMP || timestampSeconds > MAX_TIMESTAMP) return new Date().toISOString();
  return new Date(timestampSeconds * 1000).toISOString();
}

function extractMessageContent(msg: any): { type: string; content: string | null; mediaUrl: string | null } {
  if (msg.message?.conversation || msg.message?.extendedTextMessage) {
    return {
      type: 'text',
      content: msg.message.conversation || msg.message.extendedTextMessage?.text || null,
      mediaUrl: null,
    };
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

    const { conversationId, amount = 30 } = await req.json();

    if (!conversationId) {
      return new Response(JSON.stringify({ error: 'conversationId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*, contact:contacts(phone), whatsapp_instance:whatsapp_instances(*)')
      .eq('id', conversationId)
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

    const contactPhone = conversation.contact?.phone;
    if (!contactPhone) {
      return new Response(JSON.stringify({ error: 'Contact phone not found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fetchUazapi = async (url: string, token: string, method = 'GET', body: any = null): Promise<Response> => {
      const options: any = {
        method,
        headers: { 'token': token, 'Content-Type': 'application/json' },
      };
      if (body) options.body = JSON.stringify(body);
      return await fetch(url, options);
    };

    // Candidate endpoints for messages
    const candidates = [
      { url: `${uazapiBaseUrl}/message/find`, method: 'POST', body: { where: { chatJid: contactPhone } } },
      { url: `${uazapiBaseUrl}/messages/${contactPhone}?limit=${amount}`, method: 'GET' },
      { url: `${uazapiBaseUrl}/instance/messages/${contactPhone}?limit=${amount}`, method: 'GET' },
    ];

    let messagesResponse: Response | null = null;
    let successfulUrl = '';

    for (const cand of candidates) {
      console.log(`[DEBUG] Attempting to fetch messages from: ${cand.method} ${cand.url}`);
      try {
        const resp = await fetchUazapi(cand.url, instance.zapi_token, cand.method, cand.body);
        if (resp.ok) {
          messagesResponse = resp;
          successfulUrl = cand.url;
          console.log(`[DEBUG] Successfully fetched messages from: ${cand.url}`);
          break;
        }
      } catch (e) {
        console.error(`[DEBUG] Error fetching messages from ${cand.url}:`, e);
      }
    }

    if (!messagesResponse || !messagesResponse.ok) {
      const errorText = messagesResponse ? await messagesResponse.text() : 'ALL_ENDPOINTS_FAILED';
      console.error('Error fetching messages from UAZAPI:', errorText);
      return new Response(JSON.stringify({
        success: true, syncedMessages: 0, skippedMessages: 0, totalFromAPI: 0,
        message: 'Could not fetch messages from UAZAPI', details: errorText,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const messagesResponseText = await messagesResponse.text();
    console.log(`[DEBUG] Raw messages response (first 200): ${messagesResponseText.substring(0, 200)}`);

    let messagesData: any;
    try {
      messagesData = JSON.parse(messagesResponseText);
    } catch (e) {
      console.error('Failed to parse messages JSON:', e);
      return new Response(JSON.stringify({ error: 'Invalid JSON from UAZAPI' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const messages = Array.isArray(messagesData) ? messagesData : (messagesData.data || messagesData.messages || []);
    console.log(`Got ${messages.length} messages from UAZAPI for chat ${contactPhone}`);

    // Determine the expected JID format for validation
    const expectedJid = contactPhone.includes('@') ? contactPhone : `${contactPhone}@s.whatsapp.net`;
    const expectedLid = contactPhone.includes('@lid') ? contactPhone : null;

    let syncedCount = 0;
    let skippedCount = 0;

    if (messages.length > 0) {
      console.log(`[DEBUG] First message data: ${JSON.stringify(messages[0]).substring(0, 300)}`);
    }

    for (const msg of messages) {
      // SECURITY: Ensure this specific message really belongs to this conversation
      const remoteJid = msg.key?.remoteJid || msg.remoteJid || msg.jid || msg.chatJid || msg.from || msg.to;

      if (!remoteJid) {
        console.warn(`[SECURITY] Skipping message because remoteJid is missing for message ID: ${msg.id || msg.key?.id}`);
        skippedCount++;
        continue;
      }

      // Aggressive cleaning for remoteJid (remove device suffix)
      const remoteDigits = remoteJid.split('@')[0].split(':')[0].split('.')[0].replace(/\D/g, '');
      const cleanRemote = (remoteDigits.startsWith('55') && remoteDigits.length > 13) ? remoteDigits.substring(0, 13) : remoteDigits;

      const digitsOnly = contactPhone.replace(/\D/g, '');
      const cleanDigits = (digitsOnly.startsWith('55') && digitsOnly.length > 13) ? digitsOnly.substring(0, 13) : digitsOnly;

      const isMatch = remoteDigits === digitsOnly ||
        cleanRemote === cleanDigits ||
        remoteJid === expectedJid ||
        (expectedLid && remoteJid === expectedLid);

      if (!isMatch) {
        // Fallback: only trust startsWith if contactPhone is long enough (11+ digits for international)
        const isLongPhone = digitsOnly.length >= 11;
        const startsWithMatch = isLongPhone && (remoteJid.startsWith(contactPhone) || remoteJid.startsWith(digitsOnly));

        if (!startsWithMatch) {
          if (syncedCount === 0 && skippedCount < 3) {
            console.log(`[SECURITY] Skipping ${remoteJid} for chat ${contactPhone} (Clean: ${cleanRemote} vs ${cleanDigits})`);
          }
          skippedCount++;
          continue;
        }
      }

      const msgId = msg.key?.id || msg.messageId || msg.id;
      if (!msgId) { skippedCount++; continue; }

      const { data: existingMsg } = await supabase
        .from('messages').select('id').eq('zapi_message_id', msgId).maybeSingle();
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

    await supabase.from('conversations').update({ last_synced_at: new Date().toISOString() }).eq('id', conversationId);

    return new Response(JSON.stringify({
      success: true, syncedMessages: syncedCount, skippedMessages: skippedCount, totalFromAPI: messages.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Sync messages error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
