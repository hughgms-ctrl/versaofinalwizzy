import { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Hourglass,
  Layers,
  Loader2,
  Pause,
  Timer,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScheduledMessage } from '@/hooks/useScheduledMessages';
import { useScheduledMessageProgress } from '@/hooks/useScheduledMessageProgress';

/**
 * "Painel do disparo": versão em tela do docs/monitor-disparo-em-massa.sql.
 * Abre ao clicar no card do agendamento e responde, sem SQL: quantos saíram,
 * quantos faltam, quando termina, quem é o próximo e por que parou.
 *
 * NÃO exibe mensagem de erro técnica (nem a do disparo, nem a por contato) —
 * o usuário final vê apenas QUEM não foi entregue, para reenviar manualmente.
 */

const MINUTE = 60;
const HOUR = 3600;

/** Formata uma duração em segundos como "2h 15min" / "3min 20s". */
function humanizeSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < MINUTE) return `${seconds}s`;
  if (seconds < HOUR) {
    const minutes = Math.floor(seconds / MINUTE);
    const rest = seconds % MINUTE;
    return rest > 0 ? `${minutes}min ${rest}s` : `${minutes}min`;
  }
  const hours = Math.floor(seconds / HOUR);
  const minutes = Math.round((seconds % HOUR) / MINUTE);
  return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
}

/**
 * Espera prevista até o contato na posição `index` (0-based) sair, somando o
 * delay entre contatos e as pausas de lote que ainda vão acontecer.
 * Mesma fórmula do bloco 2 do SQL.
 */
