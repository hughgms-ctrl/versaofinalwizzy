import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

/**
 * Histórico de execução de um fluxo: quem já passou e quem está dentro agora.
 *
 * A COSTURA DA JORNADA é o ponto central aqui. Um Atraso Inteligente não pausa a
 * execução — o motor fecha a linha atual e abre outra no nó de retomada. Um
 * contato que passou por 3 esperas tem 4 linhas em flow_executions, e mostrá-las
 * cruas pareceria 4 contatos diferentes. Todas carregam o mesmo
 * root_execution_id, então agrupamos por ele: uma jornada = uma passagem do
 * contato pelo fluxo, do início até onde ele está agora.
 */

// Status que significam "o contato está dentro do fluxo neste momento".
// Mesma lista que o motor e o cron usam para decidir o que é fluxo vivo.
export const ACTIVE_STATUSES = ['running', 'waiting_input', 'waiting_delay'] as const;

export type JourneyStatus = 'running' | 'waiting_input' | 'waiting_delay' | 'completed' | 'failed' | 'cancelled';

export interface FlowJourney {
  /** root_execution_id — identifica a passagem inteira e é o que a ação de parar recebe. */
  rootId: string;
  /** Ids de todos os trechos, em ordem cronológica. A linha do tempo lê os nós por eles. */
  executionIds: string[];
  conversationId: string;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  status: JourneyStatus;
  isActive: boolean;
  /** Nó onde o contato está (ou parou). Em espera, é o nó em que ele VAI retomar. */
  currentNodeId: string | null;
  /** Quando o fluxo volta a andar — só para quem está em espera. */
  resumeAt: string | null;
  /** Início da passagem: o do PRIMEIRO trecho, não o do trecho atual. */
  startedAt: string;
  /** Fim da passagem, quando encerrada. */
  endedAt: string | null;
  errorMessage: string | null;
  cancelReason: string | null;
  /** Quantos trechos a passagem tem. >1 significa que passou por espera. */
  segmentCount: number;
}

interface ExecutionRow {
  id: string;
  root_execution_id: string | null;
  conversation_id: string;
  status: string;
  current_node_id: string | null;
  timeout_at: string | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  cancel_reason: string | null;
  conversations: {
    contact_id: string | null;
    contacts: { name: string | null; phone: string | null } | null;
  } | null;
}

/**
 * Junta os trechos de uma mesma passagem numa jornada só.
 *
 * O trecho MAIS RECENTE manda no estado atual (status, onde parou, quando
 * retoma); o mais ANTIGO manda no início. É isso que faz a duração no fluxo
 * contar desde a entrada real do contato, e não desde a última espera.
 */
function stitchJourneys(rows: ExecutionRow[]): FlowJourney[] {
  const byRoot = new Map<string, ExecutionRow[]>();

  for (const row of rows) {
    // Linhas anteriores à migration não têm raiz: cada uma é sua própria passagem.
    const root = row.root_execution_id || row.id;
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(row);
    else byRoot.set(root, [row]);
  }

  const journeys: FlowJourney[] = [];

  for (const [rootId, segments] of byRoot) {
    segments.sort((a, b) => a.started_at.localeCompare(b.started_at));

    const first = segments[0];
    const last = segments[segments.length - 1];
    const contact = last.conversations?.contacts;
    const isActive = (ACTIVE_STATUSES as readonly string[]).includes(last.status);

    journeys.push({
      rootId,
      executionIds: segments.map(s => s.id),
      conversationId: last.conversation_id,
      contactId: last.conversations?.contact_id || null,
      contactName: contact?.name || null,
      contactPhone: contact?.phone || null,
      status: last.status as JourneyStatus,
      isActive,
      currentNodeId: last.current_node_id,
      // timeout_at também é usado para agendar follow-up de remarketing; só é
      // "retomada" de fato quando a execução está parada num atraso.
      resumeAt: last.status === 'waiting_delay' ? last.timeout_at : null,
      startedAt: first.started_at,
      endedAt: isActive ? null : last.completed_at,
      errorMessage: last.error_message,
      cancelReason: last.cancel_reason,
      segmentCount: segments.length,
    });
  }

  // Mais recentes primeiro, e quem está no fluxo agora sempre no topo — é a
  // informação acionável da tela (só dá para retirar quem ainda está dentro).
  journeys.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.startedAt.localeCompare(a.startedAt);
  });

  return journeys;
}

