import { useMemo, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Home,
  Instagram,
  ListChecks,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
  Users,
  Workflow,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useInstagramAccounts } from '@/hooks/useInstagramAccounts';
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
 */

const TRIGGER_LABELS: Record<string, string> = {
  comment_keyword: 'Comentário',
  dm_keyword: 'Direct',
  story_reply: 'Resposta a story',
  story_mention: 'Menção em story',
  first_message: 'Primeira mensagem',
};

const STATUS_BADGE: Record<string, string> = {
  success: 'bg-green-500/10 text-green-600 border-green-500/20',
  error: 'bg-destructive/10 text-destructive border-destructive/20',
  skipped: 'bg-muted text-muted-foreground',
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

export default function InstagramAutomationsPage() {
  const { toast } = useToast();
  const { data: accounts = [] } = useInstagramAccounts();
  const { data: rules = [], isLoading } = useInstagramAutomationRules();
  const upsertRule = useUpsertInstagramAutomationRule();
  const deleteRule = useDeleteInstagramAutomationRule();
  const toggleRule = useToggleInstagramAutomationRule();
  const ruleIds = useMemo(() => rules.map((r) => r.id), [rules]);
  const { data: executions = [] } = useInstagramRuleExecutions(ruleIds);

  const [tab, setTab] = useState('home');
  const [editorOpen, setEditorOpen] = useState(false);
  const [guided, setGuided] = useState<GuidedState | null>(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const connectedAccounts = accounts.filter((a) => a.status === 'connected');
  const ruleNameById = useMemo(() => Object.fromEntries(rules.map((r) => [r.id, r.name])), [rules]);

  const openTemplate = (template: InstagramTemplate) => {
    if (!connectedAccounts.length) {
      toast({
        title: 'Conecte uma conta do Instagram',
        description: 'Vá em Configurações → Integrações para conectar antes de criar automações.',
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

  const handleDelete = async (ruleId: string) => {
    try {
      await deleteRule.mutateAsync(ruleId);
      toast({ title: 'Automação removida' });
    } catch (err: any) {
      toast({ title: 'Erro ao remover', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <MainLayout
      title="Wizzy Engage"
      subtitle="Automações de Instagram: comentário, direct, story e menção"
    >
      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="bg-muted p-1 h-auto flex-wrap">
          <TabsTrigger value="home" className="gap-2">
            <Home className="h-4 w-4" />
            Início
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2">
            <Instagram className="h-4 w-4" />
            Automações
          </TabsTrigger>
          <TabsTrigger value="flows" className="gap-2">
            <Workflow className="h-4 w-4" />
            Fluxos
          </TabsTrigger>
          <TabsTrigger value="contacts" className="gap-2">
            <Users className="h-4 w-4" />
            Contatos
          </TabsTrigger>
          <TabsTrigger value="broadcast" className="gap-2">
            <Megaphone className="h-4 w-4" />
            Disparos
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <ListChecks className="h-4 w-4" />
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="home">
          <InstagramTemplateGallery
            connectedAccounts={connectedAccounts.length}
            onPick={openTemplate}
            onOpenFlows={() => setTab('flows')}
          />
        </TabsContent>

        <TabsContent value="flows" className="space-y-4">
          <InstagramFlowsTab connectedAccounts={connectedAccounts.length} />
        </TabsContent>

        <TabsContent value="contacts">
          <InstagramContactsTab connectedAccounts={connectedAccounts.length} />
        </TabsContent>

        <TabsContent value="broadcast">
          <InstagramBroadcastTab accounts={connectedAccounts} />
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          {connectedAccounts.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Conecte uma conta do Instagram em Configurações antes de criar automações.
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => openTemplate(BLANK_TEMPLATE)}
              disabled={connectedAccounts.length === 0}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Nova automação
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rules.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <p className="text-sm text-muted-foreground">Nenhuma automação criada ainda.</p>
                <Button variant="outline" onClick={() => setTab('home')}>
                  Ver os modelos prontos
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <Card key={rule.id}>
                  <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap space-y-0">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        {rule.name}
                        <Badge variant="outline" className="font-normal">
                          {TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type}
                        </Badge>
                      </CardTitle>
                      <CardDescription>{describeRule(rule)}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(checked) => toggleRule.mutate({ ruleId: rule.id, isActive: checked })}
                      />
                      <Button variant="ghost" size="icon" onClick={() => openRule(rule)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)} aria-label="Remover">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
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
    </MainLayout>
  );
}
