import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribes to real-time changes on pipeline-related tables
 * so the board updates instantly without manual refresh.
 */
export function usePipelineRealtime(pipelineId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!pipelineId) return;

    const channel = supabase
      .channel(`pipeline-realtime-${pipelineId}`)
      // Card movements
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_pipeline_positions',
          filter: `pipeline_id=eq.${pipelineId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['conversation-positions', pipelineId] });
        }
      )
      // New cards entering pipeline (INSERT without filter, then we check)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_pipeline_positions',
        },
        (payload) => {
          if (payload.new && (payload.new as any).pipeline_id === pipelineId) {
            queryClient.invalidateQueries({ queryKey: ['conversation-positions', pipelineId] });
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
        () => {
          queryClient.invalidateQueries({ queryKey: ['all-contact-tags'] });
          queryClient.invalidateQueries({ queryKey: ['contact-tags'] });
        }
      )
      // Conversation updates (assigned_to, status, unread_count, last_message_at, etc.)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pipelineId, queryClient]);
}
