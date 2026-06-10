import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessError, assertActiveOrganizationAccess } from '../_shared/access.ts';

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

type Provider = 'evolution' | 'uazapi';

// Build UAZAPI URL with token as query parameter
function uazapiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${path}`;
}

function normalizeBaseUrl(value?: string | null): string {
  return (value || '').trim().replace(/\/$/, '');
}

async function loadConnectionSettings(supabase: any) {
  const { data: row } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'whatsapp_connection_settings')
    .maybeSingle();
  const value = row?.value || {};
  return {
    uazapiBaseUrl: normalizeBaseUrl(value.uazapi_base_url || Deno.env.get('UAZAPI_BASE_URL')),
    evolutionBaseUrl: normalizeBaseUrl(value.evolution_base_url || Deno.env.get('EVOLUTION_BASE_URL')),
    evolutionApiKey: value.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY') || '',
  };
}

async function loadProviderStrategy(supabase: any): Promise<{
  primaryProvider: Provider;
  backupProvider: Provider;
  evolutionEnabled: boolean;
  uazapiEnabled: boolean;
}> {
  const { data: row } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'whatsapp_provider_strategy')
    .maybeSingle();
  const value = row?.value || {};
  return {
    primaryProvider: value.primary_provider === 'uazapi' ? 'uazapi' : 'evolution',
    backupProvider: value.backup_provider === 'evolution' ? 'evolution' : 'uazapi',
    evolutionEnabled: value.evolution_enabled ?? true,
    uazapiEnabled: value.uazapi_enabled ?? true,
  };
}

function guessMimeType(type: string, mediaUrl?: string): string {
  const lower = (mediaUrl || '').toLowerCase();
  if (type === 'image') {
    if (lower.includes('.png')) return 'image/png';
    if (lower.includes('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
  if (type === 'audio') {
    if (lower.includes('.ogg')) return 'audio/ogg';
    if (lower.includes('.mpeg') || lower.includes('.mp3')) return 'audio/mpeg';
    if (lower.includes('.webm')) return 'audio/webm';
    if (lower.includes('.m4a') || lower.includes('.mp4')) return 'audio/mp4';
    return 'audio/mp4';
  }
  if (type === 'document') {
    if (lower.includes('.pdf')) return 'application/pdf';
    return 'application/octet-stream';
  }
  return 'application/octet-stream';
}

function fileNameFromUrl(mediaUrl?: string, fallback = 'arquivo') {
  if (!mediaUrl) return fallback;
  try {
    const pathname = new URL(mediaUrl).pathname;
    const name = pathname.split('/').filter(Boolean).pop();
    return name || fallback;
  } catch {
    return fallback;
  }
}

async function validatePublicMediaUrl(mediaUrl: string): Promise<{
  ok: boolean;
  status?: number;
  contentType?: string | null;
  error?: string;
}> {
  try {
    const headResponse = await fetch(mediaUrl, { method: 'HEAD' });
    if (headResponse.ok) {
      return {
        ok: true,
        status: headResponse.status,
        contentType: headResponse.headers.get('content-type'),
      };
    }

    if (headResponse.status !== 405) {
      return {
        ok: false,
        status: headResponse.status,
        contentType: headResponse.headers.get('content-type'),
        error: await headResponse.text().catch(() => ''),
      };
    }
  } catch (error) {
    console.warn('Media HEAD validation failed, trying ranged GET:', error);
  }

  try {
    const getResponse = await fetch(mediaUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    });
    return {
      ok: getResponse.ok || getResponse.status === 206,
      status: getResponse.status,
      contentType: getResponse.headers.get('content-type'),
      error: getResponse.ok || getResponse.status === 206 ? undefined : await getResponse.text().catch(() => ''),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function sanitizeSendBody(body: Record<string, any>) {
  const sanitized = { ...body };
  for (const key of ['media', 'file', 'audio']) {
    if (sanitized[key]) sanitized[key] = '[media_url]';
  }
  return sanitized;
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

function providerEnabled(provider: Provider, strategy: Awaited<ReturnType<typeof loadProviderStrategy>>) {
  return provider === 'evolution' ? strategy.evolutionEnabled : strategy.uazapiEnabled;
}

function providerDisplayName(provider: Provider, connectionSettings: Awaited<ReturnType<typeof loadConnectionSettings>>) {
  if (provider === 'evolution') return 'Evolution';
  if (connectionSettings.uazapiBaseUrl.includes('automahub')) return 'Automahub';
  return 'provedor WhatsApp';
}

function providerAuthErrorMessage(
  provider: Provider,
  rawError: string,
  connectionSettings: Awaited<ReturnType<typeof loadConnectionSettings>>,
) {
  const displayName = providerDisplayName(provider, connectionSettings);
  const text = rawError || '';
  try {
    const parsed = JSON.parse(text);
    if (parsed?.code === 401 || /invalid token/i.test(parsed?.message || '')) {
      return provider === 'uazapi'
        ? `Token da instancia ${displayName} invalido. Reconecte a instancia ou atualize o token salvo.`
        : `Credenciais da instancia ${displayName} invalidas. Confira API key, URL e nome da instancia.`;
    }
    return parsed?.message || parsed?.error || text;
  } catch {
    if (/invalid token|unauthorized|401/i.test(text)) {
      return provider === 'uazapi'
        ? `Token da instancia ${displayName} invalido. Reconecte a instancia ou atualize o token salvo.`
        : `Credenciais da instancia ${displayName} invalidas. Confira API key, URL e nome da instancia.`;
    }
    return text;
  }
}

async function resolveSendInstance(
  supabase: any,
  organizationId: string,
  conversationInstanceId: string | null | undefined,
) {
  const strategy = await loadProviderStrategy(supabase);
  const preferredProviders: Provider[] = [];
  if (providerEnabled(strategy.primaryProvider, strategy)) preferredProviders.push(strategy.primaryProvider);
  if (
    strategy.backupProvider !== strategy.primaryProvider &&
    providerEnabled(strategy.backupProvider, strategy)
  ) {
    preferredProviders.push(strategy.backupProvider);
  }

  const { data: connectedInstances } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'connected')
    .order('created_at', { ascending: false });

  const instances = connectedInstances || [];
  const conversationInstance = conversationInstanceId
    ? instances.find((item: any) => item.id === conversationInstanceId)
    : null;
  if (conversationInstance) {
    console.log(
      `[SEND_ROUTING] Using conversation instance ${conversationInstance.id} ` +
      `(${conversationInstance.provider || 'uazapi'}).`
    );
    return conversationInstance;
  }

  for (const provider of preferredProviders) {
    const providerInstance = instances.find((item: any) => (item.provider || 'uazapi') === provider);
    if (providerInstance) {
      return providerInstance;
    }
  }

  return null;
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
    const connectionSettings = await loadConnectionSettings(supabase);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { conversationId, content, type = 'text', mediaUrl, quotedMessageId, quotedContent, quotedSender } = await req.json() as SendMessageRequest;

    if (!conversationId || (type === 'text' && !content)) {
      return new Response(JSON.stringify({ error: type === 'text' ? 'conversationId and content are required' : 'conversationId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get conversation with contact info
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`*, contact:contacts(id, phone, name)`)
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    await assertActiveOrganizationAccess(supabase, user.id, conversation.organization_id, { module: 'conversations' });

    const instance = await resolveSendInstance(
      supabase,
      conversation.organization_id,
      conversation.whatsapp_instance_id,
    );

    if (!instance) {
      return new Response(JSON.stringify({ error: 'No connected WhatsApp instance' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const provider = instance.provider === 'evolution' ? 'evolution' : 'uazapi';
    const instanceToken = instance.zapi_token;
    const phone = conversation.contact.phone;
    const normalizedPhone = phone.replace(/\D/g, '');
    const mediaSendDiagnostics: Record<string, any> | null = type !== 'text'
      ? {
        provider,
        type,
        media_url: mediaUrl || null,
        created_at: new Date().toISOString(),
      }
      : null;

    if (type !== 'text') {
      if (!mediaUrl) {
        return new Response(JSON.stringify({ error: 'mediaUrl is required for media messages' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const mediaValidation = await validatePublicMediaUrl(mediaUrl);
      if (mediaSendDiagnostics) mediaSendDiagnostics.media_validation = mediaValidation;
      if (!mediaValidation.ok) {
        const { data: failedMessage } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            content: content || '',
            type,
            direction: 'outbound',
            is_from_bot: false,
            sent_by: user.id,
            media_url: mediaUrl || null,
            metadata: {
              provider,
              media_send: {
                ...mediaSendDiagnostics,
                failed_stage: 'media_url_validation',
              },
            },
            failed_at: new Date().toISOString(),
            error_message: 'Arquivo de midia nao esta acessivel publicamente para o provedor WhatsApp.',
          })
          .select()
          .maybeSingle();

        return new Response(JSON.stringify({
          error: 'Arquivo de midia nao esta acessivel publicamente para o provedor WhatsApp.',
          messageId: failedMessage?.id || null,
          details: mediaValidation,
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (provider === 'uazapi') {
      if (!connectionSettings.uazapiBaseUrl) {
        return new Response(JSON.stringify({ error: 'URL do provedor WhatsApp nao configurada' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!instanceToken) {
        return new Response(JSON.stringify({
          error: `Instancia ${providerDisplayName(provider, connectionSettings)} sem token salvo. Reconecte a instancia antes de enviar mensagens.`,
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (provider === 'uazapi') {
      // Typing/Recording presence via UAZAPI (Fire and forget, no delay)
      try {
        const presenceType = type === 'audio' ? 'recording' : 'composing';
        fetch(uazapiUrl(connectionSettings.uazapiBaseUrl, '/message/presence'), {
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
    }

    // Look up the zapi_message_id for the quoted message (for WhatsApp reply)
    let zapiQuotedMsgId: string | null = null;
    let zapiQuotedFromMe = false;
    if (quotedMessageId) {
      const { data: quotedMsg } = await supabase
        .from('messages')
        .select('zapi_message_id, direction')
        .eq('id', quotedMessageId)
        .maybeSingle();
      zapiQuotedMsgId = normalizeReplyMessageId(quotedMsg?.zapi_message_id);
      zapiQuotedFromMe = quotedMsg?.direction === 'outbound';
      console.log(`Quoted message lookup: id=${quotedMessageId}, raw_zapi_id=${quotedMsg?.zapi_message_id || null}, reply_id=${zapiQuotedMsgId}`);
    }

    if (provider === 'evolution') {
      const evolutionBaseUrl = connectionSettings.evolutionBaseUrl;
      const evolutionApiKey = instance.evolution_api_key || connectionSettings.evolutionApiKey || instanceToken;
      const instanceName = instance.evolution_instance_name || instance.zapi_instance_id;

      if (!evolutionBaseUrl || !evolutionApiKey || !instanceName) {
        return new Response(JSON.stringify({ error: 'Evolution API not configured for this instance' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let endpoint = `${evolutionBaseUrl}/message/sendText/${instanceName}`;
      let body: Record<string, any> = {
        number: normalizedPhone,
        text: content,
        delay: 1000,
        linkPreview: true,
      };

      if (type !== 'text') {
        if (!mediaUrl) {
          return new Response(JSON.stringify({ error: 'mediaUrl is required for media messages' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (type === 'audio') {
          endpoint = `${evolutionBaseUrl}/message/sendWhatsAppAudio/${instanceName}`;
          body = {
            number: normalizedPhone,
            audio: mediaUrl,
            delay: 1000,
            linkPreview: true,
          };
        } else {
          endpoint = `${evolutionBaseUrl}/message/sendMedia/${instanceName}`;
          body = {
            number: normalizedPhone,
            mediatype: type,
            mimetype: guessMimeType(type, mediaUrl),
            caption: content,
            media: mediaUrl,
            fileName: fileNameFromUrl(mediaUrl, `${type}-${Date.now()}`),
            delay: 1000,
            linkPreview: true,
          };
        }
      }

      if (zapiQuotedMsgId) {
        body.quoted = {
          key: {
            remoteJid: `${normalizedPhone}@s.whatsapp.net`,
            fromMe: zapiQuotedFromMe,
            id: zapiQuotedMsgId,
          },
          message: { conversation: quotedContent || '' },
        };
      }

      console.log('Evolution send URL:', endpoint);
      console.log('Evolution send body:', JSON.stringify({ ...body, media: body.media ? '[media]' : undefined }));
      if (mediaSendDiagnostics) {
        mediaSendDiagnostics.endpoint = endpoint;
        mediaSendDiagnostics.request_body = sanitizeSendBody(body);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: evolutionApiKey,
        },
        body: JSON.stringify(body),
      });

      let evolutionResult: any = null;
      let zapiMsgId: string | null = null;
      let sendFailed = false;
      let sendErrorText = '';

      const raw = await response.text();
      if (mediaSendDiagnostics) {
        mediaSendDiagnostics.response_status = response.status;
        mediaSendDiagnostics.response_ok = response.ok;
      }
      if (!response.ok) {
        sendErrorText = raw;
        if (mediaSendDiagnostics) mediaSendDiagnostics.response_error = raw.substring(0, 500);
        console.error('Evolution send error (will save to DB anyway):', sendErrorText);
        sendFailed = true;
      } else {
        try { evolutionResult = raw ? JSON.parse(raw) : {}; } catch { evolutionResult = { raw }; }
        if (mediaSendDiagnostics) {
          mediaSendDiagnostics.response_keys = evolutionResult && typeof evolutionResult === 'object'
            ? Object.keys(evolutionResult).slice(0, 12)
            : ['raw'];
        }
        zapiMsgId = evolutionResult.messageId || evolutionResult.id || evolutionResult.key?.id || null;

        if (zapiMsgId) {
          const { data: existing } = await supabase
            .from('messages')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('zapi_message_id', zapiMsgId)
            .maybeSingle();
          if (existing) {
            return new Response(JSON.stringify({ success: true, messageId: existing.id, zapiMessageId: zapiMsgId }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }

      const messageMetadata: Record<string, any> = sendFailed
        ? { provider, send_error: sendErrorText, failed_at: new Date().toISOString() }
        : { provider, evolution_response: evolutionResult };
      if (mediaSendDiagnostics) {
        messageMetadata.media_send = {
          ...mediaSendDiagnostics,
          failed_stage: sendFailed ? 'provider_send' : null,
        };
      }

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
          content: content || '',
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
          error: 'Failed to send message via Evolution, but message was saved',
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
        zapiMessageId: zapiMsgId || evolutionResult?.messageId || evolutionResult?.key?.id,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let endpoint: string;
    let body: Record<string, any>;

    switch (type) {
      case 'text':
        endpoint = uazapiUrl(connectionSettings.uazapiBaseUrl, '/send/text');
        body = { number: normalizedPhone, text: content };
        if (zapiQuotedMsgId) body.replyid = zapiQuotedMsgId;
        break;
      case 'image':
        endpoint = uazapiUrl(connectionSettings.uazapiBaseUrl, '/send/media');
        body = { number: normalizedPhone, file: mediaUrl, type: 'image' };
        if (content) body.caption = content;
        if (zapiQuotedMsgId) body.replyid = zapiQuotedMsgId;
        break;
      case 'audio':
        endpoint = uazapiUrl(connectionSettings.uazapiBaseUrl, '/send/media');
        body = {
          number: normalizedPhone,
          file: mediaUrl,
          type: 'audio',
          mimetype: guessMimeType(type, mediaUrl),
          mimeType: guessMimeType(type, mediaUrl),
          fileName: fileNameFromUrl(mediaUrl, `audio-${Date.now()}`),
          ptt: true,
        };
        if (zapiQuotedMsgId) body.replyid = zapiQuotedMsgId;
        break;
      case 'document':
        endpoint = uazapiUrl(connectionSettings.uazapiBaseUrl, '/send/media');
        body = { number: normalizedPhone, file: mediaUrl, caption: content, type: 'document' };
        if (zapiQuotedMsgId) body.replyid = zapiQuotedMsgId;
        break;
      default:
        return new Response(JSON.stringify({ error: 'Invalid message type' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    console.log('UAZAPI send URL:', endpoint.replace(instanceToken, '***'));
    console.log('UAZAPI send body:', JSON.stringify(body));
    if (mediaSendDiagnostics) {
      mediaSendDiagnostics.endpoint = endpoint;
      mediaSendDiagnostics.request_body = sanitizeSendBody(body);
    }

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
      if (mediaSendDiagnostics) {
        mediaSendDiagnostics.response_status = response.status;
        mediaSendDiagnostics.response_ok = false;
        mediaSendDiagnostics.response_error = sendErrorText.substring(0, 500);
      }
      console.error('UAZAPI send error (will save to DB anyway):', sendErrorText);
      sendFailed = true;
    } else {
      uazapiResult = await response.json();
      if (mediaSendDiagnostics) {
        mediaSendDiagnostics.response_status = response.status;
        mediaSendDiagnostics.response_ok = true;
        mediaSendDiagnostics.response_keys = uazapiResult && typeof uazapiResult === 'object'
          ? Object.keys(uazapiResult).slice(0, 12)
          : [];
      }
      zapiMsgId = uazapiResult.messageId || uazapiResult.id || uazapiResult.ID || uazapiResult.key?.id || null;

      // Manual check since we don't have UNIQUE constraint yet
      if (zapiMsgId) {
        const { data: existing } = await supabase
          .from('messages')
          .select('id')
          .eq('conversation_id', conversationId)
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
    if (mediaSendDiagnostics) {
      messageMetadata.provider = provider;
      messageMetadata.media_send = {
        ...mediaSendDiagnostics,
        failed_stage: sendFailed ? 'provider_send' : null,
      };
    }

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
        content: content || '',
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
      const friendlyError = providerAuthErrorMessage(provider, sendErrorText, connectionSettings);
      return new Response(JSON.stringify({
        success: false,
        error: friendlyError || 'Failed to send message via WhatsApp, but message was saved',
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
    if (error instanceof AccessError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
