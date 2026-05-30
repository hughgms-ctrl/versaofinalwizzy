import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AIConfigResult {
  endpoint: string;
  apiKey: string;
  model: string;
  provider: string;
}

function resolveAIConfig(integrationConfig: any, feature: string): AIConfigResult | null {
  const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
  const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

  if (!integrationConfig) return null;

  const featureProvider = integrationConfig[`${feature}_provider`];
  const featureModel = integrationConfig[`${feature}_model`];
  let provider = featureProvider || integrationConfig.ai_provider;
  let model = featureModel || integrationConfig.default_model;

  if (!provider || provider === 'lovable') {
    if (integrationConfig.openai_api_key) { provider = 'openai'; model = model || 'gpt-4o-mini'; }
    else if (integrationConfig.gemini_api_key) { provider = 'gemini'; model = model || 'gemini-2.0-flash'; }
    else return null;
  }
  if (provider === 'gemini') model = (model || 'gemini-2.0-flash').replace('google/', '');
  else if (provider === 'openai') model = (model || 'gpt-4o-mini').replace('openai/', '');

  switch (provider) {
    case 'openai':
      if (!integrationConfig.openai_api_key) return null;
      return { endpoint: OPENAI_ENDPOINT, apiKey: integrationConfig.openai_api_key, model, provider: 'openai' };
    case 'gemini':
      if (!integrationConfig.gemini_api_key) return null;
      return { endpoint: GEMINI_ENDPOINT, apiKey: integrationConfig.gemini_api_key, model, provider: 'gemini' };
    default:
      return null;
  }
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

async function transcribeAudioWithWhisper(mediaUrl: string, apiKey: string): Promise<string> {
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
    formData.append('model', 'whisper-1');
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

async function analyzeMedia(
  mediaUrl: string,
  mediaType: string,
  aiConfig: AIConfigResult
): Promise<string> {
  try {
    // Audio: use dedicated transcription APIs
    if (mediaType === 'audio') {
      if (aiConfig.provider === 'openai') {
        return await transcribeAudioWithWhisper(mediaUrl, aiConfig.apiKey);
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
    const { messageId, mediaUrl, mediaType, force, organizationId: bodyOrgId } = await req.json();

    if (!messageId || !mediaUrl || !mediaType) {
      return new Response(JSON.stringify({ error: 'messageId, mediaUrl, and mediaType are required' }), {
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

    // Resolve organization ID
    let resolvedOrgId = bodyOrgId || null;
    if (!resolvedOrgId) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();
      resolvedOrgId = profile?.organization_id;
    }

    let integrationConfig = null;
    if (resolvedOrgId) {
      const { data } = await supabase
        .from('integration_configs')
        .select('*')
        .eq('organization_id', resolvedOrgId)
        .maybeSingle();
      integrationConfig = data;
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
