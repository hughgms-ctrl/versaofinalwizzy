import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decode as decodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { assertActiveOrganizationAccess, AccessError, getUserOrganizationIds } from '../_shared/access.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeBaseUrl(value?: string | null): string {
    return (value || '').trim().replace(/\/+$/, '');
}

function firstString(...values: any[]): string | null {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
}

function isEncryptedWhatsAppMediaUrl(url?: string | null): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('mmg.whatsapp.net')
        || lower.includes('whatsapp.net')
        || lower.includes('/mms/')
        || lower.includes('enc=')
        || lower.includes('media-key')
        || lower.includes('mediakey');
}

function normalizeBase64Candidate(value?: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('http://') || trimmed.startsWith('https://')) return null;
    if (trimmed.startsWith('data:') && trimmed.includes('base64,')) {
        return trimmed.split('base64,')[1] || null;
    }
    return trimmed;
}

function isProbablyBase64(value?: string | null): boolean {
    if (!value) return false;
    const trimmed = value.trim();
    if (trimmed.startsWith('data:')) return trimmed.includes('base64,');
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return false;
    return /^[A-Za-z0-9+/=_-]{80,}$/.test(trimmed.replace(/\s+/g, ''));
}

function extractDownloadedMedia(data: any): { base64: string | null; mimeType: string | null; url: string | null } {
    const candidateBase64 = firstString(
        data?.base64, data?.Base64, data?.base64Data, data?.base64Url, data?.base64_url,
        data?.fileBase64, data?.file_base64,
        data?.data?.base64, data?.data?.Base64, data?.data?.base64Data, data?.data?.base64Url, data?.data?.base64_url,
        data?.media?.base64, data?.media?.Base64, data?.media?.base64Data, data?.media?.base64Url,
        data?.result?.base64, data?.result?.Base64, data?.result?.base64Data, data?.result?.base64Url,
        data?.response?.base64, data?.response?.base64Data,
        typeof data === 'string' ? data : null,
    );

    const candidateUrl = firstString(
        data?.fileUrl, data?.fileURL, data?.file_url, data?.downloadUrl, data?.downloadURL, data?.download_url,
        data?.mediaUrl, data?.mediaURL, data?.media_url, data?.url, data?.URL, data?.link,
        data?.data?.fileUrl, data?.data?.fileURL, data?.data?.file_url, data?.data?.downloadUrl,
        data?.data?.downloadURL, data?.data?.download_url, data?.data?.mediaUrl, data?.data?.mediaURL,
        data?.data?.media_url, data?.data?.url, data?.data?.URL, data?.data?.link,
        data?.media?.fileUrl, data?.media?.fileURL, data?.media?.file_url, data?.media?.downloadUrl,
        data?.media?.downloadURL, data?.media?.download_url, data?.media?.url,
        data?.result?.fileUrl, data?.result?.fileURL, data?.result?.file_url, data?.result?.downloadUrl,
        data?.result?.downloadURL, data?.result?.download_url, data?.result?.mediaUrl, data?.result?.mediaURL,
        data?.result?.media_url, data?.result?.url, data?.result?.URL,
        data?.response?.fileUrl, data?.response?.downloadUrl, data?.response?.url,
    );

    return {
        base64: normalizeBase64Candidate(candidateBase64),
        mimeType: firstString(
            data?.mimetype, data?.mimeType, data?.MimeType, data?.contentType, data?.type,
            data?.data?.mimetype, data?.data?.mimeType, data?.data?.contentType, data?.data?.type,
            data?.media?.mimetype, data?.media?.mimeType, data?.media?.contentType, data?.media?.type,
            data?.result?.mimetype, data?.result?.mimeType, data?.result?.contentType, data?.result?.type,
            data?.response?.mimetype, data?.response?.mimeType,
        ),
        url: candidateUrl && !isEncryptedWhatsAppMediaUrl(candidateUrl) ? candidateUrl : null,
    };
}

