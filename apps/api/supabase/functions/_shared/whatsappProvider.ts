// Abstraction layer for WhatsApp providers (UAZAPI and Evolution API)
// Controlled by WHATSAPP_PROVIDER env variable

export type MessageType = 'text' | 'image' | 'audio' | 'document' | 'video';

export interface SendMessageParams {
  instanceToken: string;
  instanceName?: string;
  phone: string;
  type: MessageType;
  content: string;
  mediaUrl?: string;
  quotedMsgId?: string;
}

export interface ProviderConfig {
  provider: 'uazapi' | 'evolution';
  baseUrl: string;
  apiKey?: string;
}

export function getProviderConfig(): ProviderConfig {
  const provider = (Deno.env.get('WHATSAPP_PROVIDER') || 'uazapi') as 'uazapi' | 'evolution';
  if (provider === 'evolution') {
    return {
      provider: 'evolution',
      baseUrl: Deno.env.get('EVOLUTION_API_URL') || '',
      apiKey: Deno.env.get('EVOLUTION_API_KEY') || '',
    };
  }
  return {
    provider: 'uazapi',
    baseUrl: Deno.env.get('UAZAPI_BASE_URL') || '',
  };
}

export function normalizePhone(phone: string, provider: 'uazapi' | 'evolution'): string {
  const digits = phone.replace(/\D/g, '');
  if (provider === 'evolution') {
    return `${digits}@s.whatsapp.net`;
  }
  return digits;
}

export async function sendWhatsAppMessage(params: SendMessageParams, config: ProviderConfig): Promise<Response> {
  const { phone, type, content, mediaUrl, quotedMsgId, instanceToken, instanceName } = params;
  const normalizedPhone = normalizePhone(phone, config.provider);

  if (config.provider === 'evolution') {
    const instance = Deno.env.get('EVOLUTION_INSTANCE') || instanceName || '';
    const headers = {
      'Content-Type': 'application/json',
      'apikey': config.apiKey || '',
    };

    switch (type) {
      case 'text': {
        const body: any = { number: normalizedPhone, text: content };
        if (quotedMsgId) body.quoted = { key: { id: quotedMsgId } };
        return fetch(`${config.baseUrl}/message/sendText/${instance}`, {
          method: 'POST', headers, body: JSON.stringify(body),
        });
      }
      case 'image': {
        const body: any = { number: normalizedPhone, mediatype: 'image', media: mediaUrl, caption: content };
        if (quotedMsgId) body.quoted = { key: { id: quotedMsgId } };
        return fetch(`${config.baseUrl}/message/sendMedia/${instance}`, {
          method: 'POST', headers, body: JSON.stringify(body),
        });
      }
      case 'audio': {
        const body: any = { number: normalizedPhone, audio: mediaUrl };
        return fetch(`${config.baseUrl}/message/sendWhatsAppAudio/${instance}`, {
          method: 'POST', headers, body: JSON.stringify(body),
        });
      }
      case 'document': {
        const body: any = { number: normalizedPhone, mediatype: 'document', media: mediaUrl, caption: content };
        return fetch(`${config.baseUrl}/message/sendMedia/${instance}`, {
          method: 'POST', headers, body: JSON.stringify(body),
        });
      }
      default:
        throw new Error(`Unsupported message type: ${type}`);
    }
  }

  // UAZAPI
  const headers = {
    'Content-Type': 'application/json',
    'token': instanceToken,
  };
  const base = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl;

  switch (type) {
    case 'text': {
      const body: any = { number: normalizePhone(phone, 'uazapi'), text: content };
      if (quotedMsgId) body.replyid = quotedMsgId;
      return fetch(`${base}/send/text`, { method: 'POST', headers, body: JSON.stringify(body) });
    }
    case 'image': {
      const body: any = { number: normalizePhone(phone, 'uazapi'), file: mediaUrl, type: 'image', caption: content };
      if (quotedMsgId) body.replyid = quotedMsgId;
      return fetch(`${base}/send/media`, { method: 'POST', headers, body: JSON.stringify(body) });
    }
    case 'audio': {
      const body: any = { number: normalizePhone(phone, 'uazapi'), file: mediaUrl, type: 'audio' };
      if (quotedMsgId) body.replyid = quotedMsgId;
      return fetch(`${base}/send/media`, { method: 'POST', headers, body: JSON.stringify(body) });
    }
    case 'document': {
      const body: any = { number: normalizePhone(phone, 'uazapi'), file: mediaUrl, type: 'document' };
      if (quotedMsgId) body.replyid = quotedMsgId;
      return fetch(`${base}/send/media`, { method: 'POST', headers, body: JSON.stringify(body) });
    }
    default:
      throw new Error(`Unsupported message type: ${type}`);
  }
}

export async function sendPresence(phone: string, presenceType: 'composing' | 'recording', config: ProviderConfig, instanceToken: string, instanceName?: string): Promise<void> {
  const digits = phone.replace(/\D/g, '');
  try {
    if (config.provider === 'evolution') {
      const instance = Deno.env.get('EVOLUTION_INSTANCE') || instanceName || '';
      await fetch(`${config.baseUrl}/chat/sendPresence/${instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': config.apiKey || '' },
        body: JSON.stringify({ number: `${digits}@s.whatsapp.net`, presence: presenceType, delay: 1200 }),
      });
    } else {
      const base = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl;
      await fetch(`${base}/message/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': instanceToken },
        body: JSON.stringify({ phone: digits, presence: presenceType }),
      });
    }
  } catch (e) {
    console.error('Presence error:', e);
  }
}
