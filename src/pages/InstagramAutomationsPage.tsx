import { useMemo, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Instagram, Plus, Pencil, Trash2, Loader2, ListChecks } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useInstagramAccounts } from '@/hooks/useInstagramAccounts';
import {
  InstagramAutomationRule,
  InstagramRuleAction,
  InstagramTriggerType,
  useDeleteInstagramAutomationRule,
  useInstagramAutomationRules,
  useInstagramRuleExecutions,
  useToggleInstagramAutomationRule,
  useUpsertInstagramAutomationRule,
} from '@/hooks/useInstagramAutomationRules';
import { InstagramDmPreview } from '@/components/instagram/InstagramDmPreview';
import { InstagramMediaPicker } from '@/components/instagram/InstagramMediaPicker';

type ActionKey = 'like_comment' | 'reply_comment_public' | 'send_dm' | 'add_tag' | 'notify_assignee';

interface RuleFormState {
  id?: string;
  name: string;
  instagramAccountId: string;
  triggerType: InstagramTriggerType;
  keywords: string;
  matchType: 'any' | 'all';
  scope: 'all_posts' | 'specific_media';
  mediaIds: string;
  enabledActions: Record<ActionKey, boolean>;
  replyText: string;
  dmText: string;
  tagName: string;
  buttonEnabled: boolean;
  buttonLabel: string;
  buttonUrl: string;
  quickReplyEnabled: boolean;
  quickReplyLabel: string;
  followupEnabled: boolean;
  followupWaitValue: string;
  followupWaitUnit: 'minutes' | 'hours' | 'days';
  followupClickedText: string;
  followupNotClickedText: string;
}

/**
 * Como cada gatilho se comporta na tela.
 *
 * `keywords` diz se o campo de palavras-chave aparece; `keywordsRequired`
 * separa o comentário (onde regra sem palavra-chave responderia a qualquer
 * comentário do perfil, o que ninguém quer) da resposta a story (onde reagir a
 * qualquer resposta é justamente o caso comum).
 */
const TRIGGERS: Record<InstagramTriggerType, {
  label: string;
  description: string;
  keywords: boolean;
  keywordsRequired: boolean;
  mediaScope: boolean;
  commentActions: boolean;
}> = {
  comment_keyword: {
    label: 'Comentário em post',
    description: 'Alguém comenta uma palavra-chave num post ou reel.',
    keywords: true,
    keywordsRequired: true,
    mediaScope: true,
    commentActions: true,
  },
  dm_keyword: {
    label: 'Mensagem no direct',
    description: 'Alguém manda uma DM contendo uma palavra-chave.',
    keywords: true,
    keywordsRequired: true,
    mediaScope: false,
    commentActions: false,
  },
  story_reply: {
    label: 'Resposta a story',
    description: 'Alguém responde um story seu. Sem palavras-chave, vale para qualquer resposta.',
    keywords: true,
    keywordsRequired: false,
    mediaScope: false,
    commentActions: false,
  },
  story_mention: {
    label: 'Menção em story',
    description: 'Alguém menciona seu perfil no story dele.',
    keywords: false,
    keywordsRequired: false,
    mediaScope: false,
    commentActions: false,
  },
  first_message: {
    label: 'Primeira mensagem',
    description: 'Boas-vindas: dispara na primeira vez que um contato escreve.',
    keywords: false,
    keywordsRequired: false,
    mediaScope: false,
    commentActions: false,
  },
};

function emptyForm(defaultAccountId?: string): RuleFormState {
  return {
    name: '',
    instagramAccountId: defaultAccountId || '',
    triggerType: 'comment_keyword',
    keywords: '',
    matchType: 'any',
    scope: 'all_posts',
    mediaIds: '',
    enabledActions: {
      like_comment: false,
      reply_comment_public: true,
      send_dm: true,
      add_tag: false,
      notify_assignee: false,
    },
    replyText: 'Obrigado pelo comentário! Te chamei no direct 😉',
    dmText: 'Oi! Vi que você comentou no nosso post. Quer receber mais informações?',
    tagName: '',
    buttonEnabled: false,
    buttonLabel: 'Ver mais',
    buttonUrl: '',
    // Ligado por padrão: é a opção que faz o contato responder e abrir a janela
    // de 24h. Só tem efeito quando há link configurado.
    quickReplyEnabled: true,
    quickReplyLabel: 'Quero sim!',
    followupEnabled: false,
    followupWaitValue: '60',
    followupWaitUnit: 'minutes',
    followupClickedText: 'Vi que você acessou o link! Ficou alguma dúvida?',
    followupNotClickedText: 'Ainda dá tempo de conferir o que te enviei 😉',
  };
}

