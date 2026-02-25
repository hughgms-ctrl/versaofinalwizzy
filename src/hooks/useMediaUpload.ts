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
    conversationId: string
  ): Promise<UploadResult | null> => {
    setIsUploading(true);
    
    try {
      // Generate unique filename
      const ext = file.name.split('.').pop() || 'bin';
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      const fileName = `${conversationId}/${timestamp}-${randomId}.${ext}`;
      
      // Upload to storage
      const { data, error } = await supabase.storage
        .from('chat-media')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Upload error:', error);
        toast({
          title: 'Erro no upload',
          description: 'Não foi possível enviar o arquivo. Tente novamente.',
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
    conversationId: string
  ): Promise<UploadResult | null> => {
    // Convert blob to file
    const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
    const file = new File([blob], `audio.${ext}`, { type: blob.type });
    return uploadFile(file, conversationId);
  }, [uploadFile]);

  return {
    uploadFile,
    uploadAudioBlob,
    isUploading,
  };
}