function mimeToExtension(mimeType: string): string {
    const normalized = mimeType.toLowerCase().split(';')[0].trim();
    const extMap: Record<string, string> = {
        'audio/ogg': 'ogg',
        'application/ogg': 'ogg',
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/mp4': 'm4a',
        'audio/x-m4a': 'm4a',
        'audio/m4a': 'm4a',
        'audio/wav': 'wav',
        'audio/x-wav': 'wav',
        'audio/aac': 'aac',
        'audio/webm': 'webm',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
    };
    return extMap[normalized] || 'bin';
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

/**
 * Credenciais/endereço do provedor para UMA instância. Extraído de dentro do
 * delete unitário para poder ser resolvido UMA vez por instância no delete em
 * lote — sem isso, um disparo de 500 mensagens releria platform_settings e a
 * linha da instância 500 vezes.
 */
function resolveInstanceTransport(instance: any, settings: any) {
    const provider = instance.provider === 'evolution' || instance.evolution_instance_name || instance.evolution_instance_id
        ? 'evolution'
        : 'uazapi';
    return {
        provider,
        token: provider === 'evolution'
            ? (instance.evolution_api_key || settings.evolutionApiKey || instance.zapi_token)
            : instance.zapi_token,
        baseUrl: provider === 'evolution' ? settings.evolutionBaseUrl : settings.uazapiBaseUrl,
        instanceName: instance.evolution_instance_name || instance.zapi_instance_id || instance.evolution_instance_id || '',
    };
}

/**
 * Chama o "apagar para todos" no provedor. A lista de candidatos existe porque
 * Evolution e UAZAPI mudaram o formato do payload entre versões e não há como
 * saber qual a VPS do cliente aceita: tentamos do mais provável ao mais antigo
 * e paramos no primeiro 2xx.
 */
async function revokeOnProvider(
    transport: { provider: string; token: string; baseUrl: string; instanceName: string },
    providerMessageId: string,
    number: string,
): Promise<{ ok: boolean; providerResult?: any; error?: string }> {
    const { provider, token, baseUrl, instanceName } = transport;
    const remoteJid = number ? `${number}@s.whatsapp.net` : undefined;
    const alternateRemoteJid = number ? `${number}@s.whatsapp.com` : undefined;
    const key = { id: providerMessageId, remoteJid, fromMe: true };

    const candidates = provider === 'evolution'
        ? [
            { method: 'DELETE', endpoint: `${baseUrl}/chat/deleteMessageForEveryone/${instanceName}`, headers: { apikey: token }, body: { id: providerMessageId, remoteJid, fromMe: true } },
            { method: 'DELETE', endpoint: `${baseUrl}/chat/deleteMessageForEveryone/${instanceName}`, headers: { apikey: token }, body: { id: providerMessageId, remoteJid: alternateRemoteJid, fromMe: true } },
            { method: 'POST', endpoint: `${baseUrl}/chat/deleteMessageForEveryone/${instanceName}`, headers: { apikey: token }, body: { id: providerMessageId, remoteJid, fromMe: true } },
            { method: 'POST', endpoint: `${baseUrl}/chat/deleteMessageForEveryone/${instanceName}`, headers: { apikey: token }, body: { key } },
            { method: 'POST', endpoint: `${baseUrl}/message/delete/${instanceName}`, headers: { apikey: token }, body: { id: providerMessageId, key } },
        ]
        : [
            { method: 'POST', endpoint: `${baseUrl}/message/delete`, headers: { token }, body: { messageId: providerMessageId, number, phone: number, owner: true } },
            { method: 'POST', endpoint: `${baseUrl}/message/delete`, headers: { token }, body: { id: providerMessageId, number, phone: number, owner: true } },
            { method: 'POST', endpoint: `${baseUrl}/message/delete`, headers: { token }, body: { key, number, phone: number, owner: true } },
            { method: 'POST', endpoint: `${baseUrl}/chat/delete`, headers: { token }, body: { messageId: providerMessageId, number, phone: number, owner: true } },
            { method: 'POST', endpoint: `${baseUrl}/chat/deleteMessage`, headers: { token }, body: { messageId: providerMessageId, number, phone: number, owner: true } },
        ];

    let lastError = '';
    for (const candidate of candidates.filter(c => !c.endpoint.endsWith('/'))) {
        try {
            const response = await fetch(candidate.endpoint, {
                method: candidate.method,
                headers: { 'Content-Type': 'application/json', ...candidate.headers },
                body: JSON.stringify(candidate.body),
            });
            const raw = await response.text();
            let providerResult: any = null;
            try { providerResult = raw ? JSON.parse(raw) : {}; } catch { providerResult = raw; }
            if (response.ok) return { ok: true, providerResult };
            lastError = `${response.status} ${raw}`.slice(0, 500);
        } catch (error) {
            lastError = String(error);
        }
    }

    return { ok: false, error: lastError || 'O provedor nao confirmou a exclusao da mensagem.' };
}

/** Marca a mensagem como apagada no banco, guardando o original no metadata. */
async function markMessageDeleted(supabase: any, message: any, userId: string, userName: string) {
    const deletedAt = new Date().toISOString();
    const metadata = {
        ...(message.metadata || {}),
        whatsapp_deleted: true,
        whatsapp_deleted_by_us: true,
        whatsapp_deleted_at: deletedAt,
        whatsapp_delete_source: 'wizzy',
        deleted_by_user_id: userId,
        deleted_by_name: userName,
        original_type: message.type,
        original_content: message.content,
        original_media_url: message.media_url,
    };

    await supabase
        .from('messages')
        .update({
            content: message.type === 'image' ? 'Imagem apagada' : 'Mensagem apagada',
            type: 'text',
            media_url: null,
            metadata,
        })
        .eq('id', message.id);

    return deletedAt;
}

async function recoverMediaFile(supabase: any, messageId: string, userId: string) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, full_name')
        .eq('user_id', userId)
        .maybeSingle();

    if (!profile?.organization_id) throw new Error('Perfil nao encontrado');

    const { data: message } = await supabase
        .from('messages')
        .select('id, zapi_message_id, type, media_url, conversation_id')
        .eq('id', messageId)
        .maybeSingle();

    if (!message) throw new Error('Mensagem nao encontrada');
    if (message.media_url && !isEncryptedWhatsAppMediaUrl(message.media_url)) {
        return { mediaUrl: message.media_url, recovered: false };
    }
    if (!message.zapi_message_id) throw new Error('Mensagem sem ID do WhatsApp para recuperar midia');

    const { data: conversation } = await supabase
        .from('conversations')
        .select('id, organization_id, whatsapp_instance_id, contact:contacts(phone)')
        .eq('id', message.conversation_id)
        .maybeSingle();

    if (!conversation || conversation.organization_id !== profile.organization_id) {
        throw new Error('Acesso negado');
    }

    let instance = null;
    if (conversation.whatsapp_instance_id) {
        const { data } = await supabase
            .from('whatsapp_instances')
            .select('*')
            .eq('id', conversation.whatsapp_instance_id)
            .maybeSingle();
        instance = data;
    }

    if (!instance) {
        const { data: instances } = await supabase
            .from('whatsapp_instances')
            .select('*')
            .eq('organization_id', profile.organization_id)
            .eq('status', 'connected')
            .limit(1);
        instance = instances?.[0];
    }

    if (!instance) throw new Error('Instancia do WhatsApp nao encontrada');

    const settings = await loadConnectionSettings(supabase);
    const provider = instance.provider === 'evolution' || instance.evolution_instance_name || instance.evolution_instance_id ? 'evolution' : 'uazapi';
    const token = provider === 'evolution'
        ? (instance.evolution_api_key || settings.evolutionApiKey || instance.zapi_token)
        : instance.zapi_token;
    const baseUrl = provider === 'evolution' ? settings.evolutionBaseUrl : settings.uazapiBaseUrl;
    const instanceName = instance.evolution_instance_name || instance.zapi_instance_id || instance.evolution_instance_id || '';

    if (!baseUrl || !token) throw new Error('Provedor de WhatsApp sem credenciais para recuperar midia');

    const phone = Array.isArray(conversation.contact) ? conversation.contact[0]?.phone : conversation.contact?.phone;
    const remoteJid = phone ? `${String(phone).replace(/\D/g, '')}@s.whatsapp.net` : undefined;
    const mediaKey = { id: message.zapi_message_id, remoteJid, fromMe: false };

    const candidates = provider === 'evolution'
        ? [
            { endpoint: `${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`, headers: { apikey: token }, body: { message: { key: { id: message.zapi_message_id } }, convertToMp4: false } },
            { endpoint: `${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`, headers: { apikey: token }, body: { message: { key: mediaKey }, convertToMp4: false } },
            { endpoint: `${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`, headers: { apikey: token }, body: { messageId: message.zapi_message_id, key: mediaKey, convertToMp4: false } },
            { endpoint: `${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`, headers: { apikey: token }, body: { key: mediaKey, convertToMp4: false } },
        ]
        : [
            { endpoint: `${baseUrl}/message/download`, headers: { token }, body: { id: message.zapi_message_id, return_base64: true, generate_mp3: message.type === 'audio', return_link: true } },
            { endpoint: `${baseUrl}/message/download`, headers: { token }, body: { messageId: message.zapi_message_id, return_base64: true, generate_mp3: message.type === 'audio', return_link: true } },
            { endpoint: `${baseUrl}/message/download`, headers: { token }, body: { msgId: message.zapi_message_id, return_base64: true, generate_mp3: message.type === 'audio', return_link: true } },
            { endpoint: `${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`, headers: { token }, body: { key: mediaKey, convertToMp4: false } },
        ];

    let base64Data: string | null = null;
    let mimeType: string | null = null;
    let directUrl: string | null = null;

    for (const candidate of candidates.filter(c => !c.endpoint.endsWith('/'))) {
        const response = await fetch(candidate.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...candidate.headers },
            body: JSON.stringify(candidate.body),
        });
        const raw = await response.text();
        if (!response.ok) {
            console.error(`[recover_media] Provider failed ${response.status} ${candidate.endpoint}: ${raw.substring(0, 300)}`);
            continue;
        }
        let parsed: any = null;
        try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = raw; }
        const downloaded = extractDownloadedMedia(parsed);
        if (isProbablyBase64(downloaded.base64)) {
            base64Data = downloaded.base64;
            mimeType = downloaded.mimeType;
            break;
        }
        if (downloaded.url) {
            directUrl = downloaded.url;
            mimeType = downloaded.mimeType;
            break;
        }
    }

    if (!base64Data && directUrl) {
        const response = await fetch(directUrl, {
            headers: provider === 'evolution' ? { apikey: token } : { token },
        });
        const contentType = response.headers.get('content-type') || '';
        if (response.ok && !contentType.toLowerCase().includes('text/html') && !contentType.toLowerCase().includes('application/json')) {
            const buffer = await response.arrayBuffer();
            if (buffer.byteLength > 128) {
                const bytes = new Uint8Array(buffer);
                let binary = '';
                const chunkSize = 8192;
                for (let i = 0; i < bytes.length; i += chunkSize) {
                    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
                }
                base64Data = btoa(binary);
                mimeType = mimeType || contentType;
            }
        }
    }

    if (!base64Data) throw new Error('O provedor nao retornou o arquivo de audio');

    if (!mimeType || !mimeType.includes('/')) {
        mimeType = message.type === 'audio' ? 'audio/ogg' : 'application/octet-stream';
    }

    let pureBase64 = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data;
    pureBase64 = pureBase64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const padLen = 4 - (pureBase64.length % 4);
    if (padLen < 4 && padLen > 0) pureBase64 += '='.repeat(padLen);

    const ext = mimeToExtension(mimeType);
    const storagePath = `recovered-media/${message.id}.${ext}`;
    const binaryData = decodeBase64(pureBase64);

    let uploadResult = await supabase.storage
        .from('chat-media')
        .upload(storagePath, binaryData, { contentType: mimeType, upsert: true });

    if (uploadResult.error && uploadResult.error.message?.includes('not found')) {
        await supabase.storage.createBucket('chat-media', { public: true });
        uploadResult = await supabase.storage
            .from('chat-media')
            .upload(storagePath, binaryData, { contentType: mimeType, upsert: true });
    }

    if (uploadResult.error) throw new Error(uploadResult.error.message);

    const { data: publicUrl } = supabase.storage.from('chat-media').getPublicUrl(storagePath);
    const mediaUrl = publicUrl?.publicUrl;
    if (!mediaUrl) throw new Error('Falha ao gerar URL publica da midia');

    await supabase
        .from('messages')
        .update({ media_url: mediaUrl })
        .eq('id', message.id);

    return { mediaUrl, recovered: true };
}

