import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Scale, Building2, Zap } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Briefcase, ListTodo, Calendar, Settings } from 'lucide-react';
import {
  useCaseTemplates,
  useCaseTemplateTasks,
  useCreateCaseTemplate,
  useDeleteCaseTemplate,
  useCreateTemplateTask,
  useDeleteTemplateTask,
  useCaseTriggers,
  useCreateCaseTrigger,
  useDeleteCaseTrigger,
} from '@/hooks/useCaseTemplates';
import { TemplateSummaryEditor } from '@/components/operations/TemplateSummaryEditor';
import { CaseStatusManager } from '@/components/operations/CaseStatusManager';
import { useCaseCategories } from '@/hooks/useOperationsCases';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { usePipelines, usePipelineColumns } from '@/hooks/usePipelines';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function CaseTemplatesPage() {
  const location = useLocation();
  const { data: templates = [] } = useCaseTemplates();
  const { data: categories = [] } = useCaseCategories();
  const { data: team = [] } = useTeamMembers();
  const createTpl = useCreateCaseTemplate();
  const delTpl = useDeleteCaseTemplate();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = templates.find((t: any) => t.id === selectedId);
  const { data: tplTasks = [] } = useCaseTemplateTasks(selectedId);
  const createTask = useCreateTemplateTask();
  const delTask = useDeleteTemplateTask();

  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'judicial' | 'administrative'>('judicial');
  const [categoryId, setCategoryId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDays, setTaskDays] = useState(7);

  const tabs = [
    { href: '/operations', label: 'Casos', icon: Briefcase },
    { href: '/operations/tasks', label: 'Minhas Tarefas', icon: ListTodo },
    { href: '/operations/deadlines', label: 'Prazos', icon: Calendar },
    { href: '/operations/templates', label: 'Templates', icon: Settings },
  ];

  const handleCreate = () => {
    createTpl.mutate(
      {
        name,
        kind,
        category_id: categoryId || null,
        default_assignee_id: assigneeId || null,
      },
      {
        onSuccess: (t: any) => {
          setNewOpen(false);
          setName('');
          setCategoryId('');
          setAssigneeId('');
          setSelectedId(t.id);
        },
      }
    );
  };

  return (
    <MainLayout title="Templates de Caso" subtitle="Modelos automáticos por tipo e categoria">
      <div className="space-y-4">
        <div className="flex gap-1 border-b">
          {tabs.map((t) => (
            <Link
              key={t.href}
              to={t.href}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition',
                location.pathname === t.href ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          ))}
        </div>

        <Tabs defaultValue="templates" className="space-y-4">
          <TabsList>
            <TabsTrigger value="templates">Templates de Caso</TabsTrigger>
            <TabsTrigger value="columns">Colunas do Operacional</TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Lista de templates */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Templates</h2>
                  <Dialog open={newOpen} onOpenChange={setNewOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Novo template</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <div>
                          <Label>Nome</Label>
                          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Aposentadoria por idade" />
                        </div>
                        <div>
                          <Label>Tipo</Label>
                          <select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value as any)}>
                            <option value="judicial">Judicial</option>
                            <option value="administrative">Administrativo</option>
                          </select>
                        </div>
                        <div>
                          <Label>Categoria</Label>
                          <select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                            <option value="">—</option>
                            {categories.filter((c: any) => c.kind === kind).map((c: any) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label>Responsável padrão</Label>
                          <select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                            <option value="">—</option>
                            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleCreate} disabled={!name.trim()}>Criar</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                {templates.length === 0 && <p className="text-sm text-muted-foreground">Nenhum template ainda.</p>}
                {templates.map((t: any) => {
                  const Icon = t.kind === 'judicial' ? Scale : Building2;
                  return (
                    <Card
                      key={t.id}
                      onClick={() => setSelectedId(t.id)}
                      className={cn('p-3 cursor-pointer hover:bg-muted/50', selectedId === t.id && 'border-primary bg-muted/30')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{t.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="gap-1 text-[10px]">
                              <Icon className="h-2.5 w-2.5" />
                              {t.kind === 'judicial' ? 'Judicial' : 'Administrativo'}
                            </Badge>
                            {t.category && <Badge variant="outline" className="text-[10px]">{t.category.name}</Badge>}
                          </div>
                        </div>
                        <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); delTpl.mutate(t.id); if (selectedId === t.id) setSelectedId(null); }} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Tarefas padrão + Gatilhos */}
              <div className="lg:col-span-2 space-y-4">
                {selected ? (
                  <>
                    <Card className="p-4">
                      <h3 className="text-sm font-semibold mb-3">Tarefas padrão de "{selected.name}"</h3>
                      <div className="flex gap-2 mb-3">
                        <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Título da tarefa" />
                        <Input
                          type="number"
                          min={0}
                          value={taskDays}
                          onChange={(e) => setTaskDays(parseInt(e.target.value) || 0)}
                          className="w-24"
                          placeholder="dias"
                        />
                        <Button
                          onClick={() => {
                            if (!taskTitle.trim()) return;
                            createTask.mutate(
                              { template_id: selected.id, title: taskTitle.trim(), days_to_due: taskDays, order: tplTasks.length },
                              { onSuccess: () => setTaskTitle('') }
                            );
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {tplTasks.map((t: any) => (
                          <div key={t.id} className="flex items-center justify-between p-2 rounded border">
                            <div>
                              <p className="text-sm">{t.title}</p>
                              <p className="text-xs text-muted-foreground">Vence em +{t.days_to_due} dias</p>
                            </div>
                            <Button size="icon" variant="ghost" onClick={() => delTask.mutate(t.id)} className="h-7 w-7">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <TemplateSummaryEditor
                      templateId={selected.id}
                      kind={selected.kind}
                      judicial={(selected as any).default_judicial_data || {}}
                      administrative={(selected as any).default_administrative_data || {}}
                    />

                    <CaseTriggersCard templateId={selected.id} />
                  </>
                ) : (
                  <Card className="p-12 text-center text-muted-foreground">
                    Selecione um template para configurar tarefas e gatilhos.
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="columns">
            <CaseStatusManager />
          </TabsContent>
        </Tabs>
    </MainLayout>
  );
}

function CaseTriggersCard({ templateId }: { templateId: string }) {
  const { data: pipelines = [] } = usePipelines();
  const { data: triggers = [] } = useCaseTriggers();
  const createTrig = useCreateCaseTrigger();
  const delTrig = useDeleteCaseTrigger();
  const [pipelineId, setPipelineId] = useState('');
  const [columnId, setColumnId] = useState('');
  const { data: columns = [] } = usePipelineColumns(pipelineId || null);

  const myTriggers = triggers.filter((t: any) => t.template_id === templateId);

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4" /> Gatilhos automáticos
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Quando uma conversa entrar nas colunas abaixo, um caso será aberto automaticamente.
      </p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); setColumnId(''); }}>
          <option value="">Pipeline</option>
          {pipelines.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={columnId} onChange={(e) => setColumnId(e.target.value)} disabled={!pipelineId}>
          <option value="">Coluna</option>
          {columns.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button
          onClick={() => {
            if (!pipelineId || !columnId) return;
            createTrig.mutate({ pipeline_id: pipelineId, column_id: columnId, template_id: templateId }, {
              onSuccess: () => { setPipelineId(''); setColumnId(''); },
            });
          }}
          disabled={!pipelineId || !columnId}
        >
          <Plus className="h-4 w-4 mr-1" /> Adicionar
        </Button>
      </div>
      <div className="space-y-2">
        {myTriggers.length === 0 && <p className="text-xs text-muted-foreground">Nenhum gatilho configurado.</p>}
        {myTriggers.map((t: any) => (
          <div key={t.id} className="flex items-center justify-between p-2 rounded border text-sm">
            <span>{t.pipeline?.name} → {t.column?.name}</span>
            <Button size="icon" variant="ghost" onClick={() => delTrig.mutate(t.id)} className="h-7 w-7">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
