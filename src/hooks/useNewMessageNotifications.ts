import { useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useCurrentUserRole, useUserPermissions } from '@/hooks/useUserPermissions';

// Notification sound
const NOTIFICATION_SOUND_URL = '/sounds/new-message.mp3';

// Debounce window to prevent duplicate sounds (ms)
const SOUND_DEBOUNCE_MS = 2000;

export function useNewMessageNotifications() {
  const { session, user } = useAuth();
  const { settings } = useNotificationSettings();
  const queryClient = useQueryClient();
  const { availableWorkspaces, isAdmin, selectedOrganizationId, loading: workspacesLoading } = useWorkspaceContext();
  const { data: userRole, isLoading: roleLoading } = useCurrentUserRole();
  const { data: userPermissions, isLoading: permissionsLoading } = useUserPermissions();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastNotifiedMessageId = useRef<string | null>(null);
  const lastSoundPlayedAt = useRef<number>(0);
  const availableWorkspaceIds = useMemo(() => (
    availableWorkspaces.map(workspace => workspace.id)
  ), [availableWorkspaces]);

  // Initialize audio element once
  useEffect(() => {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 1.0;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  const playNotificationSound = useCallback(() => {
    const now = Date.now();
    const timeSinceLastPlay = now - lastSoundPlayedAt.current;
    console.log('[NOTIFICATION] playNotificationSound called', { 
      soundEnabled: settings.soundEnabled, 
      hasAudio: !!audioRef.current,
      timeSinceLastPlay,
      debounceMs: SOUND_DEBOUNCE_MS 
    });
    if (
      settings.soundEnabled &&
      audioRef.current &&
      timeSinceLastPlay > SOUND_DEBOUNCE_MS
    ) {
      lastSoundPlayedAt.current = now;
      audioRef.current.currentTime = 0;
      audioRef.current.play()
        .then(() => console.log('[NOTIFICATION] Sound played successfully'))
        .catch((err) => console.error('[NOTIFICATION] Sound play failed:', err));
    }
  }, [settings.soundEnabled]);

  const showNotification = useCallback((contactName: string, messagePreview: string, messageId: string) => {
    // Avoid duplicate notifications
    if (lastNotifiedMessageId.current === messageId) return;
    lastNotifiedMessageId.current = messageId;

    toast({
      title: `📩 ${contactName}`,
      description: messagePreview.length > 50 ? messagePreview.slice(0, 50) + '...' : messagePreview,
      duration: 5000,
    });

    playNotificationSound();
    
    // Invalidate conversations to update unread count
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [playNotificationSound, queryClient]);

  const canNotifyConversation = useCallback(async (conversation: {
    id: string;
    workspace_id: string | null;
    assigned_to: string | null;
    contact?: { id: string | null; workspace_id?: string | null } | null;
  }) => {
    const isPrivileged = isAdmin || userRole === 'owner' || userRole === 'admin';
    if (isPrivileged) return true;

    const conversationWorkspaceId = conversation.workspace_id || conversation.contact?.workspace_id || null;
    if (conversationWorkspaceId && !availableWorkspaceIds.includes(conversationWorkspaceId)) {
      return false;
    }

    if (!userPermissions) return false;

    const { data: positions, error: positionsError } = await supabase
      .from('conversation_pipeline_positions')
      .select('pipeline_id')
      .eq('conversation_id', conversation.id);

    if (positionsError) {
      console.error('[NOTIFICATION] Failed to load pipeline positions:', positionsError);
      return false;
    }

    const pipelineIds = (positions || []).map(position => position.pipeline_id);
    const allowedPipelineIds = userPermissions.allowed_pipeline_ids || [];
    const hasSpecificPipelineRestriction =
      userPermissions.pipeline_access_type === 'specific' && allowedPipelineIds.length > 0;
    const isInAllowedPipeline = pipelineIds.some(pipelineId => allowedPipelineIds.includes(pipelineId));

    if (userPermissions.pipeline_access_type === 'specific' && pipelineIds.length > 0 && !isInAllowedPipeline) {
      return false;
    }

    const canAccessPipelineMessage =
      userPermissions.can_access_pipeline &&
      (
        userPermissions.pipeline_access_type === 'all' ||
        (hasSpecificPipelineRestriction && isInAllowedPipeline)
      );

    if (canAccessPipelineMessage) return true;

    if (!userPermissions.can_access_conversations) return false;

    const filterType = userPermissions.conversations_filter_type || 'all';
    if (filterType === 'all') return true;

    const isAssigned = conversation.assigned_to === user?.id;
    if (filterType === 'assigned') return isAssigned;

    const allowedTags = userPermissions.conversations_allowed_tags || [];
    let hasAllowedTag = false;
    if (conversation.contact?.id && allowedTags.length > 0) {
      const { data: contactTags, error: tagsError } = await supabase
        .from('contact_tags')
        .select('tag_id')
        .eq('contact_id', conversation.contact.id);

      if (tagsError) {
        console.error('[NOTIFICATION] Failed to load contact tags:', tagsError);
        return false;
      }

      hasAllowedTag = (contactTags || []).some(tag => allowedTags.includes(tag.tag_id));
    }

    if (filterType === 'tags') return hasAllowedTag;
    if (filterType === 'assigned_and_tags') return isAssigned || hasAllowedTag;

    return false;
  }, [availableWorkspaceIds, isAdmin, user?.id, userPermissions, userRole]);

  useEffect(() => {
    if (
      !session?.user?.id ||
      !settings.newMessageEnabled ||
      !selectedOrganizationId ||
      roleLoading ||
      permissionsLoading ||
      workspacesLoading
    ) return;

    console.log('Setting up real-time message notifications...');

    // NOTE: `messages` não possui coluna `organization_id` (só `conversation_id`),
    // então não é possível filtrar o canal por org no nível do banco. O escopo de org
    // é garantido por (1) nome de canal único por org — recria a inscrição ao trocar de
    // org — e (2) validação explícita de `organization_id` no callback antes de notificar.
    // TODO(perf/fase6): adicionar `organization_id` em `messages` para filtrar no DB.
    const channel = createRealtimeChannel(`new-messages-notification:${selectedOrganizationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: 'direction=eq.inbound',
        },
        async (payload) => {
          console.log('New inbound message received:', payload);

          const message = payload.new as {
            id: string;
            content: string | null;
            type: string;
            conversation_id: string;
          };

          // Fetch contact info for the conversation
          const { data: conversation } = await supabase
            .from('conversations')
            .select('id, organization_id, workspace_id, assigned_to, contact:contacts(id, name, phone, workspace_id)')
            .eq('id', message.conversation_id)
            .single();

          // Escopo de organização: ignora mensagens de outra org (defesa contra
          // eventos cross-tenant que cheguem pelo canal sem filtro de DB).
          if (conversation && conversation.organization_id !== selectedOrganizationId) {
            return;
          }

          if (conversation?.contact) {
            const canNotify = await canNotifyConversation(conversation as any);
            if (!canNotify) {
              console.log('[NOTIFICATION] Message ignored by access rules:', message.id);
              return;
            }

            const contact = conversation.contact as unknown as { name: string | null; phone: string };
            const contactName = contact.name || contact.phone || 'Contato';
            const messagePreview = message.content || (message.type !== 'text' ? `[${message.type}]` : 'Nova mensagem');
            
            showNotification(contactName, messagePreview, message.id);
          }
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up message notifications subscription...');
      supabase.removeChannel(channel);
    };
  }, [
    canNotifyConversation,
    permissionsLoading,
    roleLoading,
    selectedOrganizationId,
    session?.user?.id,
    settings.newMessageEnabled,
    showNotification,
    workspacesLoading,
  ]);

  return { playNotificationSound };
}