async function deleteMessageForEveryone(
    supabase: any,
    messageId: string,
    userId: string,
    requestedInstanceId?: string | null,
) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, full_name, user_id')
        .eq('user_id', userId)
        .maybeSingle();

    if (!profile?.organization_id) throw new Error('Perfil nao encontrado');

    const { data: message } = await supabase
        .from('messages')
        .select('id, zapi_message_id, direction, conversation_id, content, type, media_url, metadata')
        .eq('id', messageId)
        .maybeSingle();

    if (!message) throw new Error('Mensagem nao encontrada');
    if (message.direction !== 'outbound') {
        throw new Error('So e possivel apagar no WhatsApp mensagens enviadas por voce.');
    }
    if (!message.zapi_message_id) {
        throw new Error('Mensagem sem ID do WhatsApp para apagar.');
    }

    const { data: conversation } = await supabase
        .from('conversations')
        .select('id, organization_id, whatsapp_instance_id, contact:contacts(phone)')
        .eq('id', message.conversation_id)
        .maybeSingle();

    if (!conversation || conversation.organization_id !== profile.organization_id) {
        throw new Error('Acesso negado');
    }

    let instance = null;
    const targetInstanceId = requestedInstanceId || conversation.whatsapp_instance_id;
    if (targetInstanceId) {
        const { data } = await supabase
            .from('whatsapp_instances')
            .select('*')
            .eq('id', targetInstanceId)
            .eq('organization_id', profile.organization_id)
            .maybeSingle();
        instance = data;
    }

    if (!instance) {
        const { data: instances } = await supabase
            .from('whatsapp_instances')
            .select('*')
            .eq('organization_id', profile.organization_id)
            .eq('status', 'connected')
            .limit(1);
        instance = instances?.[0];
    }

    if (!instance) throw new Error('Instancia do WhatsApp nao encontrada');

    const settings = await loadConnectionSettings(supabase);
    const transport = resolveInstanceTransport(instance, settings);

    if (!transport.baseUrl || !transport.token) {
        throw new Error('Provedor de WhatsApp sem credenciais para apagar mensagem');
    }

    const phone = Array.isArray(conversation.contact) ? conversation.contact[0]?.phone : conversation.contact?.phone;
    const number = String(phone || '').replace(/\D/g, '');
    const providerMessageId = message.zapi_message_id;

    const result = await revokeOnProvider(transport, providerMessageId, number);

    if (result.ok) {
        const deletedAt = await markMessageDeleted(supabase, message, userId, profile.full_name || 'Usuario da Wizzy');
        return { deleted: true, provider: transport.provider, providerResult: result.providerResult, deletedAt };
    }

    return {
        deleted: false,
        provider: transport.provider,
        providerError: result.error,
        providerMessageId,
        number,
    };
}

