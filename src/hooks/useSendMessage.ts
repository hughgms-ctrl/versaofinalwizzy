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

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, content, type = 'text', mediaUrl, quotedMessageId, quotedContent, quotedSender }: SendMessageParams) => {
      const { data, error } = await supabase.functions.invoke('whatsapp-send-message', {
        body: { conversationId, content, type, mediaUrl, quotedMessageId, quotedContent, quotedSender },
        headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onMutate: async (newMessage) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['messages', newMessage.conversationId] });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData<DbMessage[]>(['messages', newMessage.conversationId]);

      // Optimistically update to the new value
      if (previousMessages) {
        const optimisticMessage: DbMessage = {
          id: `temp-${Date.now()}`,
          conversation_id: newMessage.conversationId,
          content: newMessage.content,
          type: newMessage.type || 'text',
          direction: 'outbound',
          is_from_bot: false,
          sent_by: (await supabase.auth.getUser()).data.user?.id || null,
          created_at: new Date().toISOString(),
          read_at: null,
          delivered_at: null,
          media_url: newMessage.mediaUrl || null,
          metadata: newMessage.quotedMessageId ? {
            quoted_message: {
              id: newMessage.quotedMessageId,
              content: newMessage.quotedContent || '',
              sender: newMessage.quotedSender || '',
            }
          } : undefined,
        };

        queryClient.setQueryData<DbMessage[]>(
          ['messages', newMessage.conversationId],
          [...previousMessages, optimisticMessage]
        );
      }

      // Return a context object with the snapshotted value
      return { previousMessages };
    },
    onError: (err, newMessage, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousMessages) {
        queryClient.setQueryData(
          ['messages', newMessage.conversationId],
          context.previousMessages
        );
      }

      console.error('Send message error:', err);
      toast({
        title: 'Erro ao enviar mensagem',
        description: err instanceof Error ? err.message : 'Não foi possível enviar a mensagem. Tente novamente.',
        variant: 'destructive',
      });
    },
    onSettled: (data, error, variables) => {
      // Always refetch after error or success to keep server state in sync
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
