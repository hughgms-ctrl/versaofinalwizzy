import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUserOrganizationIds } from '../_shared/access.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Guard anti-SSRF: mediaUrl vem do body do cliente e é passado a fetch(). Sem validar,
// um atacante aponta para http://169.254.169.254 (metadados do cloud) ou serviços
// internos. Exigimos http(s) e bloqueamos hosts internos/privados e literais de IP
// em faixas privadas. Lança em URL inválida/insegura.
function assertSafeMediaUrl(rawUrl: string): void {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error('Invalid media URL');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error('Unsupported media URL protocol');
  }
  const host = u.hostname.toLowerCase();

  // Hosts internos conhecidos / metadados de cloud.
  const blockedHosts = new Set([
    'localhost', '127.0.0.1', '0.0.0.0', '::1',
    'metadata.google.internal', '169.254.169.254',
  ]);
  if (blockedHosts.has(host)) throw new Error('Blocked media URL host');

  // Literais de IPv4 em faixas privadas/link-local/loopback.
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    const isPrivate =
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0;
    if (isPrivate) throw new Error('Blocked private media URL');
  }

  // IPv6 privado/local (unique-local fc00::/7, link-local fe80::/10).
  if (host.includes(':') && /^(f[cd]|fe8|fe9|fea|feb)/.test(host.replace(/^\[/, ''))) {
    throw new Error('Blocked private IPv6 media URL');
  }
}

interface AIConfigResult {
  endpoint: string;
  apiKey: string;
  model: string;
  provider: string;
}

function resolveAIConfig(integrationConfig: any, feature: string): AIConfigResult | null {
  const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

  if (!integrationConfig) return null;

  const featureModel = integrationConfig[`${feature}_model`];
  const defaultModel = feature === 'transcription' ? 'gpt-4o-mini-transcribe' : 'gpt-4o-mini';
  const model = (featureModel || integrationConfig.default_model || defaultModel).replace('openai/', '').replace('google/', '');
  if (!integrationConfig.openai_api_key) return null;
  return { endpoint: OPENAI_ENDPOINT, apiKey: integrationConfig.openai_api_key, model, provider: 'openai' };
}

function resolveOpenAITranscriptionModel(model?: string | null) {
  const cleanModel = String(model || '').replace('openai/', '').trim();
  return ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'].includes(cleanModel)
    ? cleanModel
    : 'gpt-4o-mini-transcribe';
}

function normalizeText(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function usesPlatformAI(plan?: any) {
  const aiMode = normalizeText(plan?.ai_mode);
  const slug = normalizeText(plan?.slug);
  const name = normalizeText(plan?.name);
  return aiMode === 'platform_api' || slug === 'max' || slug === 'wizzy-ai' || slug === 'wizzy_ai' || name.includes('max') || name.includes('wizzy ai');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function isFailedMediaAnalysis(value?: string | null) {
  if (!value) return false;
  return [
    '[Imagem nÃ£o analisada]',
    '[Imagem nÃƒÂ£o analisada]',
    '[TranscriÃ§Ã£o nÃ£o disponÃ­vel]',
    '[TranscriÃƒÂ§ÃƒÂ£o nÃƒÂ£o disponÃƒÂ­vel]',
    '[Ãudio nÃ£o disponÃ­vel]',
    '[ÃƒÂudio nÃƒÂ£o disponÃƒÂ­vel]',
    '[Erro na transcriÃ§Ã£o]',
    '[Erro na transcriÃƒÂ§ÃƒÂ£o]',
  ].includes(value.trim());
}

async function imageUrlForVision(mediaUrl: string): Promise<string> {
  try {
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      console.error('Image fetch failed before vision:', response.status);
      return mediaUrl;
    }

    const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 128 || !contentType.startsWith('image/')) {
      console.error('Invalid image payload before vision:', contentType, buffer.byteLength);
      return mediaUrl;
    }

    return `data:${contentType};base64,${arrayBufferToBase64(buffer)}`;
  } catch (error) {
    console.error('Image fetch exception before vision:', error);
    return mediaUrl;
  }
}

