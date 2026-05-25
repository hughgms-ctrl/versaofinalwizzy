import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribes to real-time changes on pipeline-related tables
 * so the board updates instantly without manual refresh.
 * Uses refetchQueries (not invalidateQueries) for immediate updates.
 */
export function usePipelineRealtime(pipelineId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!pipelineId) return;

    const refetchPositions = () => {
      queryClient.refetchQueries({ queryKey: ['conversation-positions', pipelineId], type: 'active' });
    };

    const refetchConversations = () => {
      queryClient.refetchQueries({ queryKey: ['conversations'], type: 'active' });
    };

    const refetchTags = () => {
      queryClient.refetchQueries({ queryKey: ['all-contact-tags'], type: 'active' });
      queryClient.refetchQueries({ queryKey: ['contact-tags'], type: 'active' });
    };

    const channel = supabase
      .channel(`pipeline-rt-${pipelineId}`)
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
      // Conversation updates
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
        },
        refetchConversations
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pipelineId, queryClient]);
}