/** Teto de linhas lidas no índice do disparo — evita varrer um disparo gigante. */
const BULK_SCAN_CAP = 5000;
/** Quantas mensagens revogar por invocação (limite de wall clock da edge function). */
const BULK_DEFAULT_LIMIT = 40;
/** Respiro entre revogações, para não queimar o número no provedor. */
const BULK_DEFAULT_DELAY_MS = 350;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Escapa curingas de LIKE para que o texto da mensagem case literalmente. */
function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Apaga PARA TODOS uma mensagem que foi enviada em massa.
 *
 * O SELETOR É O TEXTO (`contentStartsWith`), não o disparo. Isso é deliberado: o
 * pedido real nesses casos é "apaga ESTA mensagem de todo mundo que recebeu", e
 * ela pode ter saído por mais de um agendamento, ou por agendamento + reenvio
 * manual. Filtrar por scheduled_id primeiro deixaria sobreviventes.
 *
 * `scheduledId` continua aceito como filtro OPCIONAL, para restringir a um único
 * disparo quando esse é o recorte desejado.
 *
 * Não é idempotente por acaso — é por construção: mensagens já marcadas como
 * apagadas são puladas, então a função pode ser chamada em loop até `remaining`
 * zerar sem revogar nada duas vezes.
 *
 * LIMITE DO WHATSAPP: o "apagar para todos" só vale dentro da janela de ~2 dias
 * do envio. Fora dela o provedor aceita a chamada mas o destinatário continua
 * vendo a mensagem — por isso o resultado do provedor não é garantia de entrega.
 */
