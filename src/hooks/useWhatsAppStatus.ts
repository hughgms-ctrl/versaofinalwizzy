import { useQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannel } from '@/lib/realtimeChannel';
import { useSharedRealtimeSubscription } from '@/lib/sharedRealtime';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface WhatsAppStatus {
  status: 'pending' | 'connecting' | 'connected' | 'disconnected' | 'not_configured';
  connected: boolean;
  phoneNumber?: string | null;
  isLoading: boolean;
  needsSync?: boolean;
}

/**
 * O status do numero vinha de um `setInterval` de 30 s POR MONTAGEM do hook —
 * e ele e montado pelo banner do layout (toda pagina) mais a propria pagina, em
 * quatro telas. Cada disparo invoca `zapi-check-status`, que bate no provedor.
 * Com 100 usuarios online isso sozinho ja era um fluxo constante de chamadas
 * externas so para redesenhar um aviso.
 *
 * Agora e uma query do React Query: as montagens compartilham UMA busca, o
 * intervalo e de seguranca (2 min) e quem realmente manda e o realtime de
 * `whatsapp_instances` — conectou ou caiu, a linha muda no banco e o status e
 * revalidado na hora.
 */
const STATUS_STALE_MS = 30_000;
const STATUS_POLL_MS = 120_000;

const statusQueryKey = (organizationId: string | undefined) => ['whatsapp-status', organizationId];

/** Ultimo estado conhecido por org, para detectar a virada conectado <-> caiu. */
const lastConnectedByOrg = new Map<string, boolean>();
const syncingOrgs = new Set<string>();

type StatusPayload = Omit<WhatsAppStatus, 'isLoading'>;

const DEFAULT_STATUS: StatusPayload = {
  status: 'pending',
  connected: false,
  phoneNumber: null,
  needsSync: false,
};

async function syncChats(organizationId: string, accessToken: string, queryClient: QueryClient) {
  if (syncingOrgs.has(organizationId)) return;
  syncingOrgs.add(organizationId);

  try {
    const { data, error } = await supabase.functions.invoke('zapi-sync-chats', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (error) {
      console.error('Sync error:', error);
      return;
    }

    const total = data?.totalChats ?? 0;
    const valid = data?.processedChats ?? 0;
    const synced = data?.syncedConversations ?? 0;

    if (synced === 0 && total > 0) {
      toast.info(`UAZAPI achou ${total} conversas, mas o filtro barrou todas (${valid} válidas).`);
    } else {
      toast.success(`Sincronização concluída: ${synced} conversas (${total} total na UAZAPI)`);
    }

    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['conversations-paginated'] });
  } catch (err) {
    console.error('Sync failed:', err);
  } finally {
    syncingOrgs.delete(organizationId);
  }
}

async function fetchWhatsAppStatus(
  organizationId: string,
  accessToken: string,
  queryClient: QueryClient
): Promise<StatusPayload> {
  try {
    const response = await supabase.functions.invoke('zapi-check-status', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.error) throw response.error;

    const connectedInstance = Array.isArray(response.data?.instances)
      ? response.data.instances.find((instance: any) => instance?.connected === true)
      : null;
    const connected = response.data.connected === true || !!connectedInstance;
    const needsSync = response.data.needsSync || connectedInstance?.needsSync;
    const phoneNumber = connectedInstance?.phoneNumber || response.data.phoneNumber;

    const previous = lastConnectedByOrg.get(organizationId);
    if (previous !== undefined && previous !== connected) {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations-paginated'] });
    }
    lastConnectedByOrg.set(organizationId, connected);

    if (needsSync && connected) {
      void syncChats(organizationId, accessToken, queryClient);
    }

    return {
      status: connected ? 'connected' : response.data.status,
      connected,
      phoneNumber,
      needsSync,
    };
  } catch (error) {
    console.error('Error checking WhatsApp status:', error);

    // Provedor fora do ar nao e o mesmo que numero conectado: o fallback lia o
    // banco com `status.eq.connected OR is_active.eq.true` e dava "conectado"
    // para instancia apenas ativa, escondendo a queda de quem estava caido.
    const { data } = await supabase
      .from('whatsapp_instances')
      .select('status, phone_number')
      .eq('organization_id', organizationId)
      .eq('status', 'connected')
      .limit(1)
      .maybeSingle();

    if (data) {
      lastConnectedByOrg.set(organizationId, true);
      return { status: 'connected', connected: true, phoneNumber: data.phone_number, needsSync: false };
    }

    return DEFAULT_STATUS;
  }
}

export function useWhatsAppStatus(): WhatsAppStatus & { refetch: () => void } {
  const { session, profile } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = profile?.organization_id;
  const accessToken = session?.access_token;

  // Conectou, caiu ou trocou de numero: a linha muda no banco e o status e
  // revalidado na hora, sem esperar o proximo intervalo.
  useSharedRealtimeSubscription(organizationId ? `whatsapp-status:${organizationId}` : null, () => {
    const channel = createRealtimeChannel(`whatsapp-status:${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: statusQueryKey(organizationId) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  });

  const query = useQuery({
    queryKey: statusQueryKey(organizationId),
    queryFn: () => fetchWhatsAppStatus(organizationId!, accessToken!, queryClient),
    enabled: !!organizationId && !!accessToken,
    staleTime: STATUS_STALE_MS,
    refetchInterval: STATUS_POLL_MS,
    refetchOnWindowFocus: true,
  });

  return {
    ...(query.data ?? DEFAULT_STATUS),
    isLoading: query.isLoading,
    refetch: () => {
      void query.refetch();
    },
  };
}
