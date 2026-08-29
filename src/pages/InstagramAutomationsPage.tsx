import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  AtSign,
  Check,
  CornerUpLeft,
  Home,
  Instagram,
  ListChecks,
  Megaphone,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useInstagramAccounts, type InstagramAccount } from '@/hooks/useInstagramAccounts';
import { useInstagramContactCount } from '@/hooks/useInstagramContacts';
import {
  InstagramAutomationRule,
  useDeleteInstagramAutomationRule,
  useInstagramAutomationRules,
  useInstagramRuleExecutions,
  useToggleInstagramAutomationRule,
  useUpsertInstagramAutomationRule,
} from '@/hooks/useInstagramAutomationRules';
import { InstagramFlowsTab } from '@/components/instagram/flow/InstagramFlowsTab';
import { InstagramContactsTab } from '@/components/instagram/InstagramContactsTab';
import { InstagramBroadcastTab } from '@/components/instagram/InstagramBroadcastTab';
import { InstagramTemplateGallery } from '@/components/instagram/templates/InstagramTemplateGallery';
import { InstagramGuidedEditor } from '@/components/instagram/templates/InstagramGuidedEditor';
import {
  EngageEmptyState,
  EngageLede,
  EngageListSkeleton,
  EngageNotConnected,
  EngagePanel,
  EngageStatus,
  EngageTableSkeleton,
  EngageToolbar,
  type EngageTone,
} from '@/components/instagram/EngageUI';
import {
  BLANK_TEMPLATE,
  guidedFromRule,
  guidedFromTemplate,
  guidedToPayload,
  templateById,
  validateGuided,
  type GuidedState,
  type InstagramTemplate,
} from '@/components/instagram/templates/instagramTemplates';

/**
 * Wizzy Engage.
 *
 * A tela abre em "Início" — modelos prontos — e não na lista de automações. A
 * inversão é deliberada: a lista é útil para quem já tem automações rodando,
 * mas é uma tela vazia para todo cliente novo, e automação é justamente o
 * assunto em que ninguém sabe o que pedir antes de ver um exemplo.
 *
 * Acima das abas fica a faixa da conta. Cinco das seis abas dependem de uma
 * conta conectada, e o estado dela era invisível fora de Configurações: quando
 * o token vencia, a automação parava e a tela continuava dizendo que estava
 * tudo certo. A faixa é o lugar onde "parou de funcionar" aparece.
 */

const TRIGGER_LABELS: Record<string, string> = {
  comment_keyword: 'Comentário',
  dm_keyword: 'Direct',
  story_reply: 'Resposta a story',
  story_mention: 'Menção em story',
  first_message: 'Primeira mensagem',
};

const TRIGGER_ICONS: Record<string, typeof MessageSquare> = {
  comment_keyword: MessageSquare,
  dm_keyword: Send,
  story_reply: CornerUpLeft,
  story_mention: AtSign,
  first_message: Sparkles,
};

/** O estado da conta, traduzido para o que ele significa para a automação. */
const ACCOUNT_STATE: Record<string, { tone: EngageTone; label: string }> = {
  connected: { tone: 'ok', label: 'conectada' },
  pending: { tone: 'warn', label: 'conexão incompleta' },
  disconnected: { tone: 'idle', label: 'desconectada' },
  error: { tone: 'error', label: 'acesso recusado' },
  expired: { tone: 'error', label: 'acesso vencido' },
};

/**
 * Os passos da execução em português.
 *
 * A tabela de logs mostrava `send_dm:success` — o nome interno da ação e o
 * enum do banco, colados por dois-pontos. Quem abre os logs está tentando
 * entender por que uma pessoa não recebeu a mensagem, e recebia o dump.
 */
const STEP_LABELS: Record<string, string> = {
  like_comment: 'curtiu o comentário',
  reply_comment_public: 'respondeu no post',
  send_dm: 'enviou a DM',
  create_contact: 'criou o contato',
  add_tag: 'etiquetou',
  notify_assignee: 'avisou o time',
  collect: 'pediu o e-mail',
  followup: 'agendou o lembrete',
};

