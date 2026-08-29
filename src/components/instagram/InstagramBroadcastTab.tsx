import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Info, Loader2, Megaphone, Send, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTags } from '@/hooks/useTags';
import type { InstagramAccount } from '@/hooks/useInstagramAccounts';
import {
  useCancelInstagramBroadcast,
  useCreateInstagramBroadcast,
  useInstagramAudienceCount,
  useInstagramBroadcasts,
} from '@/hooks/useInstagramBroadcasts';
import {
  EngageEmptyState,
  EngageFilterChip,
  EngageListSkeleton,
  EngageNotConnected,
  EngagePanel,
  EngageStatus,
  EngageToolbar,
  type EngageTone,
} from './EngageUI';

/**
 * Disparo de DM no Instagram.
 *
 * A tela existe para dizer uma coisa antes de qualquer outra: **o público não é
 * a sua base**. A Meta só entrega DM comum dentro da janela de 24 horas contada
 * a partir da última mensagem que a pessoa enviou — disparo para base fria é
 * recusado e, repetido, derruba a conta do cliente.
 *
 * Por isso o número de alcançáveis aparece grande e ao lado do total, ANTES de
 * escrever a mensagem. Sem esse contraste (2.000 contatos → 80 destinatários), o
 * cliente monta o disparo, vê o resultado e conclui que a ferramenta falhou.
 */

interface InstagramBroadcastTabProps {
  accounts: InstagramAccount[];
}

const STATUS: Record<string, { tone: EngageTone; label: string }> = {
  sending: { tone: 'live', label: 'enviando' },
  completed: { tone: 'ok', label: 'concluído' },
  cancelled: { tone: 'idle', label: 'cancelado' },
};

