import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImportedMessage {
  timestamp?: string | number;
  time?: string;
  date?: string;
  sender?: string;
  from?: string;
  content?: string;
  body?: string;
  text?: string;
  message?: string;
  type?: string;
  mediaUrl?: string;
  media_url?: string;
}

interface ImportedChat {
  contact?: {
    name?: string;
    phone?: string;
    number?: string;
    pushname?: string;
  };
  name?: string;
  phone?: string;
  id?: string;
  messages?: ImportedMessage[];
}

function normalizePhone(phone: string): string {
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '');

  // Handle @c.us or @s.whatsapp.net suffixes
  digits = digits.split('@')[0];

  // Ensure it starts with country code (assume Brazil if not)
  if (digits.length === 11 && digits.startsWith('9')) {
    digits = '55' + digits;
  } else if (digits.length === 10) {
    digits = '55' + digits;
  }

  return digits;
}

function parseTimestamp(value: string | number | undefined, date?: string, time?: string): Date {
  // If we have date and time strings
  if (date && time) {
    try {
      // Handle DD/MM/YYYY format
      const [day, month, year] = date.split('/');
      const dateStr = `${year}-${month}-${day}T${time}`;
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) return parsed;
    } catch (e) {
      // Fall through
    }
  }

  if (!value) return new Date();

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  if (typeof value === 'number') {
    // Check if seconds or milliseconds
    if (value < 10000000000) {
      return new Date(value * 1000);
    }
    return new Date(value);
  }

  return new Date();
}

function generateMessageId(phone: string, timestamp: Date, content: string): string {
  // Create a unique hash for deduplication
  const hash = btoa(encodeURIComponent(`${phone}_${timestamp.getTime()}_${content.slice(0, 50)}`))
    .replace(/[+/=]/g, '')
    .slice(0, 32);
  return `import_${hash}`;
}

function cleanOriginPhone(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).split('@')[0].split(':')[0];
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

function getConnectedPhoneSnapshot(instance: any): string | null {
  const candidates = [
    instance?.phone_number,
    instance?.logical_phone,
    instance?.provider_settings?.phone_number,
    instance?.provider_settings?.phoneNumber,
    instance?.provider_settings?.connected_phone,
    instance?.provider_settings?.connectedPhone,
  ];

  for (const candidate of candidates) {
    const phone = cleanOriginPhone(candidate);
    if (phone) return phone;
  }

  return null;
}

