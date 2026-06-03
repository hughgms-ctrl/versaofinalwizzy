import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface MediaTranscriptionProps {
  transcription: string | undefined;
  isLoading: boolean;
  type: 'audio' | 'image' | 'video';
  isInbound?: boolean;
  allowTranscribe?: boolean;
  messageId?: string;
  mediaUrl?: string;
  onTranscriptionUpdate?: (transcription: string) => void;
}

/**
 * Discrete display for auto-transcription/description of media.
 * Shows inline below audio/image/video content.
 */
export function MediaTranscription({ 
  transcription, 
  isLoading, 
  type,
  isInbound = true,
  allowTranscribe = true,
  messageId,
  mediaUrl,
  onTranscriptionUpdate,
}: MediaTranscriptionProps) {
  const [isForcing, setIsForcing] = useState(false);

  const handleTranscribe = async (force = false) => {
    if (!messageId || !mediaUrl || isForcing) return;
    setIsForcing(true);
    try {
      const { data, error } = await supabase.functions.invoke('transcribe-media', {
        body: { messageId, mediaUrl, mediaType: type, force },
      });
      if (!error && data?.transcription) {
        onTranscriptionUpdate?.(data.transcription);
      }
    } catch (err) {
      console.error('Transcribe error:', err);
    } finally {
      setIsForcing(false);
    }
  };

  if (isLoading || isForcing) {
    return (
      <div className="flex items-center gap-1.5 mt-1.5">
        <Loader2 className="h-3 w-3 animate-spin opacity-50" />
        <span className={cn(
          "text-[10px] italic",
          isInbound ? "text-muted-foreground" : "opacity-60"
        )}>
          {type === 'audio' ? 'Transcrevendo...' : 'Analisando...'}
        </span>
      </div>
    );
  }

  // No transcription: show a small retry button
  if (!transcription && messageId && mediaUrl) {
    if (!allowTranscribe) return null;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => handleTranscribe(false)}
            className={cn(
              "flex items-center gap-1 mt-1.5 text-[10px] opacity-50 hover:opacity-80 transition-opacity cursor-pointer",
              isInbound ? "text-muted-foreground" : "text-white/60"
            )}
          >
            <RefreshCw className="h-2.5 w-2.5" />
            <span>Transcrever</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">Forçar transcrição por IA</TooltipContent>
      </Tooltip>
    );
  }

  if (!transcription) return null;

  const prefix = type === 'audio' ? '' : type === 'image' ? '📷 ' : '🎬 ';
  const isQuoted = type === 'audio';

  return (
    <div className={cn(
      "group mt-1.5 py-1 px-2 rounded text-[11px] italic leading-relaxed flex items-start gap-1",
      isInbound 
        ? "bg-muted/50 text-muted-foreground" 
        : "bg-black/10 opacity-80"
    )}>
      <span className="flex-1">
        {isQuoted ? `"${transcription}"` : `${prefix}${transcription}`}
      </span>
      {allowTranscribe && messageId && mediaUrl && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => handleTranscribe(true)}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity flex-shrink-0 mt-0.5 cursor-pointer"
            >
              <RefreshCw className="h-2.5 w-2.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Re-transcrever</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