async function transcribeAudioWithWhisper(mediaUrl: string, apiKey: string, model: string): Promise<string> {
  try {
    console.log(`[WHISPER] Fetching audio from: ${mediaUrl}`);
    const audioResponse = await fetch(mediaUrl);
    if (!audioResponse.ok) {
      console.error('[WHISPER] Failed to fetch audio:', audioResponse.status);
      return '[Áudio não disponível]';
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    console.log(`[WHISPER] Audio size: ${audioBuffer.byteLength} bytes`);
    const contentType = (audioResponse.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    const bytes = new Uint8Array(audioBuffer);
    const magic = String.fromCharCode(...bytes.slice(0, 4));
    const urlLower = mediaUrl.toLowerCase();

    // Determine file extension from URL, content-type, or magic bytes.
    let ext = 'ogg';
    if (contentType.includes('mpeg') || contentType.includes('mp3')) ext = 'mp3';
    else if (contentType.includes('wav')) ext = 'wav';
    else if (contentType.includes('mp4') || contentType.includes('m4a')) ext = 'm4a';
    else if (contentType.includes('webm')) ext = 'webm';
    else if (contentType.includes('ogg')) ext = 'ogg';
    else if (urlLower.includes('.mp3')) ext = 'mp3';
    else if (urlLower.includes('.wav')) ext = 'wav';
    else if (urlLower.includes('.m4a')) ext = 'm4a';
    else if (urlLower.includes('.webm')) ext = 'webm';
    else if (urlLower.includes('.mp4')) ext = 'mp4';
    else if (magic === 'OggS') ext = 'ogg';
    else if (magic === 'RIFF') ext = 'wav';
    else if (magic.startsWith('ID3') || (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0)) ext = 'mp3';

    const mimeMap: Record<string, string> = {
      'ogg': 'audio/ogg',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'm4a': 'audio/mp4',
      'webm': 'audio/webm',
      'mp4': 'audio/mp4',
    };

    // Use OpenAI Whisper API for audio transcription
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeMap[ext] || 'audio/ogg' });
    formData.append('file', blob, `audio.${ext}`);
    formData.append('model', resolveOpenAITranscriptionModel(model));
    formData.append('language', 'pt');
    formData.append('response_format', 'text');

    console.log(`[WHISPER] Sending to Whisper API, ext=${ext}, size=${audioBuffer.byteLength}`);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[WHISPER] Transcription failed:', response.status, errText);
      return '[Transcrição não disponível]';
    }

    const transcription = await response.text();
    console.log('[WHISPER] Result:', transcription.substring(0, 100));
    return transcription.trim() || '[Áudio vazio]';
  } catch (error) {
    console.error('[WHISPER] Error:', error);
    return '[Erro na transcrição]';
  }
}