async function recordConversationOriginAudit(
  supabase: any,
  organizationId: string,
  conversationId: string,
  instance: any,
  messageId: string | null,
  capturedFrom: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    const { error } = await supabase.rpc('record_conversation_origin_audit', {
      _organization_id: organizationId,
      _conversation_id: conversationId,
      _whatsapp_instance_id: instance?.id || null,
      _message_id: messageId,
      _connected_phone: getConnectedPhoneSnapshot(instance),
      _provider: instance?.provider || null,
      _provider_instance_id: instance?.evolution_instance_id || instance?.zapi_instance_id || null,
      _provider_instance_name: instance?.evolution_instance_name || instance?.zapi_instance_id || null,
      _captured_from: capturedFrom,
      _metadata: metadata,
    });

    if (error) console.error('[ORIGIN_AUDIT] Failed to record origin:', error);
  } catch (error) {
    console.error('[ORIGIN_AUDIT] Failed to record origin:', error);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get organization ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.organization_id) {
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const organizationId = profile.organization_id;

    // Get WhatsApp instance for this org
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    const { chats } = await req.json() as { chats: ImportedChat[] };

    if (!chats || !Array.isArray(chats)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: chats array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let conversationsImported = 0;
    let messagesImported = 0;
    let contactsCreated = 0;
    const errors: string[] = [];

    for (const chat of chats) {
      try {
        // Extract contact info - handle various formats
        const contactName = chat.contact?.name || chat.contact?.pushname || chat.name || 'Contato Importado';
        const contactPhone = normalizePhone(
          chat.contact?.phone || chat.contact?.number || chat.phone || chat.id || ''
        );

        if (!contactPhone || contactPhone.length < 10) {
          errors.push(`Chat ignorado: número inválido`);
          continue;
        }

        // Find or create contact
        let { data: existingContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('phone', contactPhone)
          .single();

        let contactId: string;

        if (existingContact) {
          contactId = existingContact.id;
        } else {
          const { data: newContact, error: contactError } = await supabase
            .from('contacts')
            .insert({
              organization_id: organizationId,
              phone: contactPhone,
              name: contactName,
            })
            .select('id')
            .single();

          if (contactError) {
            errors.push(`Erro ao criar contato ${contactPhone}: ${contactError.message}`);
            continue;
          }
          contactId = newContact.id;
          contactsCreated++;
        }

        // Find or create conversation
        let existingConversationQuery = supabase
          .from('conversations')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('contact_id', contactId);

        existingConversationQuery = instance?.id
          ? existingConversationQuery.eq('whatsapp_instance_id', instance.id)
          : existingConversationQuery.is('whatsapp_instance_id', null);

        const { data: existingConversation } = await existingConversationQuery.maybeSingle();

        let conversationId: string;

        if (existingConversation) {
          conversationId = existingConversation.id;
        } else {
          const { data: newConversation, error: convError } = await supabase
            .from('conversations')
            .insert({
              organization_id: organizationId,
              contact_id: contactId,
              whatsapp_instance_id: instance?.id || null,
              status: 'open',
            })
            .select('id')
            .single();

          if (convError) {
            errors.push(`Erro ao criar conversa para ${contactPhone}: ${convError.message}`);
            continue;
          }
          conversationId = newConversation.id;
          conversationsImported++;
        }

        await recordConversationOriginAudit(
          supabase,
          organizationId,
          conversationId,
          instance,
          null,
          'import-whatsapp-history:conversation',
          { contactPhone },
        );

        // Import messages
        const messages = chat.messages || [];
        const messagesToInsert: any[] = [];

        for (const msg of messages) {
          const content = msg.content || msg.body || msg.text || msg.message || '';
          if (!content && !msg.mediaUrl && !msg.media_url) continue;

          const timestamp = parseTimestamp(msg.timestamp, msg.date, msg.time);
          const sender = msg.sender || msg.from || 'unknown';
          const isOutbound = sender === 'me' || sender === 'sent' || sender === 'outbound';

          const zapiMessageId = generateMessageId(contactPhone, timestamp, content);

          messagesToInsert.push({
            conversation_id: conversationId,
            direction: isOutbound ? 'outbound' : 'inbound',
            type: msg.type || 'text',
            content: content || null,
            media_url: msg.mediaUrl || msg.media_url || null,
            zapi_message_id: zapiMessageId,
            created_at: timestamp.toISOString(),
            is_from_bot: false,
          });
        }

        if (messagesToInsert.length > 0) {
          // Use upsert with ON CONFLICT DO NOTHING to avoid duplicates
          const { error: insertError, data: inserted } = await supabase
            .from('messages')
            .upsert(messagesToInsert, {
              onConflict: 'conversation_id,zapi_message_id',
              ignoreDuplicates: true
            })
            .select('id, zapi_message_id, direction');

          if (insertError) {
            errors.push(`Erro ao inserir mensagens para ${contactPhone}: ${insertError.message}`);
          } else {
            messagesImported += inserted?.length || 0;
            for (const message of inserted || []) {
              await recordConversationOriginAudit(
                supabase,
                organizationId,
                conversationId,
                instance,
                message.id,
                'import-whatsapp-history:message',
                {
                  contactPhone,
                  messageProviderId: message.zapi_message_id || null,
                  direction: message.direction || null,
                },
              );
            }
          }

          // Update last_message_at
          const lastMessage = messagesToInsert[messagesToInsert.length - 1];
          await supabase
            .from('conversations')
            .update({ last_message_at: lastMessage.created_at })
            .eq('id', conversationId)
            .lt('last_message_at', lastMessage.created_at);
        }

        if (!existingConversation) {
          conversationsImported++;
        }
      } catch (chatError: any) {
        errors.push(`Erro no chat: ${chatError.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        conversationsImported,
        messagesImported,
        contactsCreated,
        errors: errors.slice(0, 10), // Limit errors returned
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
