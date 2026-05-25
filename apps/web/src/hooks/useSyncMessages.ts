import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface SyncResult {
  success: boolean;
  syncedMessages: number;
  skippedMessages: number;
  totalFromZAPI: number;
  multiDeviceLimitation?: boolean;
  message?: string;
}

interface LoadOlderResult {
  success: boolean;
  syncedMessages: number;
  hasMore: boolean;
  oldestTimestamp: number | null;
}

export function useSyncMessages(conversationId: string | null) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const queryClient = useQueryClient();

  const syncMessages = useCallback(async (): Promise<SyncResult | null> => {
    if (!conversationId || isSyncing) return null;

    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-sync-messages', {
        body: { conversationId, amount: 30 },
        headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` }
      });

      if (error) {
        console.error('Error syncing messages:', error);
        return null;
      }

      // Invalidate messages query to refresh UI
      if (data?.syncedMessages > 0) {
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      }

      return data as SyncResult;
    } catch (err) {
      console.error('Sync messages failed:', err);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [conversationId, isSyncing, queryClient]);

  const loadOlderMessages = useCallback(async (lastMessageId?: string): Promise<LoadOlderResult | null> => {
    if (!conversationId || isLoadingOlder || !hasMoreMessages) return null;

    setIsLoadingOlder(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-load-older-messages', {
        body: { conversationId, lastMessageId, amount: 30 },
        headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` }
      });

      if (error) {
        console.error('Error loading older messages:', error);
        return null;
      }

      // Update hasMore state
      if (data?.hasMore === false) {
        setHasMoreMessages(false);
      }

      // Invalidate messages query to refresh UI
      if (data?.syncedMessages > 0) {
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      }

      return data as LoadOlderResult;
    } catch (err) {
      console.error('Load older messages failed:', err);
      return null;
    } finally {
      setIsLoadingOlder(false);
    }
  }, [conversationId, isLoadingOlder, hasMoreMessages, queryClient]);

  // Reset hasMore when conversation changes
  const resetPagination = useCallback(() => {
    setHasMoreMessages(true);
  }, []);

  return {
    syncMessages,
    loadOlderMessages,
    resetPagination,
    isSyncing,
    isLoadingOlder,
    hasMoreMessages
  };
}