function waitSecondsForPosition(message: ScheduledMessage, index: number): number {
  const delay = message.delay_between_contacts || 0;
  const batchMax = message.batch_size_max || 0;
  const pauseMinutes = message.batch_pause_minutes || 0;
  const pauses = batchMax > 0 ? Math.floor(index / batchMax) * pauseMinutes * MINUTE : 0;
  return index * delay + pauses;
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  tone: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', tone)} />
        <span>{label}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function ScheduledMessageDetailDialog({
  open,
  onOpenChange,
  message,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: ScheduledMessage | null;
}) {
  const isRunning = message ? ['pending', 'processing'].includes(message.status) : false;

  // Disparo encerrado usa o retrato congelado gravado pelo motor — é o que faz
  // o painel de uma execução antiga continuar acessível mesmo depois de uma
  // recorrência reciclar as linhas de progresso.
  const { data: progress, isLoading } = useScheduledMessageProgress(
    message?.id ?? null,
    open,
    message?.last_run_summary,
    isRunning,
  );

  // Pausa entre lotes em curso (bloco 1/4 do SQL). Só conta se ainda no futuro.
  const pausedUntil = useMemo(() => {
    const raw = message?.batch_paused_until;
    if (!raw) return null;
    const date = new Date(raw);
    return date.getTime() > Date.now() ? date : null;
  }, [message]);

  /** Estimativa para terminar: pendentes × delay + pausas restantes. */
  const remainingEstimate = useMemo(() => {
    if (!message || !progress || progress.pending === 0) return null;
    const base = waitSecondsForPosition(message, progress.pending);
    const pauseNow = pausedUntil ? (pausedUntil.getTime() - Date.now()) / 1000 : 0;
    return humanizeSeconds(base + pauseNow);
  }, [message, progress, pausedUntil]);

  /**
   * Diagnóstico em linguagem de usuário (bloco 4 do SQL), sem vazar o texto
   * cru do erro: quando falha, apenas diz que falhou e sugere o caminho.
   */
  const diagnosis = useMemo((): { tone: 'ok' | 'info' | 'warn'; text: string } | null => {
    if (!message) return null;
    const updatedAgo = (Date.now() - new Date(message.updated_at).getTime()) / 1000;

    if (message.status === 'sent') return { tone: 'ok', text: 'Disparo concluído.' };
    if (message.status === 'cancelled') return { tone: 'info', text: 'Disparo cancelado.' };
    if (message.status === 'failed') {
      return {
        tone: 'warn',
        text: 'O disparo não pôde ser concluído. Verifique se o número de WhatsApp deste workspace está conectado e reagende.',
      };
    }
    if (pausedUntil) {
      return {
        tone: 'info',
        text: `Em pausa entre lotes — retoma em ${humanizeSeconds((pausedUntil.getTime() - Date.now()) / 1000)}.`,
      };
    }
    if (message.status === 'processing') {
      // O motor tem orçamento de ~50s por execução e devolve o job para o cron.
      // Acima de ~4min sem avanço, o próprio cron destrava no ciclo seguinte.
      return updatedAgo > 240
        ? { tone: 'warn', text: 'Sem avanço há alguns minutos. O sistema retoma sozinho no próximo ciclo.' }
        : { tone: 'ok', text: 'Enviando agora.' };
    }
    // pending
    const nextAt = message.next_execution_at ? new Date(message.next_execution_at) : null;
    if (nextAt && nextAt.getTime() > Date.now()) {
      return {
        tone: 'info',
        text: `Aguardando o horário agendado — faltam ${humanizeSeconds((nextAt.getTime() - Date.now()) / 1000)}.`,
      };
    }
    if (progress && progress.processed > 0) {
      return { tone: 'ok', text: 'Em andamento — retomando entre os ciclos de envio.' };
    }
    return { tone: 'info', text: 'Na fila para iniciar.' };
  }, [message, pausedUntil, progress]);

  if (!message) return null;

  const title =
    message.name ||
    (message.content_type === 'message' ? 'Mensagem agendada' : message.flow?.name || 'Fluxo agendado');

  const hasContactRows = !!progress && progress.total > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{title}</DialogTitle>
          <DialogDescription>
            Agendado para{' '}
            {format(new Date(message.next_execution_at || message.scheduled_at), "dd/MM/yyyy 'às' HH:mm", {
              locale: ptBR,
            })}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {diagnosis && (
              <div
                className={cn(
                  'flex items-start gap-2 rounded-lg border p-3 text-sm',
                  diagnosis.tone === 'ok' && 'border-green-500/20 bg-green-500/10 text-green-600',
                  diagnosis.tone === 'info' && 'border-blue-500/20 bg-blue-500/10 text-blue-600',
                  diagnosis.tone === 'warn' && 'border-amber-500/20 bg-amber-500/10 text-amber-600',
                )}
              >
                {diagnosis.tone === 'ok' ? (
                  <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                )}
                <span>{diagnosis.text}</span>
              </div>
            )}

            {hasContactRows ? (
              <>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {progress.processed} de {progress.total} contatos processados
                    </span>
                    <span className="font-medium tabular-nums">{progress.percent}%</span>
                  </div>
                  <Progress value={progress.percent} className="h-2" />
                </div>

                <div className={cn('grid gap-3 grid-cols-2', progress.fromSnapshot ? 'sm:grid-cols-3' : 'sm:grid-cols-4')}>
                  <StatTile label="Total" value={progress.total} icon={Users} tone="text-muted-foreground" />
                  <StatTile label="Enviados" value={progress.sent} icon={CheckCircle} tone="text-green-500" />
                  {/* "Faltam" só existe em disparo vivo: no retrato tudo já fechou. */}
                  {!progress.fromSnapshot && (
                    <StatTile label="Faltam" value={progress.pending} icon={Hourglass} tone="text-blue-500" />
                  )}
                  <StatTile
                    label="Não entregues"
                    value={progress.failed}
                    icon={AlertCircle}
                    tone={progress.failed > 0 ? 'text-amber-500' : 'text-muted-foreground'}
                  />
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                  {remainingEstimate && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Conclusão estimada em {remainingEstimate}
                    </span>
                  )}
                  {!!message.delay_between_contacts && message.delay_between_contacts > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5" />
                      {message.delay_between_contacts}s entre contatos
                    </span>
                  )}
                  {!!message.batch_size_max && message.batch_size_max > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5" />
                      Lotes de até {message.batch_size_max}
                      {!!message.batch_pause_minutes && ` · pausa de ${message.batch_pause_minutes}min`}
                    </span>
                  )}
                  {pausedUntil && (
                    <span className="flex items-center gap-1.5 text-blue-500">
                      <Pause className="h-3.5 w-3.5" />
                      Retoma às {format(pausedUntil, 'HH:mm', { locale: ptBR })}
                    </span>
                  )}
                  {progress.fromSnapshot && progress.finishedAt ? (
                    <span className="flex items-center gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Concluído em{' '}
                      {format(new Date(progress.finishedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  ) : (
                    progress.lastSentAt && (
                      <span className="flex items-center gap-1.5">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Último envio às {format(new Date(progress.lastSentAt), 'HH:mm', { locale: ptBR })}
                      </span>
                    )
                  )}
                </div>

                {isRunning && progress.queue.length > 0 && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <Hourglass className="h-4 w-4 text-blue-500" />
                      Próximos da fila
                      <Badge variant="secondary" className="text-xs font-normal">
                        {progress.queue.length} na fila
                      </Badge>
                    </h3>
                    {/* A ordem é a mais provável (created_at) — o motor não
                        garante ordenação, então isto é previsão, não fila exata. */}
                    <ScrollArea className="max-h-56 rounded-lg border">
                      <div className="divide-y">
                        {progress.queue.slice(0, 30).map((row, index) => {
                          const wait = waitSecondsForPosition(message, index);
                          const eta = new Date(
                            Math.max(Date.now(), pausedUntil?.getTime() ?? 0) + wait * 1000,
                          );
                          return (
                            <div key={row.contact_id} className="flex items-center justify-between gap-3 px-3 py-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="w-6 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm">{row.contact?.name || 'Sem nome'}</p>
                                  <p className="truncate text-xs text-muted-foreground">{row.contact?.phone}</p>
                                </div>
                              </div>
                              <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                                ~{format(eta, 'HH:mm', { locale: ptBR })}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                    {progress.queue.length > 30 && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Mostrando os 30 primeiros de {progress.queue.length}. Horários são estimativas.
                      </p>
                    )}
                  </div>
                )}

                {progress.undelivered.length > 0 && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      Não entregues
                      <Badge variant="secondary" className="text-xs font-normal">
                        {progress.undelivered.length}
                      </Badge>
                    </h3>
                    <ScrollArea className="max-h-48 rounded-lg border">
                      <div className="divide-y">
                        {progress.undelivered.map(row => (
                          <div key={row.contact_id} className="px-3 py-2">
                            <p className="truncate text-sm">{row.contact?.name || 'Sem nome'}</p>
                            <p className="truncate text-xs text-muted-foreground">{row.contact?.phone}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {progress.undeliveredTruncated
                        ? `Mostrando ${progress.undelivered.length} de ${progress.failed}. Confira se os números estão corretos e reenvie se necessário.`
                        : 'Estes contatos não receberam a mensagem. Confira se o número está correto e reenvie se necessário.'}
                    </p>
                  </div>
                )}
              </>
            ) : (
              // Sem linhas de progresso: alvo 'single'/'group'/'groups' (o motor
              // envia direto, sem controle por contato) ou disparo antigo, já
              // concluído antes do resumo por execução passar a ser gravado.
              <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                {isRunning
                  ? 'Este agendamento ainda não expandiu a lista de contatos. O detalhamento aparece assim que o envio começar.'
                  : 'Sem detalhamento por contato para este disparo. Envios diretos para um contato ou grupo não têm acompanhamento individual, e disparos concluídos antes desta atualização não guardaram o resumo.'}
              </div>
            )}

            {message.execution_count > 0 && (
              <p className="text-xs text-muted-foreground">
                Executado {message.execution_count}x
                {message.last_executed_at &&
                  ` · última vez em ${format(new Date(message.last_executed_at), "dd/MM 'às' HH:mm", { locale: ptBR })}`}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