export function useFlowExecutionHistory(flowId: string | null, days: number = 30) {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const since = useMemo(() => {
    // days = 0 significa "todo o período" (o filtro da tela oferece essa opção).
    if (!days) return null;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }, [days]);

  const query = useQuery({
    queryKey: ['flow-execution-history', flowId, days],
    enabled: !!flowId && !!session,
    queryFn: async () => {
      let request = supabase
        .from('flow_executions')
        .select(`
          id, root_execution_id, conversation_id, status, current_node_id,
          timeout_at, started_at, completed_at, error_message, cancel_reason,
          conversations ( contact_id, contacts ( name, phone ) )
        `)
        .eq('flow_id', flowId!)
        .order('started_at', { ascending: false })
        .limit(2000);

      if (since) request = request.gte('started_at', since);

      const { data, error } = await request;
      if (error) throw error;

      return stitchJourneys((data || []) as unknown as ExecutionRow[]);
    },
  });

  // Realtime: quem está no fluxo agora muda sozinho (contato responde, atraso
  // termina, cron avança o nó). Sem isto a tela mentiria até o próximo refresh.
  useEffect(() => {
    if (!flowId) return;

    const channel = createRealtimeChannel(`flow-execution-history:${flowId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'flow_executions',
        filter: `flow_id=eq.${flowId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['flow-execution-history', flowId] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [flowId, queryClient]);

  return query;
}

/**
 * Retira contatos do fluxo.
 *
 * Encerrar a execução e devolver a conversa para atendimento humano precisa ser
 * atômico — por isso a função no banco em vez de updates soltos daqui. Uma
 * conversa que ainda tenha um fluxo pai vivo NÃO é devolvida para humano (a
 * função cuida disso), senão o sub-fluxo mataria o pai.
 */
export function useCancelFlowExecutions(flowId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ rootIds, reason }: { rootIds: string[]; reason?: string }) => {
      if (!rootIds.length) return [];

      const { data, error } = await supabase.rpc('cancel_flow_executions', {
        p_root_execution_ids: rootIds,
        p_reason: reason || null,
      });

      if (error) throw error;
      return data || [];
    },
    onSuccess: (data, variables) => {
      const affected = Array.isArray(data) ? data.length : 0;

      // 0 linhas não é erro do banco: a jornada pode ter terminado sozinha entre
      // o carregamento da tela e o clique. Dizer "retirado" nesse caso seria mentira.
      if (affected === 0) {
        toast.info('Nenhum contato foi retirado', {
          description: 'O fluxo já havia terminado para esses contatos.',
        });
      } else {
        const people = variables.rootIds.length === 1 ? 'contato retirado' : 'contatos retirados';
        toast.success(`${variables.rootIds.length} ${people} do fluxo`);
      }

      queryClient.invalidateQueries({ queryKey: ['flow-execution-history', flowId] });
      // A conversa pode ter voltado para atendimento humano.
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: Error) => {
      toast.error('Não foi possível retirar do fluxo', { description: error.message });
    },
  });
}

/**
 * Linha do tempo de uma jornada: por quais nós o contato passou, na ordem.
 *
 * Lê os logs de TODOS os trechos de uma vez — é o que faz a jornada aparecer
 * contínua mesmo tendo sido fatiada pelas esperas.
 */
export interface JourneyNodeLog {
  id: string;
  nodeId: string;
  nodeName: string | null;
  nodeType: string | null;
  status: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

export function useJourneyNodeLogs(executionIds: string[] | null) {
  const key = executionIds?.join(',') || '';

  return useQuery({
    queryKey: ['flow-journey-nodes', key],
    enabled: !!executionIds?.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flow_node_logs')
        .select('id, node_id, node_name, node_type, status, error_message, duration_ms, created_at')
        .in('flow_execution_id', executionIds!)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map((row): JourneyNodeLog => ({
        id: row.id,
        nodeId: row.node_id,
        nodeName: row.node_name,
        nodeType: row.node_type,
        status: row.status,
        errorMessage: row.error_message,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
      }));
    },
  });
}