function ruleToForm(rule: InstagramAutomationRule): RuleFormState {
  const actions = rule.actions || [];
  const find = (type: ActionKey) => actions.find((a) => a.type === type);
  return {
    id: rule.id,
    name: rule.name,
    instagramAccountId: rule.instagram_account_id,
    triggerType: rule.trigger_type || 'comment_keyword',
    keywords: (rule.trigger_config?.keywords || []).join(', '),
    matchType: rule.trigger_config?.match_type || 'any',
    scope: rule.trigger_config?.scope || 'all_posts',
    mediaIds: (rule.trigger_config?.media_ids || []).join(', '),
    enabledActions: {
      like_comment: !!find('like_comment'),
      reply_comment_public: !!find('reply_comment_public'),
      send_dm: !!find('send_dm'),
      add_tag: !!find('add_tag'),
      notify_assignee: !!find('notify_assignee'),
    },
    replyText: find('reply_comment_public')?.text || '',
    dmText: find('send_dm')?.text || '',
    tagName: find('add_tag')?.tag || '',
    buttonEnabled: !!find('send_dm')?.button,
    buttonLabel: find('send_dm')?.button?.label || 'Ver mais',
    buttonUrl: find('send_dm')?.button?.url || '',
    // Regra que já existe mantém o comportamento com que foi salva. Herdar o
    // default de criação (ligado) mudaria automações em produção sozinho.
    quickReplyEnabled: !!find('send_dm')?.quickReply?.enabled,
    quickReplyLabel: find('send_dm')?.quickReply?.label || 'Quero sim!',
    followupEnabled: !!find('send_dm')?.followup,
    followupWaitValue: String(find('send_dm')?.followup?.waitValue || 60),
    followupWaitUnit: find('send_dm')?.followup?.waitUnit || 'minutes',
    followupClickedText: find('send_dm')?.followup?.clickedText || 'Vi que você acessou o link! Ficou alguma dúvida?',
    followupNotClickedText: find('send_dm')?.followup?.notClickedText || 'Ainda dá tempo de conferir o que te enviei 😉',
  };
}

function formToPayload(form: RuleFormState) {
  const trigger = TRIGGERS[form.triggerType];
  const actions: InstagramRuleAction[] = [];
  // Curtir e responder publicamente não existem fora de um comentário. Sem
  // este filtro, trocar o gatilho de uma regra já salva deixaria as ações
  // antigas gravadas, para depois virarem 'skipped' silenciosos na execução.
  if (trigger.commentActions && form.enabledActions.like_comment) actions.push({ type: 'like_comment' });
  if (trigger.commentActions && form.enabledActions.reply_comment_public) actions.push({ type: 'reply_comment_public', text: form.replyText });
  if (form.enabledActions.send_dm) {
    actions.push({
      type: 'send_dm',
      text: form.dmText,
      button: form.buttonEnabled && form.buttonUrl.trim()
        ? { label: form.buttonLabel.trim() || 'Ver mais', url: form.buttonUrl.trim() }
        : undefined,
      // Só faz sentido com link: o quick reply é o que abre a janela de 24h
      // para o link poder ser enviado em seguida.
      quickReply: form.buttonEnabled && form.buttonUrl.trim() && form.quickReplyEnabled
        ? { enabled: true, label: form.quickReplyLabel.trim() || 'Quero sim!' }
        : undefined,
      followup: form.followupEnabled
        ? {
            waitValue: Number(form.followupWaitValue) || 60,
            waitUnit: form.followupWaitUnit,
            clickedText: form.followupClickedText,
            notClickedText: form.followupNotClickedText,
          }
        : undefined,
    });
  }
  if (form.enabledActions.add_tag && form.tagName) actions.push({ type: 'add_tag', tag: form.tagName });
  if (form.enabledActions.notify_assignee) actions.push({ type: 'notify_assignee' });

  return {
    id: form.id,
    name: form.name,
    instagram_account_id: form.instagramAccountId,
    trigger_type: form.triggerType,
    trigger_config: {
      keywords: trigger.keywords
        ? form.keywords.split(',').map((k) => k.trim()).filter(Boolean)
        : [],
      match_type: form.matchType,
      // Escopo por post só faz sentido para comentário: uma DM não vem de um
      // post. Gravar o escopo herdado confundiria a leitura da regra.
      scope: trigger.mediaScope ? form.scope : 'all_posts',
      media_ids: trigger.mediaScope && form.scope === 'specific_media'
        ? form.mediaIds.split(',').map((m) => m.trim()).filter(Boolean)
        : [],
    },
    actions,
  };
}

