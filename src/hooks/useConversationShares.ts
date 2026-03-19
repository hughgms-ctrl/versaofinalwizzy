import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface ConversationShare {
  id: string;
  conversation_id: string;
  user_id: string;
  shared_by: string | null;
  organization_id: string;
  note: string | null;
  created_at: string;
}

export function useConversationShares(userId?: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['conversation-shares', userId || profile?.user_id],
    queryFn: async () => {
      const targetUserId = userId || profile?.user_id;
      if (!targetUserId) return [];

      const { data, error } = await supabase
        .from('conversation_shares' as any)
        .select('*')
        .eq('user_id', targetUserId);

      if (error) throw error;
      return (data || []) as unknown as ConversationShare[];
    },
    enabled: !!(userId || profile?.user_id),
  });
}

export function useConversationSharesByMember(memberId?: string) {
  return useQuery({
    queryKey: ['conversation-shares-by-member', memberId],
    queryFn: async () => {
      if (!memberId) return [];

      const { data, error } = await supabase
        .from('conversation_shares' as any)
        .select('*')
        .eq('user_id', memberId);

      if (error) throw error;
      return (data || []) as unknown as ConversationShare[];
    },
    enabled: !!memberId,
  });
}

export function useShareConversation() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, userId, note }: { conversationId: string; userId: string; note?: string }) => {
      if (!profile?.organization_id) throw new Error('No organization');

      const { data, error } = await supabase
        .from('conversation_shares' as any)
        .insert({
          conversation_id: conversationId,
          user_id: userId,
          shared_by: profile.user_id,
          organization_id: profile.organization_id,
          note: note || null,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-shares'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-shares-by-member'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-shares-for'] });
    },
  });
}

export function useUnshareConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      const { error } = await supabase
        .from('conversation_shares' as any)
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-shares'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-shares-by-member'] });
    },
  });
}
