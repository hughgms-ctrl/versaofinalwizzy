import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannel } from '@/lib/realtimeChannel';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

/**
 * Subscribes to real-time changes on pipeline-related tables
 * so the board updates instantly without manual refresh.
 * Card/position events use refetchQueries (immediate); conversation
 * UPDATEs são escopadas por organização e invalidadas com debounce
 * para evitar refetch em rajada de 1000 conversas a cada update.
 */
export function usePipelineRealtime(pipelineId: string | null) {
  const queryClient = useQueryClient();
  const { selectedOrganizationId } = useWorkspaceContext();

  useEffect(() => {
    if (!pipelineId) return;

    const refetchPositions = () => {
      queryClient.refetchQueries({ queryKey: ['conversation-positions', pipelineId], type: 'active' });
    };

    // Debounced invalidate: coalesces bursts of conversation UPDATEs into
    // a single revalidation instead of an immediate refetch per event.
    let conversationsDebounce: ReturnType<typeof setTimeout> | null = null;
    const invalidateConversations = () => {
      if (conversationsDebounce) clearTimeout(conversationsDebounce);
      conversationsDebounce = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }, 500);
    };

    const refetchTags = () => {
      queryClient.refetchQueries({ queryKey: ['all-contact-tags'], type: 'active' });
      queryClient.refetchQueries({ queryKey: ['contact-tags'], type: 'active' });
    };

    const channel = createRealtimeChannel(`pipeline-rt-${pipelineId}`)
      // Card movements (filtered by pipeline)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_pipeline_positions',
          filter: `pipeline_id=eq.${pipelineId}`,
        },
        refetchPositions
      )
      // New cards entering pipeline (unfiltered INSERT)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_pipeline_positions',
        },
        (payload) => {
          if (payload.new && (payload.new as any).pipeline_id === pipelineId) {
            refetchPositions();
          }
        }
      )
      // Tag changes on contacts
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_tags',
        },
        refetchTags
      )
      // Conversation updates (scoped to current org when available)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          ...(selectedOrganizationId
            ? { filter: `organization_id=eq.${selectedOrganizationId}` }
            : {}),
        },
        invalidateConversations
      )
      .subscribe();

    return () => {
      if (conversationsDebounce) clearTimeout(conversationsDebounce);
      supabase.removeChannel(channel);
    };
  }, [pipelineId, queryClient, selectedOrganizationId]);
}
