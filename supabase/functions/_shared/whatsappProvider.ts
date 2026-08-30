import { getPlatformSetting } from './platformSettings.ts';
export type WhatsAppProvider = 'evolution' | 'uazapi';

export type WhatsAppSendType = 'text' | 'image' | 'video' | 'audio' | 'document';

// Tetos de tempo para a chamada HTTP ao provedor (ver sendWhatsAppMessage).
const SEND_TIMEOUT_MS = 30_000;
const SEND_TIMEOUT_MEDIA_MS = 90_000;

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
  const value = (await getPlatformSetting(supabase, 'whatsapp_connection_settings')) || {};
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
  const value = (await getPlatformSetting(supabase, 'whatsapp_provider_strategy')) || {};
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
  // Instância designada (número do workspace ou da conversa): é a ÚNICA
  // permitida. Buscamos direto por id, SEM filtrar por status — o número
  // atrelado ao workspace continua sendo o dono da conversa mesmo com o status
  // dessincronizado ou o número caído. Se ele não estiver disponível, FALHAMOS;
  // jamais caímos no fallback por organização, que mandaria a mensagem pelo
  // número de outro workspace (mesma regra do zapi-send-message).
  if (conversationInstanceId) {
    const { data: designatedInstance } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', conversationInstanceId)
      .maybeSingle();
    if (designatedInstance) return designatedInstance;
    console.warn(
      `[SEND_ROUTING] Instância designada ${conversationInstanceId} não encontrada na org ${organizationId}; ` +
      `recusando o envio em vez de usar outro número.`,
    );
    return null;
  }

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

// Cadencia por NUMERO (migration 20260830170000).
//
// Chat, fluxo, notificacao e disparo agendado saem todos pela mesma instancia e
// nenhum sabe do outro. `try_acquire_send_slot` e o unico ponto onde eles se
// enxergam: uma janela por instancia, no banco, atomica entre isolates.
//
// A regra e esperar, nunca descartar — se depois das tentativas ainda nao houver
// vaga, a mensagem sai assim mesmo e fica o aviso no log. Mensagem perdida seria
// pior que um pico de cadencia.
const SEND_SLOT_RETRIES = 6;
const SEND_SLOT_RETRY_DELAY_MS = 350;

interface SendRateLimitConfig {
  enabled: boolean;
  maxPerWindow: number;
  windowSeconds: number;
}

async function loadSendRateLimit(supabase: any): Promise<SendRateLimitConfig> {
  const value = (await getPlatformSetting(supabase, 'whatsapp_send_rate_limit')) || {};
  return {
    enabled: value.enabled ?? true,
    maxPerWindow: Number(value.max_per_window) > 0 ? Number(value.max_per_window) : 4,
    windowSeconds: Number(value.window_seconds) > 0 ? Number(value.window_seconds) : 1,
  };
}

export async function waitForSendSlot(supabase: any, instanceId: string | null | undefined) {
  if (!instanceId) return;

  const config = await loadSendRateLimit(supabase);
  if (!config.enabled) return;

  for (let attempt = 0; attempt < SEND_SLOT_RETRIES; attempt++) {
    const { data, error } = await supabase.rpc('try_acquire_send_slot', {
      _instance_id: instanceId,
      _max_per_window: config.maxPerWindow,
      _window_seconds: config.windowSeconds,
    });

    // Migration ainda nao aplicada (ou erro de banco): nao e motivo para segurar
    // envio — o limite e uma protecao, nao um requisito.
    if (error) {
      console.warn('[SEND_RATE_LIMIT] try_acquire_send_slot indisponivel:', error.message);
      return;
    }

    if (data === true) return;

    await new Promise((resolve) => setTimeout(resolve, SEND_SLOT_RETRY_DELAY_MS));
  }

  console.warn(`[SEND_RATE_LIMIT] Instancia ${instanceId} segue sem vaga apos a espera; enviando mesmo assim.`);
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

  // Cadencia do numero antes de falar com o provedor (ver waitForSendSlot).
  await waitForSendSlot(supabase, instance.id);

  // Teto de tempo por envio. Sem isto, um provedor que aceita a conexão e nunca
  // responde pendura o caller indefinidamente — no disparo agendado isso queimava
  // o orçamento da execução inteira e deixava o lock do job expirar, abrindo
  // espaço para um segundo worker reprocessar os mesmos contatos.
  // Mídia ganha um teto maior porque o provedor baixa a URL antes de enviar.
  const timeoutMs = type === 'text' ? SEND_TIMEOUT_MS : SEND_TIMEOUT_MEDIA_MS;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      // ATENÇÃO: timeout NÃO garante que a mensagem não saiu — o provedor pode
      // ter enviado e demorado a responder. Quem for reenviar à mão precisa
      // conferir antes.
      throw new Error(`${provider} nao respondeu em ${timeoutMs / 1000}s (timeout no envio)`);
    }
    throw err;
  }

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
