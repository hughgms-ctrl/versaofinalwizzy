import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Message {
  id: string;
  content: string | null;
  type: string;
  direction: 'inbound' | 'outbound';
  is_from_bot: boolean;
  media_url: string | null;
  created_at: string;
}

interface AnalysisResult {
  briefContext: string;
  fullSummary: string;
  mediaAnalysis: {
    messageId: string;
    type: string;
    description: string;
  }[];
}

async function getOrCreateTranscription(
  supabase: any,
  messageId: string,
  mediaUrl: string,
  mediaType: string,
  aiConfig: { endpoint: string; apiKey: string; model: string }
): Promise<string> {
  // Check cache first
  const { data: cached } = await supabase
    .from('media_transcriptions')
    .select('transcription')
    .eq('message_id', messageId)
    .maybeSingle();

  if (cached?.transcription) {
    console.log(`Cache hit for message ${messageId}`);
    return cached.transcription;
  }

  // Generate new transcription/description
  console.log(`Cache miss for message ${messageId}, analyzing...`);
  const transcription = await analyzeMedia(mediaUrl, mediaType, aiConfig);

  // Save to cache (fire and forget to not block)
  supabase.from('media_transcriptions').upsert({
    message_id: messageId,
    media_url: mediaUrl,
    media_type: mediaType,
    transcription: transcription,
  }, { onConflict: 'message_id' }).then(() => {
    console.log(`Cached transcription for ${messageId}`);
  }).catch((err: Error) => {
    console.error(`Failed to cache transcription: ${err.message}`);
  });

  return transcription;
}