const EXECUTION_STATE: Record<string, { tone: EngageTone; label: string }> = {
  success: { tone: 'ok', label: 'entregue' },
  error: { tone: 'error', label: 'falhou' },
  skipped: { tone: 'idle', label: 'ignorada' },
};

/** Resumo em uma linha do que a automação faz, para a lista. */
function describeRule(rule: InstagramAutomationRule): string {
  const config = rule.trigger_config || ({} as InstagramAutomationRule['trigger_config']);
  const parts: string[] = [];

  if (config.keyword_mode === 'any') parts.push('qualquer palavra');
  else if ((config.keywords || []).length) parts.push(`"${(config.keywords || []).join('", "')}"`);

  if (rule.trigger_type === 'comment_keyword') {
    parts.push(
      config.scope === 'specific_media'
        ? `${(config.media_ids || []).length} publicação(ões)`
        : config.scope === 'next_post'
          // O vínculo é o que separa "esperando você publicar" de "já valendo" —
          // sem dizer isso, a automação parece quebrada nos primeiros minutos.
          ? (config.next_post_bound_at ? 'próxima publicação (já vinculada)' : 'aguardando a próxima publicação')
          : 'todas as publicações',
    );
  }

  const dm = (rule.actions || []).find((a) => a.type === 'send_dm');
  if (dm?.collect) parts.push('pede e-mail');
  if (dm?.button?.url) parts.push('entrega link');
  if (dm?.followup) parts.push('com lembrete');

  return parts.join(' · ') || 'sem configuração';
}

/** Data curta: os logs são lidos em sequência, e o ano é ruído em todas as linhas. */
function shortDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * A faixa da conta, acima das abas.
 *
 * Foto, @ e estado — e, quando o estado não é "conectada", o atalho para
 * resolver. A contagem de contatos fica do lado direito porque é o número que
 * dá escala ao módulo inteiro: automação sem público é enfeite.
 */
function AccountStrip({
  accounts,
  contactCount,
}: {
  accounts: InstagramAccount[];
  contactCount: number;
}) {
  const navigate = useNavigate();
  const broken = accounts.find((a) => a.status !== 'connected');
  const primary = accounts.find((a) => a.status === 'connected') || accounts[0];
  const state = ACCOUNT_STATE[primary.status] || ACCOUNT_STATE.disconnected;
  const others = accounts.length - 1;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border bg-card px-5 py-4">
      {primary.ig_profile_pic_url ? (
        <img
          src={primary.ig_profile_pic_url}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 text-white">
          <Instagram className="h-4 w-4" aria-hidden />
        </span>
      )}

      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium tracking-[-0.011em]">
          @{primary.ig_username || primary.label || 'conta do Instagram'}
          {others > 0 && (
            <span className="ml-1.5 font-normal text-muted-foreground">
              +{others} {others === 1 ? 'conta' : 'contas'}
            </span>
          )}
        </p>
        <EngageStatus tone={state.tone} className="text-xs">
          {state.label}
        </EngageStatus>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[15px] tracking-[-0.011em] text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">
            {contactCount.toLocaleString('pt-BR')}
          </span>{' '}
          {contactCount === 1 ? 'contato' : 'contatos'}
        </p>
        <Button
          variant={broken ? 'default' : 'ghost'}
          size="sm"
          onClick={() => navigate('/settings?tab=instagram')}
        >
          {broken ? 'Reconectar' : 'Gerenciar contas'}
        </Button>
      </div>
    </div>
  );
}

/** Contador ao lado do nome da aba. Zero não vira selo: nada a contar, nada a mostrar. */
function TabCount({ value }: { value: number }) {
  if (!value) return null;
  return (
    <span className="rounded-full bg-foreground/10 px-1.5 text-[12px] font-medium leading-5 tabular-nums">
      {value}
    </span>
  );
}

