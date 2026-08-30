import { useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useCurrentUserRole, useUserPermissions } from '@/hooks/useUserPermissions';
import { findConversationInListCache } from '@/hooks/useConversations';

// Notification sound
const NOTIFICATION_SOUND_URL = '/sounds/new-message.mp3';

// Debounce window to prevent duplicate sounds (ms)
const SOUND_DEBOUNCE_MS = 2000;

/**
 * B11 (docs/REVISAO_ESCALA_LANCAMENTO.md): `messages.organization_id` chega pela
 * migration 20260830160000, aplicada A MAO. Assinar um filtro por coluna que
 * ainda nao existe faz o canal inteiro cair em CHANNEL_ERROR — ou seja, o app
 * ficaria sem nenhuma notificacao ate a migration ser aplicada.
 *
 * Entao a coluna e testada UMA vez por carregamento da pagina: se ja existe,
 * o canal filtra por org (o objetivo do B11); se nao, cai no comportamento
 * antigo (plataforma inteira + checagem no callback) ate a migration rodar.
 */
let messagesOrgColumnProbe: Promise<boolean> | null = null;

function hasMessagesOrganizationColumn(): Promise<boolean> {
  if (!messagesOrgColumnProbe) {
    messagesOrgColumnProbe = (async () => {
      const { error } = await supabase.from('messages').select('organization_id').limit(1);
      if (!error) return true;
      console.warn(
        '[NOTIFICATION] messages.organization_id ainda nao existe (migration 20260830160000 pendente): assinando sem filtro de organizacao.',
        error.message
      );
      return false;
    })();
  }
  return messagesOrgColumnProbe;
}

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
    // O contador de nao lidas nao e invalidado aqui: o UPDATE de `conversations`
    // (unread_count / last_message_at) chega pelo realtime da propria lista e vira
    // patch no cache (B12, useConversations). Invalidar aqui refazia a lista
    // inteira, com 3 joins, a cada mensagem recebida.
  }, [playNotificationSound]);

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

    let cancelled = false;
    let channel: ReturnType<typeof createRealtimeChannel> | null = null;

    // O filtro do postgres_changes aceita UMA condicao so. Com a coluna de org
    // em `messages`, ela e a que importa: o Realtime avalia RLS por assinante a
    // cada INSERT, e sem o filtro esse custo era pago para as mensagens de TODAS
    // as organizacoes da plataforma, em cada aba aberta.
    hasMessagesOrganizationColumn().then((scopedByOrg) => {
      if (cancelled) return;

      console.log('Setting up real-time message notifications...', { scopedByOrg });

      channel = createRealtimeChannel(`new-messages-notification:${selectedOrganizationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: scopedByOrg
              ? `organization_id=eq.${selectedOrganizationId}`
              : 'direction=eq.inbound',
          },
          async (payload) => {
            const message = payload.new as {
              id: string;
              content: string | null;
              type: string;
              direction: string;
              conversation_id: string;
              organization_id?: string | null;
            };

            // Filtrando por org, o canal tambem traz as mensagens enviadas:
            // notificacao continua sendo so das recebidas.
            if (message.direction !== 'inbound') return;

            // Enquanto a coluna nao existir, o canal ainda e da plataforma
            // inteira e a org so e conferida aqui (o SELECT abaixo devolve nada
            // quando a conversa e de outro tenant).
            if (message.organization_id && message.organization_id !== selectedOrganizationId) return;

            // A conversa quase sempre ja esta no cache da lista, com o contato
            // junto: evita 1 SELECT por mensagem recebida.
            const cached = findConversationInListCache(queryClient, message.conversation_id);
            let conversation:
              | {
                  id: string;
                  organization_id: string;
                  workspace_id: string | null;
                  assigned_to: string | null;
                  contact?: { id: string | null; name: string | null; phone: string; workspace_id?: string | null } | null;
                }
              | null = cached && cached.organization_id === selectedOrganizationId
              ? (cached as any)
              : null;

            if (!conversation) {
              const { data } = await supabase
                .from('conversations')
                .select('id, organization_id, workspace_id, assigned_to, contact:contacts(id, name, phone, workspace_id)')
                .eq('id', message.conversation_id)
                .eq('organization_id', selectedOrganizationId)
                .maybeSingle();
              conversation = data as any;
            }

            if (!conversation || conversation.organization_id !== selectedOrganizationId) return;
            if (!conversation.contact) return;

            const canNotify = await canNotifyConversation(conversation as any);
            if (!canNotify) {
              console.log('[NOTIFICATION] Message ignored by access rules:', message.id);
              return;
            }

            const contact = conversation.contact as { name: string | null; phone: string };
            const contactName = contact.name || contact.phone || 'Contato';
            const messagePreview = message.content || (message.type !== 'text' ? `[${message.type}]` : 'Nova mensagem');

            showNotification(contactName, messagePreview, message.id);
          }
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      console.log('Cleaning up message notifications subscription...');
      if (channel) supabase.removeChannel(channel);
    };
  }, [
    canNotifyConversation,
    permissionsLoading,
    queryClient,
    roleLoading,
    selectedOrganizationId,
    session?.user?.id,
    settings.newMessageEnabled,
    showNotification,
    workspacesLoading,
  ]);

  return { playNotificationSound };
}
