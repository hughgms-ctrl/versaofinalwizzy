import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createRealtimeChannel } from '@/lib/realtimeChannel';

/**
 * Progresso de um disparo em massa, lido de scheduled_message_contacts.
 *
 * Equivalente em UI do painel de docs/monitor-disparo-em-massa.sql: responde
 * "está andando? falta quanto? quando termina?" sem precisar do SQL Editor.
 *
 * DECISÃO DE PRODUTO: mensagens de erro técnicas (error_message do contato ou
 * do disparo) NÃO são expostas aqui. O usuário final vê apenas QUEM não foi
 * entregue, para poder reenviar. O texto cru vindo da Evolution/Z-API fica só
 * nos logs e no SQL de suporte.
 */

export interface ScheduledContactRow {
  contact_id: string;
  status: string;
  sent_at: string | null;
  contact: { id: string; name: string | null; phone: string } | null;
}

export interface ScheduledMessageProgress {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  /** enviados + não entregues (tudo que já foi processado) */
  processed: number;
  /** 0-100, uma casa decimal */
  percent: number;
  lastSentAt: string | null;
  /** Contatos ainda na fila, na ordem provável de saída. */
  queue: ScheduledContactRow[];
  /** Contatos que não foram entregues (sem o motivo técnico). */
  undelivered: ScheduledContactRow[];
  /** true quando os números vêm do resumo congelado, não da tabela viva. */
  fromSnapshot: boolean;
  /** Quando a execução retratada terminou (só com fromSnapshot). */
  finishedAt: string | null;
  /** A lista de não entregues foi cortada no teto do resumo. */
  undeliveredTruncated: boolean;
}

/** Formato de scheduled_messages.last_run_summary (ver migration 20260811120000). */
interface LastRunSummary {
  finished_at?: string;
  total?: number;
  sent?: number;
  failed?: number;
  undelivered?: Array<{ name: string | null; phone: string | null }>;
  undelivered_truncated?: boolean;
}

// A tabela filha só existe para alvos que expandem em vários contatos. Para
// 'single'/'group'/'groups' o motor não cria linhas, então o dialog cai no
// resumo do próprio agendamento.
const PAGE_LIMIT = 5000;

// Janela de agrupamento dos eventos de realtime. O motor marca um contato por
// vez; agrupar em 3s troca "1 refetch por contato" por "no máximo 1 refetch a
// cada 3s", sem que o painel pareça travado.
const REALTIME_DEBOUNCE_MS = 3000;

/**
 * @param scheduledMessageId disparo a acompanhar
 * @param enabled só busca quando o painel está aberto
 * @param lastRunSummary retrato congelado da última execução, quando houver
 * @param isRunning disparo em andamento ('pending'/'processing')
 *
 * Quando o disparo NÃO está rodando e existe um resumo salvo, o hook devolve o
 * retrato congelado e nem consulta scheduled_message_contacts — é o que garante
 * que um disparo concluído continue mostrando os números DELE para sempre,
 * mesmo depois de uma recorrência reciclar as linhas de progresso.
 */