async function analyzeMedia(mediaUrl: string, type: string, aiConfig: { endpoint: string; apiKey: string; model: string }): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout per media

  try {
    // For audio - transcribe using Gemini's multimodal capabilities
    if (type === 'audio') {
      const audioResponse = await fetch(mediaUrl, { signal: controller.signal });
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

      const isLovableGateway = aiConfig.endpoint.includes('ai.gateway.lovable.dev');
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
        signal: controller.signal,
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

    // For images - describe using Gemini's vision
    if (type === 'image') {
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
              { type: 'text', text: 'Descreva esta imagem de forma concisa em português. Foque nos elementos principais e qualquer texto visível. Se for um documento, extraia o conteúdo relevante.' },
              { type: 'image_url', image_url: { url: mediaUrl } },
            ],
          }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.error('Image analysis failed:', response.status);
        return '[Imagem não analisada]';
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '[Imagem não analisada]';
    }

    // For video - describe (placeholder for now)
    if (type === 'video') {
      return '[Conteúdo de vídeo]';
    }

    return '[Mídia não analisável]';
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Media analysis timed out');
      return `[Timeout ao analisar ${type}]`;
    }
    console.error('Media analysis error:', error);
    return `[Erro ao analisar ${type}]`;
  } finally {
    clearTimeout(timeout);
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

    const { conversationId, analyzeMedia: shouldAnalyzeMedia = true } = await req.json();

    if (!conversationId) {
      return new Response(JSON.stringify({ error: 'conversationId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch messages, conversation, and integration config in parallel
    const [messagesResult, conversationResult, integrationResult] = await Promise.all([
      supabase
        .from('messages')
        .select('id, content, type, direction, is_from_bot, media_url, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(50),
      supabase
        .from('conversations')
        .select('contact_id, organization_id')
        .eq('id', conversationId)
        .maybeSingle(),
      (async () => {
        // Get org_id first from conversation, then fetch config
        const { data: conv } = await supabase.from('conversations').select('organization_id').eq('id', conversationId).maybeSingle();
        if (!conv?.organization_id) return null;
        const { data } = await supabase.from('integration_configs').select('*').eq('organization_id', conv.organization_id).maybeSingle();
        return data;
      })(),
    ]);

    const { data: messages, error: messagesError } = messagesResult;
    const { data: conversation } = conversationResult;
    const integrationConfig = integrationResult;
    
    // Resolve AI config for conversation_summary feature
    const aiConfig = resolveAIConfigHelper(integrationConfig, 'conversation_summary', lovableApiKey);

    if (messagesError) {
      throw messagesError;
    }

    // Fetch contact notes if we have contact_id
    let contactNotes: { content: string; created_at: string }[] = [];
    if (conversation?.contact_id) {
      const { data: notes } = await supabase
        .from('contact_notes')
        .select('content, created_at')
        .eq('contact_id', conversation.contact_id)
        .order('created_at', { ascending: false })
        .limit(5);
      
      contactNotes = notes || [];
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({
        briefContext: 'Nenhuma mensagem na conversa.',
        fullSummary: 'Esta conversa ainda não possui mensagens.',
        mediaAnalysis: [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // First pass: check which media messages need transcription
    const mediaMessages = (messages as Message[]).filter(
      msg => (msg.type === 'audio' || msg.type === 'image') && msg.media_url
    );

    // Batch fetch all cached transcriptions
    const mediaIds = mediaMessages.map(m => m.id);
    const { data: cachedTranscriptions } = mediaIds.length > 0
      ? await supabase
          .from('media_transcriptions')
          .select('message_id, transcription')
          .in('message_id', mediaIds)
      : { data: [] };

    const transcriptionMap = new Map<string, string>();
    (cachedTranscriptions || []).forEach((t: { message_id: string; transcription: string }) => {
      transcriptionMap.set(t.message_id, t.transcription);
    });

    // Identify uncached media (limit to 5 to avoid timeout)
    const uncachedMedia = mediaMessages
      .filter(m => !transcriptionMap.has(m.id))
      .slice(0, 5);

    // Process uncached media in parallel (with concurrency limit)
    if (uncachedMedia.length > 0 && shouldAnalyzeMedia) {
      console.log(`Processing ${uncachedMedia.length} uncached media items...`);
      const transcriptionPromises = uncachedMedia.map(async (msg) => {
        const transcription = await getOrCreateTranscription(
          supabase,
          msg.id,
          msg.media_url!,
          msg.type,
          aiConfig
        );
        return { id: msg.id, transcription };
      });

      const results = await Promise.allSettled(transcriptionPromises);
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          transcriptionMap.set(result.value.id, result.value.transcription);
        }
      });
    }

    // Build transcript with all available info
    const mediaAnalysis: AnalysisResult['mediaAnalysis'] = [];
    const enhancedMessages: string[] = [];

    for (const msg of messages as Message[]) {
      const direction = msg.direction === 'inbound' ? 'Cliente' : (msg.is_from_bot ? 'Bot' : 'Atendente');
      const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      if (msg.type === 'text' && msg.content) {
        enhancedMessages.push(`[${time}] ${direction}: ${msg.content}`);
      } else if ((msg.type === 'audio' || msg.type === 'image') && msg.media_url) {
        const description = transcriptionMap.get(msg.id) || `[${msg.type === 'audio' ? 'Áudio' : 'Imagem'} não processado]`;
        
        mediaAnalysis.push({
          messageId: msg.id,
          type: msg.type,
          description,
        });

        if (msg.type === 'audio') {
          enhancedMessages.push(`[${time}] ${direction}: [ÁUDIO] "${description}"`);
        } else {
          enhancedMessages.push(`[${time}] ${direction}: [IMAGEM] ${description}`);
        }
      } else if (msg.type === 'video') {
        enhancedMessages.push(`[${time}] ${direction}: [VÍDEO] Vídeo enviado`);
      } else if (msg.type === 'document') {
        enhancedMessages.push(`[${time}] ${direction}: [DOCUMENTO] ${msg.content || 'Documento enviado'}`);
      } else {
        enhancedMessages.push(`[${time}] ${direction}: [${msg.type.toUpperCase()}]`);
      }
    }

    const conversationTranscript = enhancedMessages.join('\n');

    // Generate summary using AI with timeout
    const summaryController = new AbortController();
    const summaryTimeout = setTimeout(() => summaryController.abort(), 30000);

    try {
      const summaryResponse = await fetch(aiConfig.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [
            {
              role: 'system',
              content: `Você é um assistente de análise de conversas de atendimento ao cliente. 
Analise conversas de WhatsApp e forneça insights claros e úteis para a equipe de atendimento.
Responda sempre em português brasileiro.`
            },
            {
              role: 'user',
              content: `Analise esta conversa e forneça:

1. **CONTEXTO BREVE** (MÁXIMO 60 caracteres): Frase MUITO curta e direta sobre o status atual. Exemplo: "Cliente aguardando documento solicitado".

2. **RESUMO COMPLETO** (2-4 parágrafos): Análise detalhada incluindo:
   - O que o cliente precisa/quer
   - O que já foi feito/respondido
   - Pendências ou próximos passos
   - Tom emocional do cliente (satisfeito, frustrado, neutro)
   - Informações importantes mencionadas
   ${contactNotes.length > 0 ? '- Considere as notas de atendimento da equipe para contexto adicional' : ''}

${contactNotes.length > 0 ? `
NOTAS DE ATENDIMENTO DA EQUIPE (informações importantes registradas pelos atendentes):
${contactNotes.map(n => `- ${n.content}`).join('\n')}
` : ''}

Transcrição da conversa (inclui transcrições de áudio e descrições de imagens):
${conversationTranscript}

Responda no formato JSON:
{
  "briefContext": "frase curta aqui",
  "fullSummary": "resumo completo aqui"
}`
            }
          ],
          response_format: { type: 'json_object' },
        }),
        signal: summaryController.signal,
      });

      clearTimeout(summaryTimeout);

      if (!summaryResponse.ok) {
        console.error('Summary generation failed:', await summaryResponse.text());
        throw new Error('Failed to generate summary');
      }

      const summaryData = await summaryResponse.json();
      let summary: { briefContext: string; fullSummary: string };

      try {
        summary = JSON.parse(summaryData.choices?.[0]?.message?.content || '{}');
      } catch {
        summary = {
          briefContext: 'Análise em andamento...',
          fullSummary: summaryData.choices?.[0]?.message?.content || 'Não foi possível gerar o resumo.',
        };
      }

      const result: AnalysisResult = {
        briefContext: summary.briefContext || 'Conversa em andamento',
        fullSummary: summary.fullSummary || 'Resumo não disponível',
        mediaAnalysis,
      };

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      clearTimeout(summaryTimeout);
      if (error instanceof Error && error.name === 'AbortError') {
        // Return partial result on timeout
        return new Response(JSON.stringify({
          briefContext: 'Conversa em análise...',
          fullSummary: 'A análise demorou mais que o esperado. Tente novamente.',
          mediaAnalysis,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw error;
    }

  } catch (error) {
    console.error('Analysis error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function resolveAIConfigHelper(integrationConfig: any, feature: string, lovableApiKey: string) {
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
      if (!integrationConfig.openai_api_key) return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableApiKey, model: 'google/gemini-2.5-flash' };
      return { endpoint: OPENAI_ENDPOINT, apiKey: integrationConfig.openai_api_key, model };
    case 'gemini':
      if (!integrationConfig.gemini_api_key) return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableApiKey, model: 'google/gemini-2.5-flash' };
      return { endpoint: GEMINI_ENDPOINT, apiKey: integrationConfig.gemini_api_key, model };
    default:
      return { endpoint: LOVABLE_ENDPOINT, apiKey: lovableApiKey, model };
  }
}
