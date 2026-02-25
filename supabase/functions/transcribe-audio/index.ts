import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';

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

    const { audioUrl, messageId } = await req.json();

    if (!messageId) {
      return new Response(JSON.stringify({ error: 'messageId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve the real media URL from DB
    const { data: msg, error: msgError } = await supabase
      .from('messages')
      .select('id, type, media_url, conversation_id')
      .eq('id', messageId)
      .maybeSingle();

    if (msgError || !msg) {
      console.error('Message not found:', msgError);
      return new Response(JSON.stringify({ error: 'Mensagem não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (msg.type !== 'audio' || !msg.media_url) {
      return new Response(JSON.stringify({ error: 'Mensagem não contém áudio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const effectiveAudioUrl = msg.media_url;

    // Authorization: ensure user belongs to the org of this conversation
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError || !profile?.organization_id) {
      return new Response(JSON.stringify({ error: 'Perfil não encontrado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('organization_id')
      .eq('id', msg.conversation_id)
      .maybeSingle();

    if (convError || !conv?.organization_id || conv.organization_id !== profile.organization_id) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve AI config from org integration_configs
    const { data: integrationConfig } = await supabase
      .from('integration_configs')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .maybeSingle();

    const aiConfig = resolveAIConfig(integrationConfig, 'transcription', lovableApiKey);
    console.log(`AI Config resolved: provider=${integrationConfig?.transcription_provider || integrationConfig?.ai_provider || 'lovable'}, model=${aiConfig.model}`);

    // Check cache first
    const { data: cached } = await supabase
      .from('media_transcriptions')
      .select('transcription')
      .eq('message_id', messageId)
      .single();

    if (cached?.transcription) {
      console.log(`Cache hit for message ${messageId}`);
      return new Response(JSON.stringify({
        transcription: cached.transcription,
        messageId,
        cached: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Transcribing audio:', effectiveAudioUrl);

    // Download the audio file
    const audioResponse = await fetch(effectiveAudioUrl);
    if (!audioResponse.ok) {
      console.error('Failed to download audio:', audioResponse.status);
      return new Response(JSON.stringify({ error: 'Não foi possível baixar o áudio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const bytes = new Uint8Array(audioBuffer);
    const base64Audio = encodeBase64(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

    // Determine format from URL, content-type header, or magic bytes
    const contentType = (audioResponse.headers.get('content-type') || '').toLowerCase();
    const urlLower = effectiveAudioUrl.toLowerCase();
    const magic = String.fromCharCode(...bytes.slice(0, 4));

    let format: 'ogg' | 'mp3' | 'wav' | 'm4a' | 'webm' = 'ogg';
    let mimeType = 'audio/ogg';

    if (urlLower.includes('.mp3')) { format = 'mp3'; mimeType = 'audio/mpeg'; }
    else if (urlLower.includes('.wav')) { format = 'wav'; mimeType = 'audio/wav'; }
    else if (urlLower.includes('.m4a')) { format = 'm4a'; mimeType = 'audio/mp4'; }
    else if (urlLower.includes('.webm')) { format = 'webm'; mimeType = 'audio/webm'; }
    else if (urlLower.includes('.ogg')) { format = 'ogg'; mimeType = 'audio/ogg'; }

    if (contentType.includes('audio/mpeg')) { format = 'mp3'; mimeType = 'audio/mpeg'; }
    else if (contentType.includes('audio/wav') || contentType.includes('audio/x-wav')) { format = 'wav'; mimeType = 'audio/wav'; }
    else if (contentType.includes('audio/mp4') || contentType.includes('audio/x-m4a')) { format = 'm4a'; mimeType = 'audio/mp4'; }
    else if (contentType.includes('audio/webm')) { format = 'webm'; mimeType = 'audio/webm'; }
    else if (contentType.includes('audio/ogg') || contentType.includes('application/ogg')) { format = 'ogg'; mimeType = 'audio/ogg'; }

    if (magic === 'OggS') { format = 'ogg'; mimeType = 'audio/ogg'; }
    else if (magic === 'RIFF') { format = 'wav'; mimeType = 'audio/wav'; }
    else if (magic.startsWith('ID3') || (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0)) { format = 'mp3'; mimeType = 'audio/mpeg'; }

    console.log('Audio size:', audioBuffer.byteLength, 'bytes, format:', format, 'content-type:', contentType);

    // Build the request based on the provider
    const isLovableGateway = aiConfig.endpoint.includes('ai.gateway.lovable.dev');
    const dataUrl = `data:${mimeType};base64,${base64Audio}`;
    
    let requestBody: any;
    
    if (isLovableGateway) {
      // Lovable gateway supports input_audio format
      requestBody = {
        model: aiConfig.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Transcreva este áudio em português brasileiro. Forneça apenas a transcrição literal do que foi dito, sem comentários adicionais. Se não conseguir entender, indique com [...]. Se inaudível, responda: [Áudio inaudível]' },
            { type: 'input_audio', input_audio: { data: base64Audio, format } },
          ],
        }],
        temperature: 0,
      };
    } else {
      // For direct Gemini/OpenAI APIs, use image_url with data URL (works for multimodal)
      requestBody = {
        model: aiConfig.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Transcreva este áudio em português brasileiro. Forneça apenas a transcrição literal do que foi dito, sem comentários adicionais. Se não conseguir entender, indique com [...]. Se inaudível, responda: [Áudio inaudível]' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        }],
        temperature: 0,
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
      const errorText = await response.text();
      console.error('Transcription API error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos insuficientes para transcrição.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Erro ao transcrever áudio. Tente novamente.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const transcription = data.choices?.[0]?.message?.content || '[Transcrição não disponível]';

    console.log('Transcription result:', transcription.substring(0, 100));

    // Save to cache
    await supabase.from('media_transcriptions').upsert({
      message_id: messageId,
      media_url: effectiveAudioUrl,
      media_type: 'audio',
      transcription: transcription,
    }, { onConflict: 'message_id' });

    return new Response(JSON.stringify({
      transcription,
      messageId,
      cached: false,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Transcription error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno ao transcrever' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
