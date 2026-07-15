import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface UploadResult {
  url: string;
  path: string;
}

export function useMediaUpload() {
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = useCallback(async (
    file: File,
    conversationId: string,
    organizationId: string | null | undefined
  ): Promise<UploadResult | null> => {
    // Bucket público mas com WRITE escopado por org (migration 20260714130000): o
    // path tem de começar com o orgId do usuário, senão a policy rejeita o upload.
    if (!organizationId) {
      toast({
        title: 'Erro no upload',
        description: 'Sessão sem organização. Recarregue a página e tente novamente.',
        variant: 'destructive',
      });
      return null;
    }
    setIsUploading(true);

    try {
      // Generate unique filename
      const ext = file.name.split('.').pop() || 'bin';
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      const fileName = `${organizationId}/${conversationId}/${timestamp}-${randomId}.${ext}`;
      
      // Upload to storage
      const { data, error } = await supabase.storage
        .from('chat-media')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Upload error:', error, 'File:', file.name, 'Type:', file.type, 'Size:', file.size);
        const msg = (error as any)?.message || '';
        let description = 'Não foi possível enviar o arquivo. Tente novamente.';
        if (msg.toLowerCase().includes('mime') || msg.toLowerCase().includes('type')) {
          description = `Formato não suportado: ${file.type || 'desconhecido'}.`;
        } else if (msg.toLowerCase().includes('size') || msg.toLowerCase().includes('large')) {
          description = `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite: 100 MB.`;
        } else if (msg) {
          description = msg;
        }
        toast({
          title: 'Erro no upload',
          description,
          variant: 'destructive',
        });
        return null;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('chat-media')
        .getPublicUrl(data.path);

      return {
        url: urlData.publicUrl,
        path: data.path,
      };
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Erro no upload',
        description: 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const uploadAudioBlob = useCallback(async (
    blob: Blob,
    conversationId: string,
    organizationId: string | null | undefined
  ): Promise<UploadResult | null> => {
    const mimeType = (blob.type || 'audio/webm').split(';')[0].trim();
    const ext = mimeType.includes('ogg')
      ? 'ogg'
      : mimeType.includes('mpeg') || mimeType.includes('mp3')
        ? 'mp3'
        : mimeType.includes('mp4')
          ? 'm4a'
          : 'webm';
    const file = new File([blob], `audio.${ext}`, { type: mimeType });
    return uploadFile(file, conversationId, organizationId);
  }, [uploadFile]);

  return {
    uploadFile,
    uploadAudioBlob,
    isUploading,
  };
}
