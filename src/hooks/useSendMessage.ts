import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { DbMessage } from './useConversations';

interface SendMessageParams {
  conversationId: string;
  content: string;
  type?: 'text' | 'image' | 'audio' | 'document';
  mediaUrl?: string;
  quotedMessageId?: string;
  quotedContent?: string;
  quotedSender?: string;
}

function normalizeFunctionErrorMessage(message: unknown) {
  const text = typeof message === 'string' ? message : '';
  if (!text) return 'Nao foi possivel enviar a mensagem. Tente novamente.';

  try {
    const parsed = JSON.parse(text);
    if (parsed?.code === 401 || /invalid token/i.test(parsed?.message || '')) {
      return 'Token da instancia do provedor WhatsApp invalido. Reconecte a instancia ou atualize as credenciais.';
    }
    return parsed?.message || parsed?.error || text;
  } catch {
    if (/invalid token/i.test(text)) {
      return 'Token da instancia do provedor WhatsApp invalido. Reconecte a instancia ou atualize as credenciais.';
    }
    return text;
  }
}

async function getFunctionErrorMessage(error: any) {
  const context = error?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      return normalizeFunctionErrorMessage(body?.details || body?.error || error.message);
    } catch {
      return normalizeFunctionErrorMessage(error.message);
    }
  }

  return normalizeFunctionErrorMessage(error?.message);
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, content, type = 'text', mediaUrl, quotedMessageId, quotedContent, quotedSender }: SendMessageParams) => {
      const { data, error } = await supabase.functions.invoke('zapi-send-message', {
        body: { conversationId, content, type, mediaUrl, quotedMessageId, quotedContent, quotedSender },
        headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` }
      });

      if (error) throw new Error(await getFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onMutate: async (newMessage) => {
      await queryClient.cancelQueries({ queryKey: ['messages', newMessage.conversationId] });

      // O cache de ['messages', id] e InfiniteData (paginacao keyset em
      // useMessages): { pages: DbMessage[][], pageParams }. NUNCA e um array
      // plano — tratar como array aqui lanca "previousMessages is not iterable".
      const previousMessages = queryClient.getQueryData(['messages', newMessage.conversationId]);
      const previousConversations = queryClient.getQueriesData({ queryKey: ['conversations'] });
      const now = new Date().toISOString();

      const optimisticMessage: DbMessage = {
        zapi_message_id: null,
        id: `temp-${Date.now()}`,
        conversation_id: newMessage.conversationId,
        content: newMessage.content,
        type: newMessage.type || 'text',
        direction: 'outbound',
        is_from_bot: false,
        sent_by: null,
        created_at: now,
        read_at: null,
        delivered_at: null,
        failed_at: null,
        error_message: null,
        media_url: newMessage.mediaUrl || null,
        metadata: newMessage.quotedMessageId ? {
          quoted_message: {
            id: newMessage.quotedMessageId,
            content: newMessage.quotedContent || '',
            sender: newMessage.quotedSender || '',
          }
        } : undefined,
      };

      // Insere o otimista no topo da pagina 0 (a mais nova, em DESC) — igual ao
      // handler de realtime INSERT em useMessages. O flatten reordena por
      // created_at, entao a mensagem aparece no fim do chat.
      queryClient.setQueryData(
        ['messages', newMessage.conversationId],
        (old: any) => {
          if (!old?.pages?.length) return old;
          const pages = old.pages.slice();
          pages[0] = [optimisticMessage, ...pages[0]];
          return { ...old, pages };
        }
      );

      queryClient.setQueriesData({ queryKey: ['conversations'] }, (old: any) => {
        if (!Array.isArray(old)) return old;

        return old.map((conversation) => {
          if (conversation.id !== newMessage.conversationId) return conversation;

          return {
            ...conversation,
            last_message_at: now,
            last_message: [{
              id: `temp-last-${Date.now()}`,
              content: newMessage.content,
              type: newMessage.type || 'text',
              direction: 'outbound',
              is_from_bot: false,
              read_at: null,
              delivered_at: null,
            }],
          };
        });
      });

      return { previousMessages, previousConversations };
    },
    onError: (err, newMessage, context) => {
      // IMPORTANT: Do NOT revert the optimistic state here.
      // zapi-send-message saves the message to the DB even on provider failure (with failed_at set).
      // Reverting would make the message disappear from the screen even though it's in the DB.
      // Instead, invalidate queries so the real DB state is fetched.
      console.error('Send message error:', err);

      // Invalidate to fetch real state from DB (message may have been saved despite error)
      queryClient.invalidateQueries({ queryKey: ['messages', newMessage.conversationId] });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }, 800);

      toast({
        title: 'Erro ao enviar mensagem',
        description: err instanceof Error ? err.message : 'Nao foi possivel enviar a mensagem. Tente novamente.',
        variant: 'destructive',
      });
    },
    onSettled: (data, error, variables) => {
      // Always refetch to ensure real DB state is shown (catches race conditions and realtime gaps)
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }, 1500);
    },
  });
}
