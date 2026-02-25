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

function resolveAIConfig(integrationConfig: any, feature: string, lovableApiKey: string): AIConfigResult {
  const LOVABLE_ENDPOINT = 'https://ai.gateway.lovable.dev/v1/chat/completions';
  const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
  const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

  if (!integrationConfig) {
    return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableApiKey, model: 'google/gemini-2.5-flash' };
  }

  const featureProvider = integrationConfig[`${feature}_provider`];
  const featureModel = integrationConfig[`${feature}_model`];
  const provider = featureProvider || integrationConfig.ai_provider || 'lovable';
  const model = featureModel || integrationConfig.default_model || 'google/gemini-2.5-flash';

  switch (provider) {
    case 'openai':
      if (!integrationConfig.openai_api_key) {
        console.warn('OpenAI selected but no API key, falling back to Lovable');
        return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableApiKey, model: 'google/gemini-2.5-flash' };
      }
      return { endpoint: OPENAI_ENDPOINT, apiKey: integrationConfig.openai_api_key, model };
    case 'gemini':
      if (!integrationConfig.gemini_api_key) {
        console.warn('Gemini selected but no API key, falling back to Lovable');
        return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableApiKey, model: 'google/gemini-2.5-flash' };
      }
      return { endpoint: GEMINI_ENDPOINT, apiKey: integrationConfig.gemini_api_key, model };
    default:
      return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableApiKey, model };
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
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { messageId, mediaUrl, mediaType, force } = await req.json();

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

    // Resolve AI config from org
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let integrationConfig = null;
    if (profile?.organization_id) {
      const { data } = await supabase
        .from('integration_configs')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .maybeSingle();
      integrationConfig = data;
    }

    const aiConfig = resolveAIConfig(integrationConfig, 'transcription', lovableApiKey);
    console.log(`Cache miss for message ${messageId}, analyzing ${mediaType} with provider=${integrationConfig?.transcription_provider || integrationConfig?.ai_provider || 'lovable'}`);

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