export function useScheduledMessageProgress(
  scheduledMessageId: string | null,
  enabled = true,
  lastRunSummary?: unknown,
  isRunning = true,
) {
  const queryClient = useQueryClient();

  const snapshot = useMemo(
    () => toSnapshotProgress(lastRunSummary),
    [lastRunSummary],
  );
  // Disparo fechado com resumo salvo: a fonte da verdade é o retrato.
  const useSnapshot = !isRunning && !!snapshot;

  const queryKey = ['scheduled-message-progress', scheduledMessageId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<ScheduledMessageProgress | null> => {
      if (!scheduledMessageId) return null;

      const { data, error } = await supabase
        .from('scheduled_message_contacts')
        .select('contact_id, status, sent_at, contact:contacts(id, name, phone)')
        .eq('scheduled_message_id', scheduledMessageId)
        .order('created_at', { ascending: true })
        .limit(PAGE_LIMIT);

      if (error) throw error;

      const rows = (data || []) as unknown as ScheduledContactRow[];
      const sent = rows.filter(r => r.status === 'sent');
      const failed = rows.filter(r => r.status === 'failed');
      const pending = rows.filter(r => r.status === 'pending');
      const total = rows.length;
      const processed = sent.length + failed.length;

      const lastSentAt = sent.reduce<string | null>((acc, row) => {
        if (!row.sent_at) return acc;
        return !acc || row.sent_at > acc ? row.sent_at : acc;
      }, null);

      return {
        total,
        sent: sent.length,
        failed: failed.length,
        pending: pending.length,
        processed,
        percent: total > 0 ? Math.round((processed / total) * 1000) / 10 : 0,
        lastSentAt,
        queue: pending,
        undelivered: failed,
        fromSnapshot: false,
        finishedAt: null,
        undeliveredTruncated: false,
      };
    },
    enabled: enabled && !!scheduledMessageId && !useSnapshot,
    // Fallback para o caso do realtime não entregar. Só vale a pena enquanto o
    // disparo está ANDANDO: se não há mais ninguém pendente, o número não muda
    // mais e ficar refazendo a query é desperdício puro. Um disparo concluído
    // é lido uma vez e pronto.
    refetchInterval: (query) => {
      if (!enabled || !scheduledMessageId) return false;
      const data = query.state.data as ScheduledMessageProgress | null | undefined;
      if (data && data.pending === 0) return false;
      return 60_000;
    },
    staleTime: 30_000,
  });

  // Atualização conforme o motor marca cada contato. O filtro só pode ser por
  // scheduled_message_id — a tabela não tem organization_id.
  //
  // CUIDADO COM AMPLIFICAÇÃO: o motor faz UM UPDATE POR CONTATO. Sem debounce,
  // um disparo de 2000 contatos geraria 2000 refetches deste painel. Por isso
  // os eventos são agrupados numa janela e viram no máximo 1 refetch a cada
  // REALTIME_DEBOUNCE_MS. Também NÃO invalidamos ['scheduled-messages'] aqui:
  // é a listagem inteira com joins (contacts/tags/flows) e o card já mostra o
  // essencial — pagar essa query a cada contato enviado é o pior negócio
  // possível para um dado que muda de 1 em 1.
  useEffect(() => {
    // No modo snapshot não há nada a acompanhar: o dado está congelado.
    if (!enabled || !scheduledMessageId || useSnapshot) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (timer) return; // já há um refetch agendado nesta janela
      timer = setTimeout(() => {
        timer = null;
        queryClient.invalidateQueries({ queryKey });
      }, REALTIME_DEBOUNCE_MS);
    };

    const channel = createRealtimeChannel(`scheduled-progress:${scheduledMessageId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scheduled_message_contacts',
          filter: `scheduled_message_id=eq.${scheduledMessageId}`,
        },
        scheduleRefetch,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledMessageId, enabled, queryClient, useSnapshot]);

  // No modo snapshot devolvemos o retrato congelado no lugar do resultado da
  // query (que nem chega a rodar). Assim o componente consome sempre a mesma
  // forma, sem precisar saber de onde o número veio.
  if (useSnapshot) {
    return {
      ...query,
      data: snapshot,
      isLoading: false,
      isFetching: false,
    } as typeof query;
  }

  return query;
}

/** Converte o JSON de last_run_summary na mesma forma do progresso ao vivo. */
function toSnapshotProgress(raw: unknown): ScheduledMessageProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const summary = raw as LastRunSummary;

  const sent = summary.sent ?? 0;
  const failed = summary.failed ?? 0;
  const total = summary.total ?? sent + failed;
  if (total === 0 && sent === 0 && failed === 0) return null;

  // O retrato é de uma execução JÁ FECHADA: não há fila nem pendentes.
  const undelivered: ScheduledContactRow[] = (summary.undelivered || []).map((c, index) => ({
    contact_id: `snapshot-${index}`,
    status: 'failed',
    sent_at: null,
    contact: { id: `snapshot-${index}`, name: c?.name ?? null, phone: c?.phone ?? '' },
  }));

  return {
    total,
    sent,
    failed,
    pending: 0,
    processed: sent + failed,
    percent: total > 0 ? Math.round(((sent + failed) / total) * 1000) / 10 : 0,
    lastSentAt: summary.finished_at ?? null,
    queue: [],
    undelivered,
    fromSnapshot: true,
    finishedAt: summary.finished_at ?? null,
    undeliveredTruncated: !!summary.undelivered_truncated,
  };
}
