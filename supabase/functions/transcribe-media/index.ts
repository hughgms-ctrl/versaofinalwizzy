import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AIConfigResult {
  endpoint: string;
  apiKey: string;
  model: string;
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
      return { endpoint: OPENAI_ENDPOINT, apiKey: integrationConfig.openai_api_key, model };
    case 'gemini':
      if (!integrationConfig.gemini_api_key) return null;
      return { endpoint: GEMINI_ENDPOINT, apiKey: integrationConfig.gemini_api_key, model };
    default:
      return null;
  }
}

async function analyzeMedia(
  mediaUrl: string,
  mediaType: string,
  aiConfig: AIConfigResult
): Promise<string> {
  try {
    const isLovableGateway = aiConfig.endpoint.includes('ai.gateway.lovable.dev');

    if (mediaType === 'audio') {
      const audioResponse = await fetch(mediaUrl);
      if (!audioResponse.ok) {
        console.error('Failed to fetch audio:', audioResponse.status);
        return '[Áudio não disponível]';
      }

      const audioBuffer = await audioResponse.arrayBuffer();
      const bytes = new Uint8Array(audioBuffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const base64Audio = btoa(binary);

      let mimeType = 'audio/ogg';
      if (mediaUrl.includes('.mp3')) mimeType = 'audio/mpeg';
      else if (mediaUrl.includes('.wav')) mimeType = 'audio/wav';
      else if (mediaUrl.includes('.m4a')) mimeType = 'audio/mp4';
      else if (mediaUrl.includes('.webm')) mimeType = 'audio/webm';

      const dataUrl = `data:${mimeType};base64,${base64Audio}`;
      console.log(`Transcribing audio: ${audioBuffer.byteLength} bytes, mimeType: ${mimeType}`);

      let requestBody: any;
      if (isLovableGateway) {
        let format = 'ogg';
        if (mimeType.includes('mpeg')) format = 'mp3';
        else if (mimeType.includes('wav')) format = 'wav';
        else if (mimeType.includes('mp4')) format = 'm4a';
        else if (mimeType.includes('webm')) format = 'webm';

        requestBody = {
          model: aiConfig.model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Transcreva este áudio de mensagem de voz em português brasileiro. Forneça APENAS a transcrição literal do que foi dito, sem comentários, marcações ou formatação. Se não conseguir entender, responda "[Áudio inaudível]".' },
              { type: 'input_audio', input_audio: { data: base64Audio, format } },
            ],
          }],
        };
      } else {
        requestBody = {
          model: aiConfig.model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Transcreva este áudio de mensagem de voz em português brasileiro. Forneça APENAS a transcrição literal do que foi dito, sem comentários, marcações ou formatação. Se não conseguir entender, responda "[Áudio inaudível]".' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          }],
        };
      }

      const response = await fetch(aiConfig.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Audio transcription failed:', response.status, errText);
        return '[Transcrição não disponível]';
      }

      const data = await response.json();
      const transcription = data.choices?.[0]?.message?.content || '[Transcrição não disponível]';
      console.log('Transcription result:', transcription.substring(0, 100));
      return transcription;
    }

    // For images
    if (mediaType === 'image') {
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
              { type: 'text', text: 'Descreva esta imagem de forma MUITO BREVE (máximo 15 palavras) em português. Foque apenas no elemento principal. Se for texto/documento, cite o conteúdo principal.' },
              { type: 'image_url', image_url: { url: mediaUrl } },
            ],
          }],
        }),
      });

      if (!response.ok) {
        console.error('Image analysis failed:', response.status);
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
              { type: 'text', text: 'Este é um link de vídeo. Analise o vídeo e forneça uma descrição MUITO BREVE (máximo 20 palavras) do conteúdo visual e transcrição do áudio se houver. Responda em português.' },
              { type: 'image_url', image_url: { url: mediaUrl } },
            ],
          }],
        }),
      });

      if (!response.ok) {
        console.error('Video analysis failed:', response.status);
        return '[Vídeo não analisado]';
      }

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

    // Verify auth - support both user auth (UI) and service role (webhook auto-transcription)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');

    const { messageId, mediaUrl, mediaType, force, organizationId: bodyOrgId } = await req.json();

    if (!messageId || !mediaUrl || !mediaType) {
      return new Response(JSON.stringify({ error: 'messageId, mediaUrl, and mediaType are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check cache first (skip if force=true)
    if (!force) {
      const { data: cached } = await supabase
        .from('media_transcriptions')
        .select('transcription')
        .eq('message_id', messageId)
        .maybeSingle();

      if (cached?.transcription) {
        console.log(`Cache hit for message ${messageId}`);
        return new Response(JSON.stringify({
          transcription: cached.transcription,
          cached: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      console.log(`Force transcription for message ${messageId}`);
      // Delete existing cache entry
      await supabase.from('media_transcriptions').delete().eq('message_id', messageId);
    }

    // Resolve organization ID - either from body (webhook) or from user auth (UI)
    let resolvedOrgId = bodyOrgId || null;

    if (!resolvedOrgId) {
      // Try user auth (UI context)
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      return new Response(JSON.stringify({ error: 'Nenhum provedor de IA configurado. Acesse Configurações > Integrações e adicione sua chave de API.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`Cache miss for message ${messageId}, analyzing ${mediaType} with provider=${integrationConfig?.transcription_provider || integrationConfig?.ai_provider || 'configured'}`);

    const transcription = await analyzeMedia(mediaUrl, mediaType, aiConfig);

    // Save to cache
    await supabase.from('media_transcriptions').upsert({
      message_id: messageId,
      media_url: mediaUrl,
      media_type: mediaType,
      transcription: transcription,
    }, { onConflict: 'message_id' });

    return new Response(JSON.stringify({
      transcription,
      cached: false
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Transcribe media error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
