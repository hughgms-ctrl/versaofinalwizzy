import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface WhatsAppStatus {
  status: 'pending' | 'connecting' | 'connected' | 'disconnected' | 'not_configured';
  connected: boolean;
  phoneNumber?: string | null;
  isLoading: boolean;
  needsSync?: boolean;
}

export function useWhatsAppStatus() {
  const { session, profile } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<WhatsAppStatus>({
    status: 'pending',
    connected: false,
    isLoading: true,
  });
  const [wasConnected, setWasConnected] = useState<boolean | null>(null);
  const isSyncing = useRef(false);

  const syncChats = useCallback(async () => {
    if (isSyncing.current || !session?.access_token) return;

    isSyncing.current = true;
    console.log('Auto-syncing chats after reconnection...');

    try {
      const { data, error } = await supabase.functions.invoke('zapi-sync-chats', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (error) {
        console.error('Sync error:', error);
      } else {
        console.log('Sync completed:', data);
        const total = data?.totalChats ?? '0';
        const valid = data?.processedChats ?? '0';
        const synced = data?.syncedConversations ?? '0';

        if (synced === 0 && total > 0) {
          toast.info(`UAZAPI achou ${total} conversas, mas o filtro barrou todas (${valid} válidas).`);
        } else {
          toast.success(`Sincronização concluída: ${synced} conversas (${total} total na UAZAPI)`);
        }

        // Invalidate all relevant queries
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      isSyncing.current = false;
    }
  }, [session?.access_token, queryClient]);

  const checkStatus = useCallback(async () => {
    if (!session?.access_token) {
      setStatus(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      const response = await supabase.functions.invoke('zapi-check-status', {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });

      if (response.error) throw response.error;

      const connectedInstance = Array.isArray(response.data?.instances)
        ? response.data.instances.find((instance: any) => instance?.connected === true)
        : null;
      const newConnected = response.data.connected === true || !!connectedInstance;
      const needsSync = response.data.needsSync || connectedInstance?.needsSync;
      const phoneNumber = connectedInstance?.phoneNumber || response.data.phoneNumber;

      // If connection status changed, invalidate queries
      if (wasConnected !== null && wasConnected !== newConnected) {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }

      // Trigger sync if backend indicates it's needed (reconnection or phone change)
      if (needsSync && newConnected && !isSyncing.current) {
        syncChats();
      }

      setWasConnected(newConnected);
      setStatus({
        status: newConnected ? 'connected' : response.data.status,
        connected: newConnected,
        phoneNumber,
        isLoading: false,
        needsSync,
      });
    } catch (error) {
      console.error('Error checking WhatsApp status:', error);

      if (profile?.organization_id) {
        const { data } = await supabase
          .from('whatsapp_instances')
          .select('status, phone_number, is_active')
          .eq('organization_id', profile.organization_id)
          .or('status.eq.connected,is_active.eq.true')
          .limit(1)
          .maybeSingle();

        if (data) {
          setWasConnected(true);
          setStatus({
            status: 'connected',
            connected: true,
            phoneNumber: data.phone_number,
            isLoading: false,
          });
          return;
        }
      }

      setStatus(prev => ({ ...prev, isLoading: false }));
    }
  }, [session?.access_token, profile?.organization_id, wasConnected, queryClient, syncChats]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Refresh status periodically (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  return { ...status, refetch: checkStatus };
}
