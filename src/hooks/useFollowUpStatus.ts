import { useQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannel } from '@/lib/realtimeChannel';
import { useSharedRealtimeSubscription } from '@/lib/sharedRealtime';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { useAuth } from './useAuth';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

export interface FollowUpEntry {
  step: number;
  triggerMessageId?: string;
}

export type FollowUpMap = Record<string, FollowUpEntry>;

interface FlowExecutionRow {
  conversation_id: string | null;
  remarketing_step: number | null;
  status: string | null;
  variables: unknown;
  current_node_id: string | null;
}

const followUpQueryKey = (organizationId: string) => ['follow-up-status', organizationId];

/** Espera para reconciliar o mapa quando o evento nao diz por si o que sobrou. */
const RECONCILE_DEBOUNCE_MS = 1000;

/**
 * A execucao vale como follow-up visivel na lista? Mesma regra da consulta —
 * usada tambem no patch do realtime, para o cracha aparecer sem ir ao banco.
 */
function followUpEntryOf(row: FlowExecutionRow): FollowUpEntry | null {
  if (row.status !== 'waiting_input') return null;

  const vars = (row.variables ?? null) as Record<string, any> | null;
  const isChatFollowUp = vars?.source === 'chat_follow_up' || row.current_node_id === 'chat-follow-up';
  const step = row.remarketing_step ?? 0;

  if (!isChatFollowUp && step <= 0) return null;

  return {
    step: Math.max(step, 1),
    triggerMessageId: vars?.triggerMessageId || undefined,
  };
}

/**
 * Realtime de `flow_executions` — um canal por organizacao, independente de
 * quantos componentes usam o hook (lista, detalhe da conversa e board do funil
 * usam ao mesmo tempo).
 *
 * `flow_executions` muda o tempo todo (cada no de cada fluxo de cada numero).
 * Invalidar a query a cada evento refazia a varredura inteira. Agora:
 *
 *   - execucao que virou follow-up ativo entra no mapa por patch, na hora;
 *   - execucao que NAO e follow-up so da trabalho se a conversa dela estava no
 *     mapa (ou seja, o cracha precisa sair) — nesse caso reconcilia com atraso,
 *     porque a mesma conversa pode ter outra execucao ainda esperando;
 *   - todo o resto (a maioria esmagadora dos eventos) e descartado sem nada.
 */
function startFollowUpSync(queryClient: QueryClient, organizationId: string) {
  const queryKey = followUpQueryKey(organizationId);
  let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleReconcile = () => {
    if (reconcileTimer) return;
    reconcileTimer = setTimeout(() => {
      reconcileTimer = null;
      queryClient.invalidateQueries({ queryKey });
    }, RECONCILE_DEBOUNCE_MS);
  };

  const channel = createRealtimeChannel(`follow-up-status:${organizationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'flow_executions',
        filter: `organization_id=eq.${organizationId}`,
      },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          // O DELETE so traz a chave primaria: nao da para saber de que conversa
          // era. Reconciliar e a unica saida.
          scheduleReconcile();
          return;
        }

        const row = payload.new as FlowExecutionRow | null;
        const conversationId = row?.conversation_id;
        if (!row || !conversationId) return;

        const entry = followUpEntryOf(row);
        const current = queryClient.getQueryData<FollowUpMap>(queryKey);

        if (entry) {
          const known = current?.[conversationId];
          if (known && known.step === entry.step && known.triggerMessageId === entry.triggerMessageId) return;
          queryClient.setQueryData<FollowUpMap>(queryKey, (old) => ({ ...(old ?? {}), [conversationId]: entry }));
          return;
        }

        if (current?.[conversationId]) scheduleReconcile();
      }
    )
    .subscribe();

  return () => {
    if (reconcileTimer) clearTimeout(reconcileTimer);
    supabase.removeChannel(channel);
  };
}

export function useFollowUpStatus() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const { selectedOrganizationId } = useWorkspaceContext();

  useSharedRealtimeSubscription(
    selectedOrganizationId ? `follow-up-status:${selectedOrganizationId}` : null,
    () => startFollowUpSync(queryClient, selectedOrganizationId!)
  );

  return useQuery({
    queryKey: followUpQueryKey(selectedOrganizationId ?? ''),
    queryFn: async (): Promise<FollowUpMap> => {
      // Sem `.range()` isto vinha cortado em 1000 linhas COMO SUCESSO: passando
      // desse tanto de execucao esperando resposta, o cracha de follow-up sumia
      // de parte das conversas sem erro nenhum.
      const rows = await fetchAllPages<FlowExecutionRow>((from, to) =>
        supabase
          .from('flow_executions')
          .select('conversation_id, remarketing_step, status, variables, current_node_id')
          .eq('organization_id', selectedOrganizationId!)
          .eq('status', 'waiting_input')
          .order('id')
          .range(from, to)
      );

      const map: FollowUpMap = {};
      for (const row of rows) {
        if (!row.conversation_id) continue;
        const entry = followUpEntryOf(row);
        if (entry) map[row.conversation_id] = entry;
      }
      return map;
    },
    enabled: !!session && !!selectedOrganizationId,
  });
}
