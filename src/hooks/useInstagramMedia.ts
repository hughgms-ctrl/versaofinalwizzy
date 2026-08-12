import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Posts e reels da conta conectada.
 *
 * Virou hook (em vez de um fetch dentro do seletor) quando a prévia passou a
 * desenhar o post escolhido: os dois precisam da mesma lista, e o react-query
 * faz a segunda leitura sair do cache em vez de gastar outra chamada na Meta —
 * que tem cota por hora e é compartilhada com o envio das automações.
 */

export interface InstagramMediaItem {
  id: string;
  caption: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
}

export function useInstagramMedia(accountId: string | undefined) {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['instagram-media', accountId],
    queryFn: async (): Promise<InstagramMediaItem[]> => {
      if (!accountId) return [];
      const { data, error } = await supabase.functions.invoke(
        `instagram-list-media?accountId=${encodeURIComponent(accountId)}`,
        { headers: { Authorization: `Bearer ${session?.access_token}` } },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data?.items || [];
    },
    enabled: !!accountId && !!session?.access_token,
    // A lista muda quando o cliente publica, o que não acontece enquanto ele
    // monta uma automação. Cinco minutos evitam refetch a cada foco de janela.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
