import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UAZAPIChat {
  id?: string;
  phone?: string;
  jid?: string;
  name?: string;
  profilePicture?: string;
  profileThumbnail?: string;
  unread?: string | number;
  lastMessageTime?: string | number;
  lastMessage?: any;
  isGroup?: boolean | string;
  archive?: boolean;
}

function normalizeTimestamp(value: string | number | undefined): string {
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

function isGroupChat(chat: UAZAPIChat): boolean {
  if (typeof chat.isGroup === 'boolean') return chat.isGroup;
  if (typeof chat.isGroup === 'string') return chat.isGroup.toLowerCase() === 'true';
  const jid = chat.jid || chat.id || chat.phone || '';
  if (jid.includes('@g.us')) return true;
  return false;
}

// Ensure phone has country code (default Brazil 55)
function ensureCountryCode(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  // Already has country code (12+ digits for BR = 55 + DDD(2) + number(8-9))
  if (clean.length >= 12) return clean;
  // Has DDD + number (10-11 digits) - add 55
  if (clean.length >= 10 && clean.length <= 11) return `55${clean}`;
  // Too short - not a valid phone number
  return '';
}

function extractPhone(chat: UAZAPIChat): string | null {
  let raw = '';
  if (chat.phone) {
    raw = chat.phone.replace('@c.us', '').replace('@s.whatsapp.net', '').split(':')[0];
  } else if (chat.jid) {
    raw = chat.jid.split('@')[0].split(':')[0];
  } else if (chat.id) {
    raw = chat.id.split('@')[0].split(':')[0];
  }
  const clean = raw.replace(/\D/g, '');
  if (clean.length < 10 || clean.length > 15) return null;
  const phone = ensureCountryCode(clean);
  if (!phone || !isValidPhoneNumber(phone)) return null;
  return phone;
}

function isValidPhoneNumber(phone: string): boolean {
  if (!phone) return false;
  if (phone.length < 12 || phone.length > 15) return false;
  if (!/^\d+$/.test(phone)) return false;
  // Validate Brazilian DDD (11-99)
  if (phone.startsWith('55')) {
    const ddd = parseInt(phone.substring(2, 4));
    if (ddd < 11 || ddd > 99) return false;
    const numberPart = phone.substring(4);
    if (numberPart.length < 8 || numberPart.length > 9) return false;
  }
  return true;
}

async function fetchContactProfile(uazapiBaseUrl: string, token: string, phone: string): Promise<{ name?: string; profilePicUrl?: string } | null> {
  try {
    const resp = await fetch(`${uazapiBaseUrl}/contact/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': token },
      body: JSON.stringify({ number: phone }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return {
      name: data.name || data.pushname || data.notify || undefined,
      profilePicUrl: data.profilePicUrl || data.profilePictureUrl || data.imgUrl || undefined,
    };
  } catch (e) {
    console.error('Failed to fetch contact profile:', e);
    return null;
  }
}

async function processChatsBatch(
  supabase: any, chats: UAZAPIChat[], organizationId: string, whatsappInstanceId: string,
  uazapiBaseUrl: string, instanceToken: string
): Promise<{ processed: number; errors: string[] }> {
  let processed = 0;
  const errors: string[] = [];

  for (const chat of chats) {
    try {
      const normalizedPhone = extractPhone(chat);
      if (!normalizedPhone || !isValidPhoneNumber(normalizedPhone)) continue;

      let contactName = chat.name || null;
      let contactPhoto = chat.profilePicture || chat.profileThumbnail || null;

      // If no name from chat list, try fetching profile from UAZAPI
      if (!contactName) {
        const profile = await fetchContactProfile(uazapiBaseUrl, instanceToken, normalizedPhone);
        if (profile) {
          if (profile.name) contactName = profile.name;
          if (profile.profilePicUrl) contactPhoto = profile.profilePicUrl;
        }
      }

      let contact;
      // Try to find by exact phone or by partial match
      const { data: existingContact } = await supabase
        .from('contacts').select('*')
        .eq('phone', normalizedPhone).eq('organization_id', organizationId).maybeSingle();

      if (existingContact) {
        contact = existingContact;
        const updateData: Record<string, string> = {};
        if (contactName && contactName !== existingContact.name) updateData.name = contactName;
        if (contactPhoto && contactPhoto !== existingContact.avatar_url) updateData.avatar_url = contactPhoto;
        if (Object.keys(updateData).length > 0) {
          await supabase.from('contacts').update(updateData).eq('id', existingContact.id);
        }
      } else {
        // Check if contact exists with short number (migration scenario)
        const shortPhone = normalizedPhone.replace(/^55/, '');
        const { data: shortContact } = await supabase
          .from('contacts').select('*')
          .eq('phone', shortPhone).eq('organization_id', organizationId).maybeSingle();
        
        if (shortContact) {
          // Update the short number to full international format
          const updateData: Record<string, any> = { phone: normalizedPhone };
          if (contactName && contactName !== shortContact.name) updateData.name = contactName;
          if (contactPhoto && contactPhoto !== shortContact.avatar_url) updateData.avatar_url = contactPhoto;
          await supabase.from('contacts').update(updateData).eq('id', shortContact.id);
          contact = { ...shortContact, phone: normalizedPhone };
        } else {
          const { data: newContact, error: contactError } = await supabase
            .from('contacts').insert({ phone: normalizedPhone, name: contactName, avatar_url: contactPhoto, organization_id: organizationId })
            .select().single();
          if (contactError) { errors.push(`Contact ${normalizedPhone}: ${contactError.message}`); continue; }
          contact = newContact;
        }
      }

      const unreadCount = typeof chat.unread === 'string' ? parseInt(chat.unread, 10) : (chat.unread || 0);
      const lastMessageTime = normalizeTimestamp(chat.lastMessageTime);

      const { data: existingConv } = await supabase
        .from('conversations').select('*')
        .eq('contact_id', contact.id).eq('organization_id', organizationId)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();

      if (existingConv) {
        await supabase.from('conversations').update({
          unread_count: unreadCount, last_message_at: lastMessageTime, whatsapp_instance_id: whatsappInstanceId,
        }).eq('id', existingConv.id);
      } else {
        const { error: convError } = await supabase.from('conversations').insert({
          contact_id: contact.id, organization_id: organizationId, whatsapp_instance_id: whatsappInstanceId,
          source_phone: null, status: 'open', unread_count: unreadCount, last_message_at: lastMessageTime,
        });
        if (convError) { errors.push(`Conversation ${normalizedPhone}: ${convError.message}`); continue; }
      }
      processed++;
    } catch (chatError) {
      errors.push(`Chat ${chat.phone || chat.jid}: ${String(chatError)}`);
    }
  }
  return { processed, errors };
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

    const url = new URL(req.url);
    const requestedInstanceId = url.searchParams.get('instanceId');

    let instance;
    if (requestedInstanceId) {
      const { data } = await supabase
        .from('whatsapp_instances').select('*')
        .eq('id', requestedInstanceId)
        .eq('organization_id', profile.organization_id)
        .eq('status', 'connected')
        .maybeSingle();
      instance = data;
    } else {
      const { data } = await supabase
        .from('whatsapp_instances').select('*')
        .eq('organization_id', profile.organization_id)
        .eq('is_active', true).eq('status', 'connected')
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      instance = data;
    }

    if (!instance) {
      return new Response(JSON.stringify({ error: 'No active connected WhatsApp instance' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch chats from UAZAPI GET /chats
    const chatsUrl = `${uazapiBaseUrl}/chats`;
    const chatsResponse = await fetch(chatsUrl, {
      method: 'GET',
      headers: { 'token': instance.zapi_token }
    });

    if (!chatsResponse.ok) {
      const errorText = await chatsResponse.text();
      console.error('UAZAPI chats error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to fetch chats', details: errorText }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chatsData = await chatsResponse.json();
    const chats: UAZAPIChat[] = Array.isArray(chatsData) ? chatsData : (chatsData.chats || []);

    const individualChats = chats.filter(chat => {
      if (isGroupChat(chat)) return false;
      const phone = extractPhone(chat);
      if (!phone || !isValidPhoneNumber(phone)) return false;
      return true;
    });

    const BATCH_SIZE = 50;
    let totalProcessed = 0;
    const allErrors: string[] = [];

    for (let i = 0; i < individualChats.length; i += BATCH_SIZE) {
      const batch = individualChats.slice(i, i + BATCH_SIZE);
      const { processed, errors } = await processChatsBatch(
        supabase, batch, profile.organization_id, instance.id,
        uazapiBaseUrl, instance.zapi_token
      );
      totalProcessed += processed;
      allErrors.push(...errors);
      if (i + BATCH_SIZE < individualChats.length) await new Promise(resolve => setTimeout(resolve, 100));
    }

    return new Response(JSON.stringify({
      success: true, syncedConversations: totalProcessed, totalChats: chats.length,
      processedChats: individualChats.length, errors: allErrors.length > 0 ? allErrors.slice(0, 10) : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