async function deleteBlastForEveryone(
    supabase: any,
    userId: string,
    options: {
        contentStartsWith: string;
        organizationId?: string | null;
        scheduledId?: string | null;
        dryRun?: boolean;
        limit?: number;
        delayMs?: number;
        since?: string | null;
        until?: string | null;
    },
) {
    const contentStartsWith = String(options.contentStartsWith || '').trim();
    // Um prefixo curto ("Oi") casaria com meio banco. O piso torna impossível
    // disparar uma limpeza ampla por descuido.
    if (contentStartsWith.length < 20) {
        throw new Error('contentStartsWith e obrigatorio e precisa ter ao menos 20 caracteres, para nao casar com mensagens legitimas.');
    }

    const limit = Math.min(Math.max(Number(options.limit) || BULK_DEFAULT_LIMIT, 1), 200);
    const delayMs = Math.min(Math.max(Number(options.delayMs ?? BULK_DEFAULT_DELAY_MS), 0), 5000);
    const dryRun = options.dryRun !== false; // seguro por padrão: só apaga com dryRun:false explícito

    // Resolve a org: explícita, ou a do disparo, ou a única do usuário.
    let organizationId = options.organizationId || null;
    let scheduled: any = null;

    if (options.scheduledId) {
        const { data } = await supabase
            .from('scheduled_messages')
            .select('id, organization_id, name')
            .eq('id', options.scheduledId)
            .maybeSingle();
        if (!data) throw new Error('Disparo nao encontrado');
        scheduled = data;
        organizationId = organizationId || data.organization_id;
    }

    if (!organizationId) {
        const orgIds = await getUserOrganizationIds(supabase, userId);
        if (orgIds.length === 1) {
            organizationId = orgIds[0];
        } else {
            throw new Error('organizationId e obrigatorio: o usuario pertence a mais de uma organizacao.');
        }
    }

    // Ação destrutiva em massa: exige owner/admin, não só ser membro da org.
    // skipPlanCheck porque consertar um envio errado não pode depender de fatura.
    await assertActiveOrganizationAccess(supabase, userId, organizationId, {
        requireManager: true,
        skipPlanCheck: true,
    });

    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', userId)
        .maybeSingle();
    const userName = profile?.full_name || 'Usuario da Wizzy';

    // Fase 1 — índice leve. Só id + flag de apagado, para não trazer o conteúdo
    // de milhares de mensagens só para contar quantas faltam.
    let indexQuery = supabase
        .from('messages')
        .select('id, created_at, deleted:metadata->>whatsapp_deleted, conversation:conversations!inner(organization_id)')
        .ilike('content', `${escapeLikePattern(contentStartsWith)}%`)
        .eq('conversation.organization_id', organizationId)
        .eq('direction', 'outbound')
        .not('zapi_message_id', 'is', null)
        .order('created_at', { ascending: true })
        .limit(BULK_SCAN_CAP);

    if (options.scheduledId) indexQuery = indexQuery.eq('metadata->>scheduled_id', options.scheduledId);
    if (options.since) indexQuery = indexQuery.gte('created_at', options.since);
    if (options.until) indexQuery = indexQuery.lte('created_at', options.until);

    const { data: indexRows, error: indexError } = await indexQuery;
    if (indexError) throw new Error(`Falha ao listar mensagens do disparo: ${indexError.message}`);

    const all = indexRows || [];
    const pending = all.filter((row: any) => row.deleted !== 'true');
    const alreadyDeleted = all.length - pending.length;

    const batchIds = pending.slice(0, limit).map((row: any) => row.id);

    if (batchIds.length === 0) {
        return {
            scheduled: scheduled ? { id: scheduled.id, name: scheduled.name } : null,
            dryRun,
            total: all.length,
            alreadyDeleted,
            pending: 0,
            processed: 0,
            deleted: 0,
            failed: 0,
            skipped: 0,
            remaining: 0,
            scanCapped: all.length >= BULK_SCAN_CAP,
            errors: [],
        };
    }

    // Fase 2 — carrega só o lote que vai ser processado.
    const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('id, conversation_id, zapi_message_id, content, type, media_url, metadata, conversation:conversations!inner(id, whatsapp_instance_id, contact:contacts(phone))')
        .in('id', batchIds);

    if (messagesError) throw new Error(`Falha ao carregar o lote: ${messagesError.message}`);

    const settings = await loadConnectionSettings(supabase);
    // Uma leitura por instância, não por mensagem.
    const instanceCache = new Map<string, any>();
    const loadInstance = async (instanceId: string | null) => {
        const cacheKey = instanceId || '__fallback__';
        if (instanceCache.has(cacheKey)) return instanceCache.get(cacheKey);

        let instance = null;
        if (instanceId) {
            const { data } = await supabase
                .from('whatsapp_instances')
                .select('*')
                .eq('id', instanceId)
                .eq('organization_id', organizationId)
                .maybeSingle();
            instance = data;
        }
        if (!instance) {
            const { data: instances } = await supabase
                .from('whatsapp_instances')
                .select('*')
                .eq('organization_id', organizationId)
                .eq('status', 'connected')
                .limit(1);
            instance = instances?.[0] || null;
        }
        instanceCache.set(cacheKey, instance);
        return instance;
    };

    // Segunda checagem do texto, agora em JS. O ILIKE do banco já filtrou, mas
    // ele é sensível a espaço/quebra de linha; esta normaliza antes de comparar
    // e é a trava final antes de revogar cada mensagem.
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
    const normalizedPrefix = normalize(contentStartsWith);

    let deleted = 0;
    let failed = 0;
    let skipped = 0;
    const errors: any[] = [];
    const preview: any[] = [];

    for (const message of messages || []) {
        const conversation = Array.isArray(message.conversation) ? message.conversation[0] : message.conversation;
        const contact = Array.isArray(conversation?.contact) ? conversation.contact[0] : conversation?.contact;
        const number = String(contact?.phone || '').replace(/\D/g, '');

        if (!normalize(String(message.content || '')).startsWith(normalizedPrefix)) {
            skipped++;
            continue;
        }

        if (dryRun) {
            if (preview.length < 10) {
                preview.push({ phone: number || null, preview: String(message.content || '').slice(0, 120) });
            }
            continue;
        }

        if (!number) {
            failed++;
            errors.push({ messageId: message.id, error: 'Contato sem telefone para montar o remoteJid' });
            continue;
        }

        const instance = await loadInstance(conversation?.whatsapp_instance_id || null);
        if (!instance) {
            failed++;
            errors.push({ messageId: message.id, phone: number, error: 'Instancia do WhatsApp nao encontrada' });
            continue;
        }

        const transport = resolveInstanceTransport(instance, settings);
        if (!transport.baseUrl || !transport.token) {
            failed++;
            errors.push({ messageId: message.id, phone: number, error: 'Instancia sem credenciais do provedor' });
            continue;
        }

        const result = await revokeOnProvider(transport, message.zapi_message_id, number);
        if (result.ok) {
            await markMessageDeleted(supabase, message, userId, userName);
            deleted++;
        } else {
            failed++;
            if (errors.length < 20) {
                errors.push({ messageId: message.id, phone: number, error: result.error });
            }
        }

        if (delayMs > 0) await sleep(delayMs);
    }

    const processed = dryRun ? 0 : deleted + failed;

    return {
        scheduled: scheduled ? { id: scheduled.id, name: scheduled.name } : null,
        dryRun,
        total: all.length,
        alreadyDeleted,
        pending: pending.length,
        matchedInBatch: (messages || []).length - skipped,
        processed,
        deleted,
        failed,
        skipped,
        // Falhas continuam pendentes: uma nova chamada tenta de novo.
        remaining: dryRun ? pending.length : pending.length - deleted,
        scanCapped: all.length >= BULK_SCAN_CAP,
        preview: dryRun ? preview : undefined,
        errors,
    };
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
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized', details: authError?.message }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const payload = await req.json();
        const { action, messageId, content, reaction, instanceId } = payload;

        // action: 'find' | 'read' | 'react' | 'delete' | 'delete_blast' | 'edit' | 'recover_media'

        // Apagar para todos, em lote, uma mensagem enviada em massa. O recorte é
        // o TEXTO da mensagem; scheduledId é filtro opcional.
        // Chamar em loop até `remaining` chegar a 0 — cada invocação processa um
        // lote para caber no wall clock da edge function.
        if (action === 'delete_blast') {
            const result = await deleteBlastForEveryone(supabase, user.id, {
                contentStartsWith: payload.contentStartsWith,
                organizationId: payload.organizationId,
                scheduledId: payload.scheduledId,
                dryRun: payload.dryRun,
                limit: payload.limit,
                delayMs: payload.delayMs,
                since: payload.since,
                until: payload.until,
            });
            return new Response(JSON.stringify({ success: true, ...result }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (action === 'recover_media') {
            const result = await recoverMediaFile(supabase, messageId, user.id);
            return new Response(JSON.stringify({ success: true, ...result }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (action === 'delete') {
            const result = await deleteMessageForEveryone(supabase, messageId, user.id, instanceId);
            return new Response(JSON.stringify({ success: !!result.deleted, ...result }), {
                status: result.deleted ? 200 : 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // IDOR guard: só instâncias das orgs de que o caller é membro. Sem isso, os
        // caminhos read/react/edit/find operavam na instância WhatsApp de outra org.
        const orgIds = await getUserOrganizationIds(supabase, user.id);
        if (orgIds.length === 0) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        let instance;
        if (instanceId) {
            const { data } = await supabase.from('whatsapp_instances').select('*').eq('id', instanceId).in('organization_id', orgIds).maybeSingle();
            instance = data;
        } else {
            const { data: instances } = await supabase.from('whatsapp_instances').select('*').eq('status', 'connected').in('organization_id', orgIds).limit(1);
            instance = instances?.[0];
        }

        if (!instance) {
            return new Response(JSON.stringify({ error: 'No connected instance' }), {
                status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const provider = instance.provider === 'evolution' || instance.evolution_instance_name || instance.evolution_instance_id ? 'evolution' : 'uazapi';
        if (provider !== 'uazapi') {
            console.warn(`[MESSAGE_ACTIONS] Skipping UAZAPI-only action ${action} for ${provider} instance ${instance.id}`);
            return new Response(JSON.stringify({
                success: true,
                skipped: true,
                provider,
                message: 'Acao ainda nao implementada para Evolution; evitando chamada UAZAPI indevida.',
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (!instance.zapi_token) {
            return new Response(JSON.stringify({ error: 'No connected instance' }), {
                status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        let endpoint = '';
        let body: any = { messageId };
        let method = 'POST';

        switch (action) {
            case 'read':
                endpoint = `${uazapiBaseUrl}/message/read`;
                break;
            case 'react':
                endpoint = `${uazapiBaseUrl}/message/react`;
                body.reaction = reaction;
                break;
            case 'delete':
                endpoint = `${uazapiBaseUrl}/message/delete`;
                break;
            case 'edit':
                endpoint = `${uazapiBaseUrl}/message/edit`;
                body.text = content;
                break;
            case 'find':
                endpoint = `${uazapiBaseUrl}/message/find/${messageId}`;
                method = 'GET';
                body = null;
                break;
            default:
                return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
        }

        const response = await fetch(endpoint, {
            method,
            headers: { 'Content-Type': 'application/json', 'token': instance.zapi_token },
            body: body ? JSON.stringify(body) : null,
        });

        const result = await response.json();

        return new Response(JSON.stringify({ success: response.ok, data: result }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('zapi-message-actions error:', error);
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
            status: error instanceof AccessError ? error.status : 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
