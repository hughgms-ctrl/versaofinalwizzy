import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

const CONVERSATION_LIST_LIMIT = 1000;

export interface DbConversation {
  id: string;
  contact_id: string;
  organization_id: string;
  status: 'open' | 'pending' | 'resolved' | 'closed' | 'archived';
  unread_count: number;
  last_message_at: string | null;
  assigned_to: string | null;
  ai_agent_id: string | null;
  metadata: Record<string, any> | null;
  closed_at: string | null;
  workspace_id?: string | null;
  source_phone?: string | null;
  whatsapp_instance_id?: string | null;
  created_at: string;
  updated_at: string;
  contact: {
    id: string;
    name: string | null;
    phone: string;
    avatar_url: string | null;
    email: string | null;
    workspace_id?: string | null;
    created_at: string;
    metadata: { note?: string } | null;
    contact_presence?: {
      presence_type: string;
      expires_at: string;
    } | { presence_type: string; expires_at: string }[] | null;
  } | null;
  last_message: {
    id: string;
    content: string | null;
    type: string;
    direction: 'inbound' | 'outbound';
    is_from_bot: boolean;
    read_at: string | null;
    delivered_at: string | null;
  }[] | null;
}

export interface DbProfile {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

export interface DbMessage {
  id: string;
  conversation_id: string;
  content: string | null;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location';
  direction: 'inbound' | 'outbound';
  is_from_bot: boolean;
  sent_by: string | null;
  created_at: string;
  read_at: string | null;
  delivered_at: string | null;
  media_url: string | null;
  zapi_message_id: string | null;
  metadata?: any;
}

export function useConversations(options?: { includeArchived?: boolean; onlyArchived?: boolean; includeClosed?: boolean; onlyClosed?: boolean }) {
  const { session, profile } = useAuth();
  const { selectedWorkspaceId } = useWorkspaceContext();
  const queryClient = useQueryClient();
  const includeArchived = options?.includeArchived ?? false;
  const onlyArchived = options?.onlyArchived ?? false;
  const includeClosed = options?.includeClosed ?? false;
  const onlyClosed = options?.onlyClosed ?? false;

  const query = useQuery({
    queryKey: ['conversations', { includeArchived, onlyArchived, includeClosed, onlyClosed, selectedWorkspaceId, orgId: profile?.organization_id }],
    queryFn: async (): Promise<DbConversation[]> => {
      let query = supabase
        .from('conversations')
        .select(`
          *,
          contact:contacts(id, name, phone, avatar_url, email, workspace_id, created_at, metadata, contact_presence(presence_type, expires_at)),
          last_message:messages(id, content, type, direction, is_from_bot, read_at, delivered_at)
        `)
        .eq('organization_id', profile!.organization_id)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .range(0, CONVERSATION_LIST_LIMIT - 1)
        .order('created_at', { referencedTable: 'messages', ascending: false })
        .limit(1, { referencedTable: 'messages' });

      if (onlyArchived) {
        query = query.eq('status', 'archived');
      } else if (onlyClosed) {
        query = query.eq('status', 'closed' as any);
      } else {
        // Hide archived by default
        if (!includeArchived) query = query.neq('status', 'archived');
        // Hide closed by default
        if (!includeClosed) query = query.neq('status', 'closed' as any);
      }

      if (selectedWorkspaceId) {
        query = query.eq('workspace_id', selectedWorkspaceId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as unknown as DbConversation[];
    },
    enabled: !!session && !!profile?.organization_id,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  // Subscribe to realtime updates for conversations
  useEffect(() => {
    if (!session || !profile?.organization_id) return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleConversationsRefresh = () => {
      if (refreshTimer) return;

      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }, 1500);
    };

    const channel = supabase
      .channel(`conversations-realtime-${profile.organization_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `organization_id=eq.${profile.organization_id}`,
        },
        () => {
          scheduleConversationsRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_presence',
          filter: `organization_id=eq.${profile.organization_id}`,
        },
        () => {
          scheduleConversationsRefresh();
        }
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [session, profile?.organization_id, queryClient]);

  return query;
}

export function useMessages(conversationId: string | null) {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async (): Promise<DbMessage[]> => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as DbMessage[];
    },
    enabled: !!session && !!conversationId,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  // Subscribe to realtime updates for messages
  useEffect(() => {
    if (!session || !conversationId) return;

    const channel = supabase
      .channel(`messages-realtime-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, conversationId, queryClient]);

  return query;
}

export function useProfiles() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['profiles'],
    queryFn: async (): Promise<DbProfile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, avatar_url')
        .order('full_name', { ascending: true });

      if (error) throw error;
      return (data || []) as DbProfile[];
    },
    enabled: !!session,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  const { session, profile } = useAuth();

  return useMutation({
    mutationFn: async (data: { phone: string, name: string | null, workspaceId?: string | null }) => {
      if (!profile?.organization_id) throw new Error('Organization ID is required');

      // Format phone: ensure it has country code '55' for BR assuming 10 or 11 digits
      let formattedPhone = data.phone.replace(/\D/g, '');
      if (formattedPhone.length === 10 || formattedPhone.length === 11) {
        formattedPhone = `55${formattedPhone}`;
      }

      // 1. Check if contact exists
      let contactId = null;
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id, workspace_id')
        .eq('phone', formattedPhone)
        .eq('organization_id', profile.organization_id)
        .limit(1)
        .maybeSingle();

      if (existingContact) {
        contactId = existingContact.id;
        const contactUpdates: Record<string, any> = {};
        if (data.name) contactUpdates.name = data.name;
        if (data.workspaceId && !(existingContact as any).workspace_id) contactUpdates.workspace_id = data.workspaceId;
        if (Object.keys(contactUpdates).length > 0) {
          await supabase.from('contacts').update(contactUpdates).eq('id', contactId);
        }
      } else {
        // 2. Create contact if doesn't exist
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            phone: formattedPhone,
            name: data.name,
            organization_id: profile.organization_id,
            workspace_id: data.workspaceId || null,
          } as any)
          .select()
          .single();

        if (contactError) throw new Error(`Erro ao criar contato: ${contactError.message}`);
        contactId = newContact.id;
      }

      const { data: activeInstance } = await supabase
        .from('whatsapp_instances')
        .select('id, phone_number')
        .eq('organization_id', profile.organization_id)
        .eq('status', 'connected')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 3. Check for an existing conversation for this exact company number.
      let existingConvQuery = supabase
        .from('conversations')
        .select('*, contact:contacts(*)')
        .eq('contact_id', contactId)
        .in('status', ['open', 'pending', 'closed'] as any);

      existingConvQuery = activeInstance?.id
        ? existingConvQuery.eq('whatsapp_instance_id', activeInstance.id)
        : existingConvQuery.is('whatsapp_instance_id', null);

      existingConvQuery = data.workspaceId
        ? existingConvQuery.eq('workspace_id', data.workspaceId)
        : existingConvQuery.is('workspace_id', null);

      const { data: existingConv } = await existingConvQuery.maybeSingle();

      if (existingConv) {
        if (data.workspaceId && !(existingConv as any).workspace_id) {
          await supabase
            .from('conversations')
            .update({ workspace_id: data.workspaceId } as any)
            .eq('id', existingConv.id);
          (existingConv as any).workspace_id = data.workspaceId;
        }
        return {
          conversation: { ...existingConv, last_message: [] } as unknown as DbConversation,
          isNew: false
        };
      }

      // 4. Create new conversation
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          contact_id: contactId,
          organization_id: profile.organization_id,
          status: 'open',
          service_mode: 'ativo', // Outbound feature starts as "ativo" generally
          unread_count: 0,
          workspace_id: data.workspaceId || null,
          whatsapp_instance_id: activeInstance?.id || null,
          source_phone: activeInstance?.phone_number || null,
        } as any)
        .select('*, contact:contacts(*)')
        .single();

      if (convError) throw new Error(`Erro ao criar conversa: ${convError.message}`);
      return {
        conversation: { ...newConv, last_message: [] } as unknown as DbConversation,
        isNew: true
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (error: any) => {
      // toast or error reporting can be handled where the hook is used
      throw error;
    }
  });
}