export default function InstagramAutomationsPage() {
  const { toast } = useToast();
  const { data: accounts = [] } = useInstagramAccounts();
  const { data: rules = [], isLoading } = useInstagramAutomationRules();
  const { data: contactCount = 0 } = useInstagramContactCount();
  const upsertRule = useUpsertInstagramAutomationRule();
  const deleteRule = useDeleteInstagramAutomationRule();
  const toggleRule = useToggleInstagramAutomationRule();
  const ruleIds = useMemo(() => rules.map((r) => r.id), [rules]);
  const { data: executions = [], isLoading: loadingExecutions } = useInstagramRuleExecutions(ruleIds);

  const [tab, setTab] = useState('home');
  const [editorOpen, setEditorOpen] = useState(false);
  const [guided, setGuided] = useState<GuidedState | null>(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<InstagramAutomationRule | null>(null);

  const connectedAccounts = accounts.filter((a) => a.status === 'connected');
  const activeRules = rules.filter((r) => r.is_active).length;
  const ruleNameById = useMemo(() => Object.fromEntries(rules.map((r) => [r.id, r.name])), [rules]);

  /** Quantas vezes cada automação já rodou — o sinal de que ela está viva. */
  const runsByRule = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const execution of executions) {
      counts[execution.rule_id] = (counts[execution.rule_id] || 0) + 1;
    }
    return counts;
  }, [executions]);

  const openTemplate = (template: InstagramTemplate) => {
    if (!connectedAccounts.length) {
      toast({
        title: 'Conecte uma conta do Instagram',
        description: 'Vá em Configurações → Instagram para conectar antes de criar automações.',
        variant: 'destructive',
      });
      return;
    }
    setGuided(guidedFromTemplate(template, connectedAccounts[0].id));
    setTemplateTitle(template.title);
    setEditorOpen(true);
  };

  const openRule = (rule: InstagramAutomationRule) => {
    setGuided(guidedFromRule(rule));
    setTemplateTitle('Editando uma automação existente');
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!guided) return;
    // Mesma checagem que desabilita o botão. Repetida aqui porque o estado pode
    // ter mudado entre o render e o clique (troca de conta, por exemplo).
    const error = validateGuided(guided);
    if (error) {
      toast({ title: error, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await upsertRule.mutateAsync(guidedToPayload(guided) as any);
      toast({ title: guided.id ? 'Automação atualizada' : 'Automação ativada' });
      setEditorOpen(false);
      // Depois de criar, mostrar a lista: é onde a pessoa confirma que a
      // automação existe e está ligada.
      setTab('rules');
    } catch (err: any) {
      toast({ title: 'Erro ao salvar automação', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteRule.mutateAsync(pendingDelete.id);
      toast({ title: 'Automação removida' });
    } catch (err: any) {
      toast({ title: 'Erro ao remover', description: err.message, variant: 'destructive' });
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <MainLayout
      title="Wizzy Engage"
      subtitle="Automações de Instagram: comentário, direct, story e menção"
    >
      <div className="space-y-6">
        {accounts.length > 0 && (
          <AccountStrip accounts={accounts} contactCount={contactCount} />
        )}

        <Tabs value={tab} onValueChange={setTab} className="space-y-8">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-muted/70 p-1">
            <TabsTrigger value="home" className="gap-2 rounded-lg px-3 py-2">
              <Home className="h-4 w-4" aria-hidden />
              Início
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-2 rounded-lg px-3 py-2">
              <Instagram className="h-4 w-4" aria-hidden />
              Automações
              <TabCount value={rules.length} />
            </TabsTrigger>
            <TabsTrigger value="flows" className="gap-2 rounded-lg px-3 py-2">
              <Workflow className="h-4 w-4" aria-hidden />
              Fluxos
            </TabsTrigger>
            <TabsTrigger value="contacts" className="gap-2 rounded-lg px-3 py-2">
              <Users className="h-4 w-4" aria-hidden />
              Contatos
              <TabCount value={contactCount} />
            </TabsTrigger>
            <TabsTrigger value="broadcast" className="gap-2 rounded-lg px-3 py-2">
              <Megaphone className="h-4 w-4" aria-hidden />
              Disparos
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2 rounded-lg px-3 py-2">
              <ListChecks className="h-4 w-4" aria-hidden />
              Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="home" className="mt-0">
            <InstagramTemplateGallery
              connectedAccounts={connectedAccounts.length}
              onPick={openTemplate}
              onOpenFlows={() => setTab('flows')}
            />
          </TabsContent>

          <TabsContent value="flows" className="mt-0">
            <InstagramFlowsTab connectedAccounts={connectedAccounts.length} />
          </TabsContent>

          <TabsContent value="contacts" className="mt-0">
            <InstagramContactsTab connectedAccounts={connectedAccounts.length} />
          </TabsContent>

          <TabsContent value="broadcast" className="mt-0">
            <InstagramBroadcastTab accounts={connectedAccounts} />
          </TabsContent>

          {/* ── Automações ─────────────────────────────────────────────── */}
          <TabsContent value="rules" className="mt-0 space-y-5">
            {connectedAccounts.length === 0 ? (
              <EngageNotConnected purpose="As automações respondem a comentários, directs e stories da sua conta." />
            ) : (
              <EngageToolbar>
                <p className="text-[15px] tracking-[-0.011em] text-muted-foreground">
                  {rules.length
                    ? `${rules.length} ${rules.length === 1 ? 'automação' : 'automações'} · ${activeRules} ${activeRules === 1 ? 'ligada' : 'ligadas'}`
                    : 'Nenhuma automação ainda'}
                </p>
                <Button onClick={() => openTemplate(BLANK_TEMPLATE)} className="gap-2">
                  <Plus className="h-4 w-4" aria-hidden />
                  Nova automação
                </Button>
              </EngageToolbar>
            )}

            {isLoading ? (
              <EngageListSkeleton rows={3} />
            ) : rules.length === 0 ? (
              connectedAccounts.length > 0 && (
                <EngageEmptyState
                  icon={Instagram}
                  title="Nenhuma automação criada ainda"
                  description="Os modelos prontos mostram a conversa que cada um produz — é o caminho mais curto para a primeira."
                  action={
                    <Button variant="outline" onClick={() => setTab('home')}>
                      Ver os modelos prontos
                    </Button>
                  }
                />
              )
            ) : (
              <EngagePanel>
                <div className="divide-y">
                  {rules.map((rule) => {
                    const Icon = TRIGGER_ICONS[rule.trigger_type] || MessageSquare;
                    const runs = runsByRule[rule.id] || 0;

                    return (
                      <div
                        key={rule.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4 transition-colors duration-150 hover:bg-muted/40"
                      >
                        {/* O quadrado do gatilho tinge só quando a automação
                            está ligada: a lista inteira colorida não diz qual
                            delas está de fato rodando. */}
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150',
                            rule.is_active
                              ? 'border-primary/30 bg-primary/10 text-primary'
                              : 'bg-muted/60 text-muted-foreground',
                          )}
                        >
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>

                        <div className="min-w-0 flex-1 basis-64">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="truncate text-[15px] font-medium tracking-[-0.011em]">
                              {rule.name}
                            </p>
                            <Badge variant="outline" className="font-normal">
                              {TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type}
                            </Badge>
                          </div>
                          <p className="mt-0.5 truncate text-[14px] tracking-[-0.009em] text-muted-foreground">
                            {describeRule(rule)}
                          </p>
                        </div>

                        <p className="shrink-0 text-[13px] tabular-nums tracking-[-0.006em] text-muted-foreground">
                          {runs
                            ? `${runs} ${runs === 1 ? 'disparo' : 'disparos'}`
                            : 'ainda não disparou'}
                        </p>

                        <div className="flex shrink-0 items-center gap-1">
                          <Switch
                            checked={rule.is_active}
                            aria-label={rule.is_active ? 'Pausar automação' : 'Ligar automação'}
                            onCheckedChange={(checked) =>
                              toggleRule.mutate({ ruleId: rule.id, isActive: checked })
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openRule(rule)}
                            aria-label={`Editar ${rule.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setPendingDelete(rule)}
                            aria-label={`Remover ${rule.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </EngagePanel>
            )}
          </TabsContent>

          {/* ── Logs ───────────────────────────────────────────────────── */}
          <TabsContent value="logs" className="mt-0 space-y-5">
            <EngageLede className="max-w-[64ch]">
              Cada linha é uma vez em que um gatilho aconteceu, com o que a
              automação fez em seguida. É onde se descobre por que alguém não
              recebeu a mensagem.
            </EngageLede>

            {loadingExecutions && ruleIds.length > 0 ? (
              <EngageTableSkeleton columns={4} rows={6} />
            ) : executions.length === 0 ? (
              <EngageEmptyState
                icon={ListChecks}
                title="Nenhuma execução registrada"
                description={
                  rules.length
                    ? 'As execuções aparecem aqui na primeira vez que alguém comentar, responder um story ou mandar uma mensagem.'
                    : 'Ative uma automação e as execuções passam a ser registradas aqui.'
                }
                action={
                  rules.length ? undefined : (
                    <Button variant="outline" onClick={() => setTab('home')}>
                      Ver os modelos prontos
                    </Button>
                  )
                }
              />
            ) : (
              <EngagePanel>
                {/* Lista, não tabela: o passo a passo de cada execução tem
                    altura variável, e uma célula de tabela que quebra em três
                    linhas desalinha todas as colunas da linha. */}
                <div className="divide-y">
                  {executions.map((execution) => {
                    const state = EXECUTION_STATE[execution.status] || EXECUTION_STATE.skipped;

                    return (
                      <div
                        key={execution.id}
                        className="flex flex-wrap items-start gap-x-4 gap-y-2 p-4 transition-colors duration-150 hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1 basis-56">
                          <p className="truncate text-[15px] font-medium tracking-[-0.011em]">
                            {ruleNameById[execution.rule_id] || 'Automação removida'}
                          </p>
                          <p className="mt-0.5 text-[13px] tabular-nums tracking-[-0.006em] text-muted-foreground">
                            {shortDateTime(execution.created_at)}
                          </p>
                        </div>

                        <EngageStatus tone={state.tone} className="shrink-0 text-sm">
                          {state.label}
                        </EngageStatus>

                        <div className="flex basis-full flex-wrap gap-1.5 sm:basis-auto sm:flex-[2]">
                          {(execution.steps || []).map((step, index) => (
                            <span
                              key={`${step.type}-${index}`}
                              title={step.detail}
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] tracking-[-0.01em]',
                                step.status === 'success'
                                  ? 'border-border text-muted-foreground'
                                  : 'border-destructive/30 text-destructive',
                              )}
                            >
                              {step.status === 'success' ? (
                                <Check className="h-3 w-3" aria-hidden />
                              ) : (
                                <X className="h-3 w-3" aria-hidden />
                              )}
                              {STEP_LABELS[step.type] || step.type}
                            </span>
                          ))}
                          {execution.error && (
                            <span className="text-[12px] leading-5 tracking-[-0.01em] text-destructive">
                              {execution.error}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </EngagePanel>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {guided && (
        <InstagramGuidedEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          state={guided}
          onChange={setGuided}
          accounts={connectedAccounts}
          templateTitle={templateTitle || templateById(guided.templateId).title}
          saving={saving}
          onSave={handleSave}
        />
      )}

      {/* Remover uma automação ligada apaga um atendimento que está rodando
          agora. O clique direto no ícone de lixeira não pedia confirmação. */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.is_active
                ? 'Ela está ligada agora: quem comentar ou escrever depois disso não recebe mais resposta automática. O histórico de execuções permanece.'
                : 'O histórico de execuções permanece, mas a automação não pode ser recuperada.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
