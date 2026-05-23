import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TranscriptionResult {
  transcription: string;
  isLoading: boolean;
  error: string | null;
}

interface CachedTranscription {
  message_id: string;
  transcription: string;
  media_type: string;
}

function isFailedMediaAnalysis(value?: string | null) {
  if (!value) return false;
  return [
    '[Imagem não analisada]',
    '[Imagem nÃ£o analisada]',
    '[Transcrição não disponível]',
    '[TranscriÃ§Ã£o nÃ£o disponÃ­vel]',
    '[Áudio não disponível]',
    '[Ãudio nÃ£o disponÃ­vel]',
  ].includes(value.trim());
}

/**
 * Hook to auto-fetch transcription/description for media messages.
 * First checks cache, then triggers analysis if not cached.
 */
export function useMediaTranscription(
  messageId: string | null,
  mediaUrl: string | null,
  mediaType: 'audio' | 'image' | 'video' | null
): TranscriptionResult {
  const [transcription, setTranscription] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTranscription = useCallback(async () => {
    if (!messageId || !mediaUrl || !mediaType) return;

    setIsLoading(true);
    setError(null);

    try {
      // First check cache
      const { data: cached, error: cacheError } = await supabase
        .from('media_transcriptions')
        .select('transcription')
        .eq('message_id', messageId)
        .maybeSingle();

      const hasFailedCache = isFailedMediaAnalysis(cached?.transcription);
      if (cached?.transcription && !hasFailedCache) {
        setTranscription(cached.transcription);
        setIsLoading(false);
        return;
      }

      // If not cached, trigger the analyze-conversation edge function
      // which will analyze and cache this media
      const { data, error: fnError } = await supabase.functions.invoke('transcribe-media', {
        body: { messageId, mediaUrl, mediaType, force: hasFailedCache },
      });

      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);

      setTranscription(data.transcription || '');
    } catch (err) {
      console.error('Transcription error:', err);
      setError('Erro ao processar mídia');
    } finally {
      setIsLoading(false);
    }
  }, [messageId, mediaUrl, mediaType]);

  useEffect(() => {
    fetchTranscription();
  }, [fetchTranscription]);

  return { transcription, isLoading, error };
}

/**
 * Hook to batch-fetch transcriptions for multiple messages.
 * First loads from cache, then triggers analysis for missing ones.
 */
export function useMediaTranscriptions(messageIds: string[]) {
  const [transcriptions, setTranscriptions] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const pendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (messageIds.length === 0) return;

    // Filter out temp IDs (non-UUID) to avoid Supabase 400 errors
    const validIds = messageIds.filter(id => !id.startsWith('temp-'));

    const fetchAll = async () => {
      if (validIds.length === 0) return;
      setIsLoading(true);
      try {
        // First, fetch all cached transcriptions
        const { data, error } = await supabase
          .from('media_transcriptions')
          .select('message_id, transcription')
          .in('message_id', validIds);

        if (error) throw error;

        const map: Record<string, string> = {};
        data?.forEach((item: CachedTranscription) => {
          if (!isFailedMediaAnalysis(item.transcription)) {
            map[item.message_id] = item.transcription;
          }
        });
        setTranscriptions(map);

        // Find messages without transcription and not already pending
        const missingIds = validIds.filter(id => !map[id] && !pendingRef.current.has(id));
        
        // Trigger analysis for missing ones (in background, don't block)
        if (missingIds.length > 0) {
          // Get message details to trigger analysis
          const { data: messages } = await supabase
            .from('messages')
            .select('id, media_url, type')
            .in('id', missingIds)
            .in('type', ['audio', 'image', 'video']);

          if (messages) {
            for (const msg of messages) {
              if (msg.media_url && !pendingRef.current.has(msg.id)) {
                pendingRef.current.add(msg.id);
                // Trigger transcription in background
                supabase.functions.invoke('transcribe-media', {
                  body: { messageId: msg.id, mediaUrl: msg.media_url, mediaType: msg.type, force: true },
                }).then(({ data: result }) => {
                  if (result?.transcription) {
                    setTranscriptions(prev => ({ ...prev, [msg.id]: result.transcription }));
                  }
                  pendingRef.current.delete(msg.id);
                }).catch(() => {
                  pendingRef.current.delete(msg.id);
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('Error fetching transcriptions:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAll();
  }, [messageIds.join(',')]);

  return { transcriptions, isLoading };
}

