import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface InstagramConversationContact {
  id: string;
  igsid: string;
  username: string | null;
  name: string | null;
  profile_pic_url: string | null;
}

export interface InstagramConversationRow {
  id: string;
  organization_id: string;
  instagram_account_id: string;
  contact_id: string;
  workspace_id: string | null;
  assigned_to: string | null;
  status: 'open' | 'pending' | 'resolved' | 'archived';
  last_message_at: string | null;
  last_message_direction: 'inbound' | 'outbound' | null;
  unread_count: number;
  created_at: string;
  contact: InstagramConversationContact | null;
}

export interface InstagramMessageRow {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  type: string;
  content: string | null;
  media_url: string | null;
  is_from_bot: boolean;
  failed_at: string | null;
  error_message: string | null;
  created_at: string;
}

// instagram_conversations / instagram_messages aren't in the generated
// Supabase types yet — cast to a known table name, same convention as
// useCampaignFolders.ts / useInstagramAccounts.ts.
const CONVERSATIONS = 'instagram_conversations' as 'contacts';
const MESSAGES = 'instagram_messages' as 'contacts';

export function useInstagramConversations() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['instagram-conversations', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await (supabase.from(CONVERSATIONS) as any)
        .select('*, contact:instagram_contacts(id, igsid, username, name, profile_pic_url)')
        .eq('organization_id', profile.organization_id)
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as InstagramConversationRow[];
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 10_000,
  });
}

export function useInstagramMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['instagram-messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await (supabase.from(MESSAGES) as any)
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as InstagramMessageRow[];
    },
    enabled: !!conversationId,
    refetchInterval: 5_000,
  });
}

export function useSendInstagramMessage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, text }: { conversationId: string; text: string }) => {
      const response = await supabase.functions.invoke('instagram-send-message', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { conversationId, text },
      });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['instagram-messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['instagram-conversations'] });
    },
  });
}

export function useMarkInstagramConversationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await (supabase.from(CONVERSATIONS) as any)
        .update({ unread_count: 0 })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-conversations'] });
    },
  });
}
