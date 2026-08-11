import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Users, Clock, CheckCircle2, XCircle, PlayCircle, MessageSquare,
  Search, Ban, AlertTriangle, Hourglass, Loader2, Timer,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import {
  useFlowExecutionHistory, useCancelFlowExecutions, useJourneyNodeLogs,
  type FlowJourney,
} from '@/hooks/useFlowExecutionHistory';
import { useFlow } from '@/hooks/useFlows';
import { cn } from '@/lib/utils';

/**
 * Aba "Execuções" do fluxo: quem já passou por ele e quem está dentro agora.
 *
 * As duas coisas vivem na mesma lista de propósito — na prática a pergunta é
 * sempre "o que aconteceu com o Fulano nesse fluxo", e separar em duas telas
 * obrigaria a procurar nas duas.
 */

type StatusFilter = 'all' | 'active' | 'completed' | 'cancelled' | 'failed';

const STATUS_META: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  running:       { label: 'Em execução', icon: PlayCircle,   className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  waiting_input: { label: 'Aguardando resposta', icon: MessageSquare, className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  waiting_delay: { label: 'Em espera', icon: Hourglass,      className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' },
  completed:     { label: 'Concluído',  icon: CheckCircle2,  className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  cancelled:     { label: 'Retirado',   icon: Ban,           className: 'bg-muted text-muted-foreground border-border' },
  failed:        { label: 'Falhou',     icon: XCircle,       className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] || STATUS_META.completed;
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-normal whitespace-nowrap', meta.className)}>
      <Icon className="h-3 w-3 shrink-0" />
      {meta.label}
    </Badge>
  );
}

/** "3h 20min", "2 dias" — duração legível sem precisão falsa de segundos. */
function formatDuration(fromIso: string, toIso: string | null): string {
  const from = new Date(fromIso).getTime();
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  const totalMinutes = Math.max(0, Math.round((to - from) / 60000));

  if (totalMinutes < 1) return 'menos de 1min';
  if (totalMinutes < 60) return `${totalMinutes}min`;

  const hours = Math.floor(totalMinutes / 60);
  if (hours < 24) {
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}h ${minutes}min` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

interface Props {
  flowId: string;
}

export function FlowExecutionsPanel({ flowId }: Props) {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailJourney, setDetailJourney] = useState<FlowJourney | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<FlowJourney[] | null>(null);

  const { data: journeys, isLoading } = useFlowExecutionHistory(flowId, days);
  const { data: flow } = useFlow(flowId);
  const cancelMutation = useCancelFlowExecutions(flowId);

  // Traduz o id do nó para o nome que a pessoa deu a ele no editor. Sem isso a
  // coluna "onde está" mostraria algo como "node-1723...", que não diz nada.
  const nodeLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of (flow?.nodes || [])) {
      const data = node.data as Record<string, unknown> | undefined;
      const label = (data?.label || data?.name || node.type) as string;
      map.set(node.id, String(label));
    }
    return map;
  }, [flow?.nodes]);

  const nodeLabel = (nodeId: string | null) => {
    if (!nodeId) return '—';
    return nodeLabels.get(nodeId) || nodeId;
  };

  const filtered = useMemo(() => {
    let rows = journeys || [];

    if (statusFilter === 'active') rows = rows.filter(j => j.isActive);
    else if (statusFilter !== 'all') rows = rows.filter(j => j.status === statusFilter);

    const term = search.trim().toLowerCase();
    if (term) {
      rows = rows.filter(j =>
        (j.contactName || '').toLowerCase().includes(term) ||
        (j.contactPhone || '').includes(term)
      );
    }
    return rows;
  }, [journeys, statusFilter, search]);

  // Só quem está no fluxo pode ser retirado — não faz sentido "parar" quem já saiu.
  const selectableRows = useMemo(() => filtered.filter(j => j.isActive), [filtered]);
  const selectedJourneys = useMemo(
    () => selectableRows.filter(j => selected.has(j.rootId)),
    [selectableRows, selected],
  );

  const activeCount = (journeys || []).filter(j => j.isActive).length;
  const waitingCount = (journeys || []).filter(j => j.status === 'waiting_delay').length;

  const allSelectableChecked = selectableRows.length > 0 && selectedJourneys.length === selectableRows.length;

  const toggleAll = () => {
    setSelected(allSelectableChecked ? new Set() : new Set(selectableRows.map(j => j.rootId)));
  };

  const toggleOne = (rootId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  };

  const confirmCancel = async () => {
    if (!confirmTarget?.length) return;
    await cancelMutation.mutateAsync({
      rootIds: confirmTarget.map(j => j.rootId),
      reason: 'Retirado manualmente pelo histórico do fluxo',
    });
    setSelected(new Set());
    setConfirmTarget(null);
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Resumo + filtros */}
      <div className="border-b border-border px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="flex items-center gap-2 font-medium">
            <Users className="h-4 w-4 text-muted-foreground" />
            {activeCount} {activeCount === 1 ? 'contato no fluxo' : 'contatos no fluxo'}
          </span>
          {waitingCount > 0 && (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Hourglass className="h-4 w-4" />
              {waitingCount} em espera
            </span>
          )}
          <span className="text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[168px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="active">No fluxo agora</SelectItem>
              <SelectItem value="completed">Concluídos</SelectItem>
              <SelectItem value="cancelled">Retirados</SelectItem>
              <SelectItem value="failed">Com falha</SelectItem>
            </SelectContent>
          </Select>

          <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="0">Todo o período</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Barra de ação em lote: só aparece com seleção, para não ocupar espaço à toa */}
        {selectedJourneys.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
            <span className="text-sm">
              {selectedJourneys.length} {selectedJourneys.length === 1 ? 'selecionado' : 'selecionados'}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Limpar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmTarget(selectedJourneys)}
                disabled={cancelMutation.isPending}
              >
                <Ban className="mr-1.5 h-4 w-4" />
                Retirar do fluxo
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Lista */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState hasFilters={!!search || statusFilter !== 'all'} />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-4 py-2">
                  {selectableRows.length > 0 && (
                    <Checkbox
                      checked={allSelectableChecked}
                      onCheckedChange={toggleAll}
                      aria-label="Selecionar todos no fluxo"
                    />
                  )}
                </th>
                <th className="px-2 py-2 font-medium">Contato</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Onde está</th>
                <th className="px-2 py-2 font-medium">Início</th>
                <th className="px-2 py-2 font-medium">Duração</th>
                <th className="w-24 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(journey => (
                <tr
                  key={journey.rootId}
                  className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/40"
                  onClick={() => setDetailJourney(journey)}
                >
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    {journey.isActive && (
                      <Checkbox
                        checked={selected.has(journey.rootId)}
                        onCheckedChange={() => toggleOne(journey.rootId)}
                        aria-label={`Selecionar ${journey.contactName || 'contato'}`}
                      />
                    )}
                  </td>

                  <td className="px-2 py-3">
                    <div className="font-medium">{journey.contactName || 'Sem nome'}</div>
                    {journey.contactPhone && (
                      <div className="text-xs text-muted-foreground">{journey.contactPhone}</div>
                    )}
                  </td>

                  <td className="px-2 py-3">
                    <StatusBadge status={journey.status} />
                  </td>

                  <td className="px-2 py-3">
                    <div className="max-w-[220px] truncate">{nodeLabel(journey.currentNodeId)}</div>
                    {journey.resumeAt && (
                      <div className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400">
                        <Timer className="h-3 w-3 shrink-0" />
                        retoma {formatDistanceToNow(new Date(journey.resumeAt), { locale: ptBR, addSuffix: true })}
                      </div>
                    )}
                  </td>

                  <td className="px-2 py-3 text-muted-foreground">
                    {format(new Date(journey.startedAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </td>

                  <td className="px-2 py-3 text-muted-foreground">
                    {formatDuration(journey.startedAt, journey.endedAt)}
                  </td>

                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Abrir conversa"
                        onClick={() => navigate(`/conversations?id=${journey.conversationId}`)}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                      {journey.isActive && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Retirar do fluxo"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmTarget([journey])}
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ScrollArea>

      <JourneyDetailSheet
        journey={detailJourney}
        onClose={() => setDetailJourney(null)}
        nodeLabel={nodeLabel}
        onCancel={j => setConfirmTarget([j])}
      />

      <CancelConfirmDialog
        target={confirmTarget}
        pending={cancelMutation.isPending}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={confirmCancel}
      />
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Users className="h-10 w-10 text-muted-foreground/40" />
      <p className="font-medium">
        {hasFilters ? 'Nenhum resultado para esse filtro' : 'Ninguém passou por este fluxo ainda'}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {hasFilters
          ? 'Tente ampliar o período ou limpar a busca.'
          : 'Quando um contato entrar no fluxo, ele aparece aqui — junto de por quais etapas passou.'}
      </p>
    </div>
  );
}

/** Linha do tempo da passagem do contato: por quais nós andou, na ordem. */
function JourneyDetailSheet({
  journey, onClose, nodeLabel, onCancel,
}: {
  journey: FlowJourney | null;
  onClose: () => void;
  nodeLabel: (id: string | null) => string;
  onCancel: (j: FlowJourney) => void;
}) {
  const { data: logs, isLoading } = useJourneyNodeLogs(journey?.executionIds || null);

  return (
    <Sheet open={!!journey} onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {journey && (
          <>
            <SheetHeader className="space-y-3 text-left">
              <SheetTitle>{journey.contactName || 'Sem nome'}</SheetTitle>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={journey.status} />
                {journey.contactPhone && (
                  <span className="text-sm text-muted-foreground">{journey.contactPhone}</span>
                )}
              </div>
            </SheetHeader>

            <div className="mt-4 space-y-1 rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Entrou no fluxo</span>
                <span>{format(new Date(journey.startedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{journey.isActive ? 'Está no fluxo há' : 'Durou'}</span>
                <span>{formatDuration(journey.startedAt, journey.endedAt)}</span>
              </div>
              {journey.resumeAt && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Retoma em</span>
                  <span className="text-violet-600 dark:text-violet-400">
                    {format(new Date(journey.resumeAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
              )}
              {journey.isActive && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Parado em</span>
                  <span className="max-w-[60%] truncate text-right">{nodeLabel(journey.currentNodeId)}</span>
                </div>
              )}
              {journey.cancelReason && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Motivo da saída</span>
                  <span className="max-w-[60%] text-right">{journey.cancelReason}</span>
                </div>
              )}
              {journey.errorMessage && journey.status === 'failed' && (
                <div className="flex items-start gap-2 pt-1 text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="text-xs">{journey.errorMessage}</span>
                </div>
              )}
            </div>

            <div className="mt-5">
              <h4 className="mb-3 text-sm font-medium">Etapas percorridas</h4>

              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !logs?.length ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma etapa registrada. O detalhe por etapa é mantido por 90 dias.
                </p>
              ) : (
                <ol className="relative space-y-0 border-l border-border pl-5">
                  {logs.map(log => (
                    <li key={log.id} className="relative pb-4 last:pb-0">
                      <span
                        className={cn(
                          'absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background',
                          log.status === 'failed' || log.status === 'error'
                            ? 'bg-destructive'
                            : log.status === 'success'
                              ? 'bg-emerald-500'
                              : 'bg-muted-foreground/40',
                        )}
                      />
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium">{log.nodeName || log.nodeId}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {format(new Date(log.createdAt), 'dd/MM HH:mm', { locale: ptBR })}
                        </span>
                      </div>
                      {log.errorMessage && (
                        <p className="mt-0.5 text-xs text-destructive">{log.errorMessage}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {journey.isActive && (
              <Button
                variant="destructive"
                className="mt-6 w-full"
                onClick={() => { onCancel(journey); onClose(); }}
              >
                <Ban className="mr-2 h-4 w-4" />
                Retirar do fluxo
              </Button>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CancelConfirmDialog({
  target, pending, onCancel, onConfirm,
}: {
  target: FlowJourney[] | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const count = target?.length || 0;
  const single = count === 1 ? target?.[0] : null;
  // Quem está numa espera perde as mensagens que ainda iam sair — é o caso em
  // que a retirada tem consequência visível, então vale avisar.
  const waitingCount = (target || []).filter(j => j.status === 'waiting_delay').length;

  return (
    <AlertDialog open={!!target} onOpenChange={open => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {single
              ? `Retirar ${single.contactName || 'este contato'} do fluxo?`
              : `Retirar ${count} contatos do fluxo?`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                {single ? 'O contato para' : 'Os contatos param'} de avançar no fluxo agora e não
                {single ? ' recebe' : ' recebem'} mais nenhuma mensagem dele.
                A conversa volta para atendimento humano.
              </p>
              {waitingCount > 0 && (
                <p>
                  {waitingCount === count && count === 1
                    ? 'Este contato está numa espera: a mensagem agendada não será enviada.'
                    : `${waitingCount} ${waitingCount === 1 ? 'está' : 'estão'} em espera — as mensagens agendadas não serão enviadas.`}
                </p>
              )}
              <p className="text-muted-foreground">
                As etiquetas e o funil não são alterados, e o histórico continua visível aqui.
                Esta ação não pode ser desfeita.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={e => { e.preventDefault(); onConfirm(); }}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Retirar do fluxo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