export function InstagramBroadcastTab({ accounts }: InstagramBroadcastTabProps) {
  const { toast } = useToast();
  const { data: broadcasts = [], isLoading } = useInstagramBroadcasts();
  const { data: tags = [] } = useTags();
  const createBroadcast = useCreateInstagramBroadcast();
  const cancelBroadcast = useCancelInstagramBroadcast();

  const [open, setOpen] = useState(false);
  // As contas chegam por consulta assíncrona: um estado inicializado com
  // `accounts[0]` no primeiro render nasceria vazio e nunca se corrigiria.
  // Derivar o padrão a cada render resolve sem efeito colateral.
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const accountId = selectedAccountId || accounts[0]?.id || '';
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [linkEnabled, setLinkEnabled] = useState(false);
  const [linkLabel, setLinkLabel] = useState('Acessar');
  const [linkUrl, setLinkUrl] = useState('');
  const [sending, setSending] = useState(false);

  const { data: audience, isFetching: countingAudience } = useInstagramAudienceCount(accountId, tagIds);

  const reset = () => {
    setName('');
    setMessage('');
    setTagIds([]);
    setLinkEnabled(false);
    setLinkUrl('');
    setLinkLabel('Acessar');
  };

  const canSend = !!accountId
    && !!name.trim()
    && !!message.trim()
    && (!linkEnabled || /^https?:\/\//i.test(linkUrl.trim()))
    && (audience?.eligible || 0) > 0;

  const handleSend = async () => {
    setSending(true);
    try {
      const result = await createBroadcast.mutateAsync({
        accountId,
        name: name.trim(),
        message: message.trim(),
        button: linkEnabled && linkUrl.trim()
          ? { label: linkLabel.trim() || 'Acessar', url: linkUrl.trim() }
          : null,
        tagIds,
      });
      toast({
        title: 'Disparo iniciado',
        description: `${result.recipients} ${result.recipients === 1 ? 'pessoa' : 'pessoas'} na fila. O envio é escalonado para respeitar o limite da conta.`,
      });
      setOpen(false);
      reset();
    } catch (error: any) {
      toast({ title: 'Não foi possível disparar', description: error.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelBroadcast.mutateAsync(id);
      toast({ title: 'Disparo cancelado', description: 'Quem ainda não recebeu não vai receber.' });
    } catch (error: any) {
      toast({ title: 'Erro ao cancelar', description: error.message, variant: 'destructive' });
    }
  };

  if (!accounts.length) {
    return (
      <EngageNotConnected purpose="O disparo manda DM para quem interagiu com a sua conta nas últimas 24 horas." />
    );
  }

  return (
    <div className="space-y-5">
      {/* Nota, não cartão: a lista abaixo já é uma superfície, e mais uma do
          mesmo peso competiria com ela. A cor de atenção fica só no ícone —
          `status-pending` como texto não passa dos 4.5:1 em corpo pequeno. */}
      <div className="flex gap-3 rounded-xl border border-status-pending/25 bg-status-pending/[0.06] p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-pending" aria-hidden />
        <div className="max-w-[70ch] space-y-1 text-sm">
          <p className="text-[15px] font-medium tracking-[-0.011em]">
            O público é quem respondeu nas últimas 24 horas.
          </p>
          <p className="leading-relaxed text-muted-foreground">
            O Instagram não entrega DM fora dessa janela — e insistir derruba a conta.
            Não é limite da Wizzy: é regra da Meta, e a conta punida seria a sua. Para
            alcançar mais gente, o caminho é fazer mais gente responder — automação de
            comentário, story ou enquete.
          </p>
        </div>
      </div>

      <EngageToolbar>
        <p className="text-[15px] tracking-[-0.011em] text-muted-foreground">
          {broadcasts.length
            ? `${broadcasts.length} ${broadcasts.length === 1 ? 'disparo' : 'disparos'} no histórico`
            : 'Nenhum disparo ainda'}
        </p>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Megaphone className="h-4 w-4" aria-hidden />
          Novo disparo
        </Button>
      </EngageToolbar>

      {isLoading ? (
        <EngageListSkeleton rows={2} />
      ) : !broadcasts.length ? (
        <EngageEmptyState
          icon={Megaphone}
          title="Nenhum disparo ainda"
          description="Um disparo alcança quem já respondeu — é o jeito de voltar a falar com quem a automação trouxe."
          action={
            <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
              <Megaphone className="h-4 w-4" aria-hidden />
              Criar o primeiro
            </Button>
          }
        />
      ) : (
        <EngagePanel>
          <div className="divide-y">
            {broadcasts.map((broadcast) => {
              const done = broadcast.sent_count + broadcast.failed_count + broadcast.skipped_count;
              const percent = broadcast.total_recipients
                ? Math.round((done / broadcast.total_recipients) * 100)
                : 0;
              const status = STATUS[broadcast.status] || STATUS.cancelled;

              return (
                <div key={broadcast.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0 flex-1 basis-64">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <p className="truncate text-[15px] font-medium tracking-[-0.011em]">
                          {broadcast.name}
                        </p>
                        {/* Mesmo padrão da aba de contatos: o ponto carrega o
                            estado, o texto fica legível. */}
                        <EngageStatus tone={status.tone} className="text-sm text-muted-foreground">
                          {status.label}
                        </EngageStatus>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[14px] tracking-[-0.009em] text-muted-foreground">
                        {broadcast.message}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {new Date(broadcast.created_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {broadcast.status === 'sending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancel(broadcast.id)}
                          className="gap-1.5"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>

                  {broadcast.status === 'sending' && (
                    <Progress
                      value={percent}
                      className="h-1.5"
                      aria-label={`${percent}% do disparo processado`}
                    />
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      <strong className="font-medium tabular-nums text-foreground">
                        {broadcast.sent_count}
                      </strong>{' '}
                      enviados
                    </span>
                    <span className="tabular-nums">{broadcast.total_recipients} na lista</span>
                    {broadcast.skipped_count > 0 && (
                      // Nomeado pelo motivo, não por "pulados": a janela ter
                      // fechado no meio do disparo é rotina, não incidente.
                      <span className="tabular-nums">
                        {broadcast.skipped_count} saíram da janela antes da vez
                      </span>
                    )}
                    {broadcast.failed_count > 0 && (
                      <span className="tabular-nums text-destructive">
                        {broadcast.failed_count} falharam
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </EngagePanel>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo disparo</DialogTitle>
            <DialogDescription>
              A lista é recalculada no servidor no momento do envio — quem sair da
              janela até lá não recebe.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {accounts.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-sm">Conta</Label>
                <Select value={accountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>@{a.ig_username || a.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* O número que decide se vale a pena disparar, mostrado antes de
                escrever qualquer coisa. */}
            <div className="rounded-xl border bg-muted/40 p-4">
              {countingAudience ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Calculando quem está alcançável…
                </div>
              ) : (
                <>
                  <p className="text-[40px] font-semibold leading-none tabular-nums tracking-[-0.028em]">
                    {(audience?.eligible || 0).toLocaleString('pt-BR')}
                  </p>
                  <p className="mt-2 text-[15px] leading-relaxed tracking-[-0.011em] text-muted-foreground">
                    de {(audience?.total || 0).toLocaleString('pt-BR')} contatos vão
                    receber — os demais estão fora da janela de 24h.
                  </p>
                </>
              )}
            </div>

            {tags.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-sm">Estreitar por etiqueta (opcional)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <EngageFilterChip
                      key={tag.id}
                      active={tagIds.includes(tag.id)}
                      onClick={() => setTagIds(tagIds.includes(tag.id)
                        ? tagIds.filter((id) => id !== tag.id)
                        : [...tagIds, tag.id])}
                    >
                      {tag.name}
                    </EngageFilterChip>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm" htmlFor="broadcast-name">Nome do disparo</Label>
              <Input
                id="broadcast-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Aviso da live de quinta"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm" htmlFor="broadcast-message">Mensagem</Label>
              <Textarea
                id="broadcast-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder="Escreva como se fosse uma conversa — é uma DM, não um e-mail."
              />
            </div>

            <div className="rounded-xl border p-3">
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="broadcast-link"
                  checked={linkEnabled}
                  onCheckedChange={(c) => setLinkEnabled(!!c)}
                  className="mt-0.5"
                />
                <Label htmlFor="broadcast-link" className="cursor-pointer text-sm font-normal">
                  Adicionar um botão de link
                </Label>
              </div>
              {linkEnabled && (
                <div className="mt-3 space-y-2 pl-6">
                  <div className="grid grid-cols-[1fr_1.4fr] gap-2">
                    <Input
                      value={linkLabel}
                      onChange={(e) => setLinkLabel(e.target.value)}
                      placeholder="Texto do botão"
                      aria-label="Texto do botão"
                    />
                    <Input
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="https://..."
                      aria-label="Endereço do link"
                    />
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    O clique é contabilizado — é o que responde “quantos abriram”.
                  </p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSend} disabled={!canSend || sending} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              Disparar para {(audience?.eligible || 0).toLocaleString('pt-BR')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
