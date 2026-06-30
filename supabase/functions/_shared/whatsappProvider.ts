export type WhatsAppProvider = 'evolution' | 'uazapi';

export type WhatsAppSendType = 'text' | 'image' | 'video' | 'audio' | 'document';

export interface WhatsAppSendRequest {
  organizationId: string;
  phone: string;
  text?: string | null;
  type?: WhatsAppSendType;
  mediaUrl?: string | null;
  caption?: string | null;
  conversationInstanceId?: string | null;
  // When true, `phone` is treated as a WhatsApp group JID (e.g. 120363...@g.us)
  // and is NOT normalized to digits. Evolution/UAZAPI accept the group JID in the
  // `number` field for sendText/sendMedia/sendWhatsAppAudio.
  isGroup?: boolean;
}

export interface WhatsAppSendResult {
  ok: boolean;
  status: number;
  provider: WhatsAppProvider;
  instance: any;
  zapiMessageId: string | null;
  responseText: string;
  responseJson: any;
}

function normalizeBaseUrl(value?: string | null): string {
  return (value || '').trim().replace(/\/$/, '');
}

function normalizePhone(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

function uazapiUrl(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

function guessMimeType(type: WhatsAppSendType, mediaUrl?: string | null): string {
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
  if (type === 'video') {
    if (lower.includes('.webm')) return 'video/webm';
    if (lower.includes('.3gp')) return 'video/3gpp';
    return 'video/mp4';
  }
  if (type === 'document') {
    if (lower.includes('.pdf')) return 'application/pdf';
    return 'application/octet-stream';
  }
  return 'application/octet-stream';
}

function fileNameFromUrl(mediaUrl?: string | null, fallback = 'arquivo') {
  if (!mediaUrl) return fallback;
  try {
    const pathname = new URL(mediaUrl).pathname;
    return pathname.split('/').filter(Boolean).pop() || fallback;
  } catch {
    return fallback;
  }
}

function parseJson(value: string): any {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function extractMessageId(payload: any): string | null {
  return payload?.messageId || payload?.zapiMessageId || payload?.id || payload?.ID || payload?.key?.id || null;
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
  primaryProvider: WhatsAppProvider;
  backupProvider: WhatsAppProvider;
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

function providerEnabled(provider: WhatsAppProvider, strategy: Awaited<ReturnType<typeof loadProviderStrategy>>) {
  return provider === 'evolution' ? strategy.evolutionEnabled : strategy.uazapiEnabled;
}

export async function resolveWhatsAppInstance(
  supabase: any,
  organizationId: string,
  conversationInstanceId?: string | null,
) {
  const strategy = await loadProviderStrategy(supabase);
  const preferredProviders: WhatsAppProvider[] = [];
  if (providerEnabled(strategy.primaryProvider, strategy)) preferredProviders.push(strategy.primaryProvider);
  if (strategy.backupProvider !== strategy.primaryProvider && providerEnabled(strategy.backupProvider, strategy)) {
    preferredProviders.push(strategy.backupProvider);
  }

  const { data: instances, error } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'connected')
    .order('created_at', { ascending: false });

  if (error || !instances?.length) return null;

  const conversationInstance = conversationInstanceId
    ? instances.find((item: any) => item.id === conversationInstanceId)
    : null;
  if (conversationInstance) return conversationInstance;

  // Prefer the instance the org marked as active (the number actually "in use").
  // This mirrors how the conversations RLS (get_active_instance_id) and
  // zapi-sync-chats pick the instance, and stops group/message operations from
  // hitting an arbitrary connected number when several are linked to the org.
  for (const provider of preferredProviders) {
    const active = instances.find(
      (item: any) => (item.provider || 'uazapi') === provider && item.is_active,
    );
    if (active) return active;
  }

  // Fallback: no active instance for the preferred providers — keep the previous
  // behavior of returning the first connected instance matching the preference.
  for (const provider of preferredProviders) {
    const instance = instances.find((item: any) => (item.provider || 'uazapi') === provider);
    if (instance) return instance;
  }

  return null;
}

export interface WorkspaceInstanceBinding {
  // true quando a conversa pertence a um workspace que NÃO tem número associado.
  // Nesse caso o envio DEVE ser recusado — nunca caímos no fallback por
  // organização (que pegaria o primeiro número conectado de outro workspace).
  blocked: boolean;
  // id da instância designada do workspace, quando o workspace tem um número.
  workspaceInstanceId: string | null;
}

// Regra de negócio: uma conversa dentro de um workspace só pode enviar pelo
// número atrelado a esse workspace. Se o workspace não tem número associado,
// recusamos o envio (blocked=true). Conversas SEM workspace não bloqueiam e
// mantêm o comportamento anterior (fallback por organização a cargo do caller).
export async function resolveWorkspaceInstanceBinding(
  supabase: any,
  organizationId: string,
  workspaceId: string | null | undefined,
): Promise<WorkspaceInstanceBinding> {
  if (!workspaceId) return { blocked: false, workspaceInstanceId: null };

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('whatsapp_instance_id')
    .eq('id', workspaceId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  const workspaceInstanceId = workspace?.whatsapp_instance_id || null;
  return { blocked: !workspaceInstanceId, workspaceInstanceId };
}

// Resolve Evolution API base URL + apikey + instance name for a given instance row,
// using the same precedence as sendWhatsAppMessage. Used by group management endpoints.
export async function getEvolutionConfig(
  supabase: any,
  instance: any,
): Promise<{ baseUrl: string; apiKey: string; instanceName: string }> {
  const settings = await loadConnectionSettings(supabase);
  const apiKey = instance.evolution_api_key || settings.evolutionApiKey || instance.zapi_token || '';
  const instanceName =
    instance.evolution_instance_name || instance.zapi_instance_id || instance.evolution_instance_id || '';
  return { baseUrl: settings.evolutionBaseUrl, apiKey, instanceName };
}

export async function sendWhatsAppMessage(supabase: any, request: WhatsAppSendRequest): Promise<WhatsAppSendResult> {
  const settings = await loadConnectionSettings(supabase);
  const instance = await resolveWhatsAppInstance(
    supabase,
    request.organizationId,
    request.conversationInstanceId,
  );

  if (!instance) throw new Error('Nenhuma instancia WhatsApp conectada');

  const provider: WhatsAppProvider = instance.provider === 'evolution' ? 'evolution' : 'uazapi';
  const type = request.type || (request.mediaUrl ? 'document' : 'text');
  // For group sends, keep the JID intact (e.g. 120363...@g.us). For 1:1, strip to digits.
  const normalizedPhone = request.isGroup
    ? String(request.phone || '').trim()
    : normalizePhone(request.phone);
  if (!normalizedPhone) throw new Error(request.isGroup ? 'JID do grupo invalido' : 'Telefone invalido');

  let endpoint = '';
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: Record<string, unknown>;

  if (provider === 'evolution') {
    const evolutionApiKey = instance.evolution_api_key || settings.evolutionApiKey || instance.zapi_token || '';
    const instanceName = instance.evolution_instance_name || instance.zapi_instance_id || instance.evolution_instance_id || '';
    if (!settings.evolutionBaseUrl || !evolutionApiKey || !instanceName) {
      throw new Error('Evolution API nao configurada para esta instancia');
    }
    headers = { ...headers, apikey: evolutionApiKey };

    if (type === 'text') {
      endpoint = `${settings.evolutionBaseUrl}/message/sendText/${instanceName}`;
      body = { number: normalizedPhone, text: request.text || '', delay: 1000, linkPreview: true };
    } else if (type === 'audio') {
      endpoint = `${settings.evolutionBaseUrl}/message/sendWhatsAppAudio/${instanceName}`;
      body = { number: normalizedPhone, audio: request.mediaUrl, delay: 1000, linkPreview: true };
    } else {
      endpoint = `${settings.evolutionBaseUrl}/message/sendMedia/${instanceName}`;
      body = {
        number: normalizedPhone,
        mediatype: type,
        mimetype: guessMimeType(type, request.mediaUrl),
        caption: request.caption || request.text || '',
        media: request.mediaUrl,
        fileName: fileNameFromUrl(request.mediaUrl, `${type}-${Date.now()}`),
        delay: 1000,
        linkPreview: true,
      };
    }
  } else {
    if (!settings.uazapiBaseUrl || !instance.zapi_token) {
      throw new Error('UAZAPI nao configurada para esta instancia');
    }
    headers = { ...headers, token: instance.zapi_token };

    if (type === 'text') {
      endpoint = uazapiUrl(settings.uazapiBaseUrl, '/send/text');
      body = { number: normalizedPhone, text: request.text || '' };
    } else {
      endpoint = uazapiUrl(settings.uazapiBaseUrl, '/send/media');
      body = {
        number: normalizedPhone,
        file: request.mediaUrl,
        type,
      };
      if (request.caption || request.text) body.caption = request.caption || request.text;
      if (type === 'audio') {
        body.ptt = true;
        body.mimetype = guessMimeType(type, request.mediaUrl);
        body.mimeType = guessMimeType(type, request.mediaUrl);
        body.fileName = fileNameFromUrl(request.mediaUrl, `audio-${Date.now()}`);
      }
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  const responseJson = parseJson(responseText);

  return {
    ok: response.ok,
    status: response.status,
    provider,
    instance,
    zapiMessageId: response.ok ? extractMessageId(responseJson) : null,
    responseText,
    responseJson,
  };
}