async function transcribeAudioWithGemini(mediaUrl: string, apiKey: string, model: string): Promise<string> {
  try {
    const audioResponse = await fetch(mediaUrl);
    if (!audioResponse.ok) return '[Áudio não disponível]';

    const audioBuffer = await audioResponse.arrayBuffer();
    const bytes = new Uint8Array(audioBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64Audio = btoa(binary);

    const contentType = (audioResponse.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    const magic = String.fromCharCode(...bytes.slice(0, 4));
    const urlLower = mediaUrl.toLowerCase();
    let mimeType = 'audio/ogg';
    if (contentType.includes('mpeg') || contentType.includes('mp3')) mimeType = 'audio/mpeg';
    else if (contentType.includes('wav')) mimeType = 'audio/wav';
    else if (contentType.includes('mp4') || contentType.includes('m4a')) mimeType = 'audio/mp4';
    else if (contentType.includes('webm')) mimeType = 'audio/webm';
    else if (contentType.includes('ogg')) mimeType = 'audio/ogg';
    else if (urlLower.includes('.mp3')) mimeType = 'audio/mpeg';
    else if (urlLower.includes('.wav')) mimeType = 'audio/wav';
    else if (urlLower.includes('.m4a') || urlLower.includes('.mp4')) mimeType = 'audio/mp4';
    else if (urlLower.includes('.webm')) mimeType = 'audio/webm';
    else if (magic === 'OggS') mimeType = 'audio/ogg';
    else if (magic === 'RIFF') mimeType = 'audio/wav';
    else if (magic.startsWith('ID3') || (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0)) mimeType = 'audio/mpeg';

    // Gemini supports inline audio in chat completions via the OpenAI-compatible endpoint
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Transcreva este áudio em português brasileiro. Forneça APENAS a transcrição literal, sem comentários. Se não entender, responda "[Áudio inaudível]".' },
            { type: 'input_audio', input_audio: { data: base64Audio, format: mimeType.split('/')[1]?.split(';')[0] || 'ogg' } },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini audio transcription failed:', response.status, errText);
      return '[Transcrição não disponível]';
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '[Transcrição não disponível]';
  } catch (error) {
    console.error('Gemini audio error:', error);
    return '[Erro na transcrição]';
  }
}

async function applyAdminAIStrategy(supabase: any, organizationId: string, integrationConfig: any, feature: string) {
  const { data: planRow } = await supabase
    .from('organization_plans')
    .select('status, plan:platform_plans(ai_mode, slug, name)')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: settingRow } = await supabase.from('platform_settings').select('value').eq('key', 'ai_model_strategy').maybeSingle();
  const { data: aiConnectionRow } = await supabase.from('platform_settings').select('value').eq('key', 'ai_usage_connection_settings').maybeSingle();
  const strategy = settingRow?.value || {};
  const fallbackModel = feature === 'transcription' ? 'gpt-4o-mini-transcribe' : 'gpt-4o-mini';
  const model = strategy.features?.[feature] || (feature === 'transcription' ? fallbackModel : strategy.default_model) || fallbackModel;
  const platformKey = Deno.env.get('WIZZY_OPENAI_API_KEY') || Deno.env.get('OPENAI_API_KEY') || aiConnectionRow?.value?.openai_api_key || '';
  const usePlatformKey = usesPlatformAI((planRow as any)?.plan);
  // Planos own_api nunca podem usar a key da plataforma: sem key própria configurada, a IA fica indisponível.
  return { ...(integrationConfig || {}), ai_provider: 'openai', default_model: model, [`${feature}_provider`]: 'openai', [`${feature}_model`]: model, openai_api_key: usePlatformKey ? platformKey : integrationConfig?.openai_api_key };
}

async function analyzeMedia(
  mediaUrl: string,
  mediaType: string,
  aiConfig: AIConfigResult
): Promise<string> {
  try {
    // Audio: use dedicated transcription APIs
    if (mediaType === 'audio') {
      if (aiConfig.provider === 'openai') {
        return await transcribeAudioWithWhisper(mediaUrl, aiConfig.apiKey, aiConfig.model);
      } else {
        return await transcribeAudioWithGemini(mediaUrl, aiConfig.apiKey, aiConfig.model);
      }
    }

    // For images - use vision API
    if (mediaType === 'image') {
      const visionImageUrl = await imageUrlForVision(mediaUrl);
      const response = await fetch(aiConfig.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Descreva esta imagem de forma MUITO BREVE (máximo 15 palavras) em português. Foque apenas no elemento principal.' },
              { type: 'image_url', image_url: { url: visionImageUrl } },
            ],
          }],
        }),
      });

      if (!response.ok) {
        console.error('Image analysis failed:', response.status, await response.text());
        return '[Imagem não analisada]';
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '[Imagem não analisada]';
    }

    // For video
    if (mediaType === 'video') {
      const response = await fetch(aiConfig.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Descreva este vídeo brevemente (máx 20 palavras) em português.' },
              { type: 'image_url', image_url: { url: mediaUrl } },
            ],
          }],
        }),
      });

      if (!response.ok) return '[Vídeo não analisado]';
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '[Vídeo não analisado]';
    }

    return '[Mídia não analisável]';
  } catch (error) {
    console.error('Media analysis error:', error);
    return `[Erro ao analisar ${mediaType}]`;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const isServiceRole = token === supabaseKey;

    // Valida o JWT quando não é chamada interna (service role). Antes, o header era
    // aceito sem validação e o bodyOrgId permitia pular o getUser — qualquer token
    // servia. Agora: não-service precisa de JWT válido e não pode escolher a org.
    let authUserId: string | null = null;
    if (!isServiceRole) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      authUserId = user.id;
    }

    const { messageId, mediaUrl, mediaType, force, organizationId: bodyOrgId } = await req.json();

    if (!messageId || !mediaUrl || !mediaType) {
      return new Response(JSON.stringify({ error: 'messageId, mediaUrl, and mediaType are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Bloqueia SSRF antes de qualquer uso de mediaUrl (fetch para vision/whisper).
    try {
      assertSafeMediaUrl(mediaUrl);
    } catch (e) {
      return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check cache first (skip if force=true)
    if (!force) {
      const { data: cached } = await supabase
        .from('media_transcriptions')
        .select('transcription')
        .eq('message_id', messageId)
        .maybeSingle();

      if (cached?.transcription && !isFailedMediaAnalysis(cached.transcription)) {
        console.log(`Cache hit for message ${messageId}`);
        return new Response(JSON.stringify({ transcription: cached.transcription, cached: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check cache by media_url (same audio reused across messages/flows)
      const { data: cachedByUrl } = await supabase
        .from('media_transcriptions')
        .select('transcription')
        .eq('media_url', mediaUrl)
        .maybeSingle();

      if (cachedByUrl?.transcription && !isFailedMediaAnalysis(cachedByUrl.transcription)) {
        console.log(`Cache hit by media_url for message ${messageId}`);
        // Save association for this message_id too
        await supabase.from('media_transcriptions').upsert({
          message_id: messageId,
          media_url: mediaUrl,
          media_type: mediaType,
          transcription: cachedByUrl.transcription,
        }, { onConflict: 'message_id' });
        return new Response(JSON.stringify({ transcription: cachedByUrl.transcription, cached: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      console.log(`Force transcription for message ${messageId}`);
      await supabase.from('media_transcriptions').delete().eq('message_id', messageId);
    }

    // Resolve organization ID a partir da mensagem (fonte de verdade), não do body.
    // O bodyOrgId só é aceito de chamador interno (service role); um usuário não pode
    // escolher a org (senão queima a chave de IA de outra org).
    const { data: messageOrg } = await supabase
      .from('messages')
      .select('conversation:conversations(organization_id)')
      .eq('id', messageId)
      .maybeSingle();
    const messageOrgId = (messageOrg as any)?.conversation?.organization_id || null;

    let resolvedOrgId: string | null = messageOrgId;
    if (isServiceRole && !resolvedOrgId) {
      // Chamada interna (flows) pode passar a org explicitamente quando a mensagem
      // ainda não tem conversa vinculada.
      resolvedOrgId = bodyOrgId || null;
    }

    // IDOR guard: usuário só transcreve mídia de mensagens de orgs de que é membro.
    if (!isServiceRole) {
      if (!messageOrgId) {
        return new Response(JSON.stringify({ error: 'Message not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const orgIds = await getUserOrganizationIds(supabase, authUserId!);
      if (!orgIds.includes(messageOrgId)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!resolvedOrgId) {
      return new Response(JSON.stringify({ error: 'Organização não encontrada para transcrição.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let integrationConfig = null;
    if (resolvedOrgId) {
      const { data } = await supabase
        .from('integration_configs')
        .select('*')
        .eq('organization_id', resolvedOrgId)
        .maybeSingle();
      integrationConfig = await applyAdminAIStrategy(supabase, resolvedOrgId, data, mediaType === 'audio' ? 'transcription' : 'conversation_summary');
    }

    const aiConfig = resolveAIConfig(integrationConfig, 'transcription');
    if (!aiConfig) {
      return new Response(JSON.stringify({ error: 'Nenhum provedor de IA configurado.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Analyzing ${mediaType} for message ${messageId} with ${aiConfig.provider}`);
    const transcription = await analyzeMedia(mediaUrl, mediaType, aiConfig);

    // Save to cache
    await supabase.from('media_transcriptions').upsert({
      message_id: messageId,
      media_url: mediaUrl,
      media_type: mediaType,
      transcription: transcription,
    }, { onConflict: 'message_id' });

    return new Response(JSON.stringify({ transcription, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Transcribe media error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
