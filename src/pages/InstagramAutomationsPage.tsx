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
  useDeleteInstagramAutomationRule,
  useInstagramAutomationRules,
  useInstagramRuleExecutions,
  useToggleInstagramAutomationRule,
  useUpsertInstagramAutomationRule,
} from '@/hooks/useInstagramAutomationRules';

type ActionKey = 'like_comment' | 'reply_comment_public' | 'send_dm' | 'add_tag' | 'notify_assignee';

interface RuleFormState {
  id?: string;
  name: string;
  instagramAccountId: string;
  keywords: string;
  matchType: 'any' | 'all';
  scope: 'all_posts' | 'specific_media';
  mediaIds: string;
  enabledActions: Record<ActionKey, boolean>;
  replyText: string;
  dmText: string;
  tagName: string;
}

function emptyForm(defaultAccountId?: string): RuleFormState {
  return {
    name: '',
    instagramAccountId: defaultAccountId || '',
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
  };
}

function ruleToForm(rule: InstagramAutomationRule): RuleFormState {
  const actions = rule.actions || [];
  const find = (type: ActionKey) => actions.find((a) => a.type === type);
  return {
    id: rule.id,
    name: rule.name,
    instagramAccountId: rule.instagram_account_id,
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
  };
}

function formToPayload(form: RuleFormState) {
  const actions: InstagramRuleAction[] = [];
  if (form.enabledActions.like_comment) actions.push({ type: 'like_comment' });
  if (form.enabledActions.reply_comment_public) actions.push({ type: 'reply_comment_public', text: form.replyText });
  if (form.enabledActions.send_dm) actions.push({ type: 'send_dm', text: form.dmText });
  if (form.enabledActions.add_tag && form.tagName) actions.push({ type: 'add_tag', tag: form.tagName });
  if (form.enabledActions.notify_assignee) actions.push({ type: 'notify_assignee' });

  return {
    id: form.id,
    name: form.name,
    instagram_account_id: form.instagramAccountId,
    trigger_type: 'comment_keyword' as const,
    trigger_config: {
      keywords: form.keywords.split(',').map((k) => k.trim()).filter(Boolean),
      match_type: form.matchType,
      scope: form.scope,
      media_ids: form.mediaIds.split(',').map((m) => m.trim()).filter(Boolean),
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

  const openCreateDialog = () => {
    setForm(emptyForm(connectedAccounts[0]?.id));
    setDialogOpen(true);
  };

  const openEditDialog = (rule: InstagramAutomationRule) => {
    setForm(ruleToForm(rule));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.instagramAccountId || !form.keywords.trim()) {
      toast({ title: 'Preencha nome, conta e ao menos uma palavra-chave', variant: 'destructive' });
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
            <DialogDescription>Comentário com palavra-chave → curtir, responder e enviar DM</DialogDescription>
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
              <Label>Palavras-chave (separadas por vírgula)</Label>
              <Input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="quero, informações, preço" />
            </div>

            <div className="grid grid-cols-2 gap-3">
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
            </div>

            {form.scope === 'specific_media' && (
              <div className="space-y-2">
                <Label>IDs dos posts/reels (separados por vírgula)</Label>
                <Input value={form.mediaIds} onChange={(e) => setForm({ ...form, mediaIds: e.target.value })} placeholder="17900000000000000" />
              </div>
            )}

            <div className="space-y-3 border-t pt-4">
              <Label className="text-sm font-semibold">Ações</Label>

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

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={form.enabledActions.send_dm}
                    onCheckedChange={(c) => setForm({ ...form, enabledActions: { ...form.enabledActions, send_dm: !!c } })}
                  />
                  <Label className="font-normal text-sm">Enviar DM privada</Label>
                </div>
                {form.enabledActions.send_dm && (
                  <Textarea
                    value={form.dmText}
                    onChange={(e) => setForm({ ...form, dmText: e.target.value })}
                    placeholder="Use {{username}} para citar o autor"
                    rows={2}
                  />
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
