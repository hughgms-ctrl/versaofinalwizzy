import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decode as decodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { getUserOrganizationIds } from '../_shared/access.ts';

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
    const provider = instance.provider === 'evolution' || instance.evolution_instance_name || instance.evolution_instance_id ? 'evolution' : 'uazapi';
    const token = provider === 'evolution'
        ? (instance.evolution_api_key || settings.evolutionApiKey || instance.zapi_token)
        : instance.zapi_token;
    const baseUrl = provider === 'evolution' ? settings.evolutionBaseUrl : settings.uazapiBaseUrl;
    const instanceName = instance.evolution_instance_name || instance.zapi_instance_id || instance.evolution_instance_id || '';

    if (!baseUrl || !token) throw new Error('Provedor de WhatsApp sem credenciais para apagar mensagem');

    const phone = Array.isArray(conversation.contact) ? conversation.contact[0]?.phone : conversation.contact?.phone;
    const number = String(phone || '').replace(/\D/g, '');
    const remoteJid = number ? `${number}@s.whatsapp.net` : undefined;
    const alternateRemoteJid = number ? `${number}@s.whatsapp.com` : undefined;
    const providerMessageId = message.zapi_message_id;
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

    let providerResult: any = null;
    let lastError = '';
    for (const candidate of candidates.filter(c => !c.endpoint.endsWith('/'))) {
        try {
            const response = await fetch(candidate.endpoint, {
                method: candidate.method,
                headers: { 'Content-Type': 'application/json', ...candidate.headers },
                body: JSON.stringify(candidate.body),
            });
            const raw = await response.text();
            try { providerResult = raw ? JSON.parse(raw) : {}; } catch { providerResult = raw; }
            if (response.ok) {
                const deletedAt = new Date().toISOString();
                const metadata = {
                    ...(message.metadata || {}),
                    whatsapp_deleted: true,
                    whatsapp_deleted_by_us: true,
                    whatsapp_deleted_at: deletedAt,
                    whatsapp_delete_source: 'wizzy',
                    deleted_by_user_id: userId,
                    deleted_by_name: profile.full_name || 'Usuario da Wizzy',
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
                return { deleted: true, provider, providerResult, deletedAt };
            }
            lastError = `${response.status} ${raw}`.slice(0, 500);
        } catch (error) {
            lastError = String(error);
        }
    }

    return {
        deleted: false,
        provider,
        providerError: lastError || 'O provedor nao confirmou a exclusao da mensagem.',
        providerMessageId,
        number,
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

        const { action, messageId, content, reaction, instanceId } = await req.json();

        // action: 'find' | 'read' | 'react' | 'delete' | 'edit' | 'recover_media'

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
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