const STATUS_BADGE: Record<string, string> = {
  success: 'bg-green-500/10 text-green-600 border-green-500/20',
  error: 'bg-destructive/10 text-destructive border-destructive/20',
  skipped: 'bg-muted text-muted-foreground',
};

export default function InstagramAutomationsPage() {
  const { toast } = useToast();
  const { data: accounts = [] } = useInstagramAccounts();
  const { data: rules = [], isLoading } = useInstagramAutomationRules();
  const upsertRule = useUpsertInstagramAutomationRule();
  const deleteRule = useDeleteInstagramAutomationRule();
  const toggleRule = useToggleInstagramAutomationRule();
  const ruleIds = useMemo(() => rules.map((r) => r.id), [rules]);
  const { data: executions = [] } = useInstagramRuleExecutions(ruleIds);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<RuleFormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const connectedAccounts = accounts.filter((a) => a.status === 'connected');
  const ruleNameById = useMemo(() => Object.fromEntries(rules.map((r) => [r.id, r.name])), [rules]);
  const activeTrigger = TRIGGERS[form.triggerType];
  // Alimenta o preview com o @ e o avatar reais da conta escolhida.
  const selectedAccount = accounts.find((a) => a.id === form.instagramAccountId);

  const openCreateDialog = () => {
    setForm(emptyForm(connectedAccounts[0]?.id));
    setDialogOpen(true);
  };

  const openEditDialog = (rule: InstagramAutomationRule) => {
    setForm(ruleToForm(rule));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const trigger = TRIGGERS[form.triggerType];
    if (!form.name.trim() || !form.instagramAccountId) {
      toast({ title: 'Preencha o nome e a conta', variant: 'destructive' });
      return;
    }
    // Palavra-chave só é exigida onde a ausência dela seria um tiro no escuro:
    // regra de comentário sem palavra-chave responderia a todo mundo.
    if (trigger.keywordsRequired && !form.keywords.trim()) {
      toast({ title: 'Informe ao menos uma palavra-chave', variant: 'destructive' });
      return;
    }
    if (trigger.mediaScope && form.scope === 'specific_media' && !form.mediaIds.trim()) {
      toast({ title: 'Selecione ao menos um post', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await upsertRule.mutateAsync(formToPayload(form) as any);
      toast({ title: form.id ? 'Automação atualizada' : 'Automação criada' });
      setDialogOpen(false);
    } catch (error: any) {
      toast({ title: 'Erro ao salvar automação', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId: string) => {
    try {
      await deleteRule.mutateAsync(ruleId);
      toast({ title: 'Automação removida' });
    } catch (error: any) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <MainLayout
      title="Wizzy Engage"
      subtitle="Comentário com palavra-chave → curtida, resposta pública e DM, estilo ManyChat"
    >
      <Tabs defaultValue="rules" className="space-y-6">
        <TabsList className="bg-muted p-1 h-auto flex-wrap">
          <TabsTrigger value="rules" className="gap-2">
            <Instagram className="h-4 w-4" />
            Automações
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <ListChecks className="h-4 w-4" />
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          {connectedAccounts.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Conecte uma conta do Instagram em Configurações antes de criar automações.
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button onClick={openCreateDialog} disabled={connectedAccounts.length === 0} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova automação
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rules.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Nenhuma automação criada ainda.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <Card key={rule.id}>
                  <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap space-y-0">
                    <div>
                      <CardTitle className="text-base">{rule.name}</CardTitle>
                      <CardDescription>
                        Palavras: {(rule.trigger_config?.keywords || []).join(', ') || '—'} ·{' '}
                        {rule.trigger_config?.match_type === 'all' ? 'todas' : 'qualquer uma'} ·{' '}
                        {rule.trigger_config?.scope === 'specific_media' ? 'posts específicos' : 'todos os posts'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(checked) => toggleRule.mutate({ ruleId: rule.id, isActive: checked })}
                      />
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(rule)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {(rule.actions || []).map((action, idx) => (
                      <Badge key={idx} variant="secondary">{action.type}</Badge>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Automação</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Passos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Nenhuma execução registrada ainda.
                      </TableCell>
                    </TableRow>
                  )}
                  {executions.map((execution) => (
                    <TableRow key={execution.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {new Date(execution.created_at).toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell>{ruleNameById[execution.rule_id] || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_BADGE[execution.status]}>
                          {execution.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {(execution.steps || []).map((s) => `${s.type}:${s.status}`).join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar automação' : 'Nova automação'}</DialogTitle>
            <DialogDescription>{activeTrigger.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Captar lead do post de lançamento" />
            </div>

            <div className="space-y-2">
              <Label>Conta do Instagram</Label>
              <Select value={form.instagramAccountId} onValueChange={(v) => setForm({ ...form, instagramAccountId: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>
                  {connectedAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>@{account.ig_username || account.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Quando isto acontecer</Label>
              <Select
                value={form.triggerType}
                onValueChange={(v: InstagramTriggerType) => setForm({ ...form, triggerType: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TRIGGERS) as InstagramTriggerType[]).map((key) => (
                    <SelectItem key={key} value={key}>{TRIGGERS[key].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{activeTrigger.description}</p>
            </div>

            {activeTrigger.keywords && (
              <div className="space-y-2">
                <Label>
                  Palavras-chave (separadas por vírgula)
                  {!activeTrigger.keywordsRequired && (
                    <span className="ml-1 font-normal text-muted-foreground">— opcional</span>
                  )}
                </Label>
                <Input
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  placeholder={activeTrigger.keywordsRequired ? 'quero, informações, preço' : 'deixe vazio para qualquer resposta'}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {activeTrigger.keywords && (
                <div className="space-y-2">
                  <Label>Corresponder a</Label>
                  <Select value={form.matchType} onValueChange={(v: 'any' | 'all') => setForm({ ...form, matchType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer palavra</SelectItem>
                      <SelectItem value="all">Todas as palavras</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {activeTrigger.mediaScope && (
                <div className="space-y-2">
                  <Label>Escopo</Label>
                  <Select value={form.scope} onValueChange={(v: 'all_posts' | 'specific_media') => setForm({ ...form, scope: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_posts">Todos os posts</SelectItem>
                      <SelectItem value="specific_media">Posts específicos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {activeTrigger.mediaScope && form.scope === 'specific_media' && (
              <div className="space-y-2">
                <Label>Em quais posts</Label>
                {form.instagramAccountId ? (
                  <InstagramMediaPicker
                    accountId={form.instagramAccountId}
                    value={form.mediaIds.split(',').map((m) => m.trim()).filter(Boolean)}
                    onChange={(ids) => setForm({ ...form, mediaIds: ids.join(', ') })}
                  />
                ) : (
                  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    Selecione uma conta para escolher os posts.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3 border-t pt-4">
              <Label className="text-sm font-semibold">Ações</Label>

              {activeTrigger.commentActions && (
                <>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={form.enabledActions.like_comment}
                      onCheckedChange={(c) => setForm({ ...form, enabledActions: { ...form.enabledActions, like_comment: !!c } })}
                    />
                    <Label className="font-normal text-sm">
                      Curtir o comentário <span className="text-muted-foreground">(beta — pode não ser suportado pela API)</span>
                    </Label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={form.enabledActions.reply_comment_public}
                        onCheckedChange={(c) => setForm({ ...form, enabledActions: { ...form.enabledActions, reply_comment_public: !!c } })}
                      />
                      <Label className="font-normal text-sm">Responder o comentário publicamente</Label>
                    </div>
                    {form.enabledActions.reply_comment_public && (
                      <Textarea
                        value={form.replyText}
                        onChange={(e) => setForm({ ...form, replyText: e.target.value })}
                        placeholder="Use {{username}} para citar o autor"
                        rows={2}
                      />
                    )}
                  </div>
                </>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={form.enabledActions.send_dm}
                    onCheckedChange={(c) => setForm({ ...form, enabledActions: { ...form.enabledActions, send_dm: !!c } })}
                  />
                  <Label className="font-normal text-sm">Enviar DM privada</Label>
                </div>
                {form.enabledActions.send_dm && (
                  <>
                    <Textarea
                      value={form.dmText}
                      onChange={(e) => setForm({ ...form, dmText: e.target.value })}
                      placeholder="Use {{username}} para citar o autor"
                      rows={2}
                    />

                    <div className="ml-6 space-y-2 border-l-2 border-muted pl-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={form.buttonEnabled}
                          onCheckedChange={(c) => setForm({ ...form, buttonEnabled: !!c })}
                        />
                        <Label className="font-normal text-sm">Adicionar botão de link na DM</Label>
                      </div>
                      {form.buttonEnabled && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              value={form.buttonLabel}
                              onChange={(e) => setForm({ ...form, buttonLabel: e.target.value })}
                              placeholder="Texto do botão"
                            />
                            <Input
                              value={form.buttonUrl}
                              onChange={(e) => setForm({ ...form, buttonUrl: e.target.value })}
                              placeholder="https://..."
                            />
                          </div>

                          <div className="rounded-md bg-muted/50 p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={form.quickReplyEnabled}
                                onCheckedChange={(c) => setForm({ ...form, quickReplyEnabled: !!c })}
                              />
                              <Label className="font-normal text-sm">
                                Pedir confirmação antes de mandar o link (recomendado)
                              </Label>
                            </div>
                            {form.quickReplyEnabled ? (
                              <>
                                <Input
                                  value={form.quickReplyLabel}
                                  onChange={(e) => setForm({ ...form, quickReplyLabel: e.target.value })}
                                  placeholder="Texto do botão de resposta"
                                  maxLength={20}
                                />
                                <p className="text-xs text-muted-foreground">
                                  A DM chega com um botão de resposta rápida. Ao tocar, o contato
                                  responde de verdade — e é isso que libera o envio do link e das
                                  mensagens de acompanhamento pelas 24h seguintes.
                                </p>
                              </>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Sem confirmação, o link vai direto no botão. Clicar nele abre o
                                navegador, mas <strong>não</strong> conta como resposta: o Instagram
                                mantém a conversa fechada e as mensagens de acompanhamento não serão
                                entregues a quem não responder.
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <Checkbox
                          checked={form.followupEnabled}
                          onCheckedChange={(c) => setForm({ ...form, followupEnabled: !!c })}
                        />
                        <Label className="font-normal text-sm">Enviar mensagem de acompanhamento depois</Label>
                      </div>
                      {form.followupEnabled && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">Esperar</Label>
                            <Input
                              type="number"
                              min={1}
                              className="w-20"
                              value={form.followupWaitValue}
                              onChange={(e) => setForm({ ...form, followupWaitValue: e.target.value })}
                            />
                            <Select value={form.followupWaitUnit} onValueChange={(v: 'minutes' | 'hours' | 'days') => setForm({ ...form, followupWaitUnit: v })}>
                              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="minutes">Minutos</SelectItem>
                                <SelectItem value="hours">Horas</SelectItem>
                                <SelectItem value="days">Dias</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Se a pessoa clicou no link</Label>
                            <Textarea
                              value={form.followupClickedText}
                              onChange={(e) => setForm({ ...form, followupClickedText: e.target.value })}
                              rows={2}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Se a pessoa não clicou</Label>
                            <Textarea
                              value={form.followupNotClickedText}
                              onChange={(e) => setForm({ ...form, followupNotClickedText: e.target.value })}
                              rows={2}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <InstagramDmPreview
                      text={form.dmText}
                      accountUsername={selectedAccount?.ig_username}
                      accountAvatarUrl={selectedAccount?.ig_profile_pic_url}
                      button={form.buttonEnabled && form.buttonUrl.trim()
                        ? { label: form.buttonLabel, url: form.buttonUrl }
                        : null}
                      quickReply={form.buttonEnabled && form.buttonUrl.trim() && form.quickReplyEnabled
                        ? { label: form.quickReplyLabel }
                        : null}
                      // Mostra o caminho "não clicou", que é o que a maioria
                      // recebe — e o que revela se a janela de 24h vai barrar.
                      followupText={form.followupEnabled ? form.followupNotClickedText : null}
                    />
                  </>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={form.enabledActions.add_tag}
                    onCheckedChange={(c) => setForm({ ...form, enabledActions: { ...form.enabledActions, add_tag: !!c } })}
                  />
                  <Label className="font-normal text-sm">Adicionar tag ao contato</Label>
                </div>
                {form.enabledActions.add_tag && (
                  <Input value={form.tagName} onChange={(e) => setForm({ ...form, tagName: e.target.value })} placeholder="lead-instagram" />
                )}
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.enabledActions.notify_assignee}
                  disabled
                  onCheckedChange={(c) => setForm({ ...form, enabledActions: { ...form.enabledActions, notify_assignee: !!c } })}
                />
                <Label className="font-normal text-sm text-muted-foreground">Notificar responsável (em breve)</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
