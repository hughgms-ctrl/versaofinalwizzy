import { useState } from 'react';
import { Plus, Trash2, Briefcase, Scale, Building2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCaseTemplates, useCreateCaseTemplate, useCreateTemplateTask } from '@/hooks/useCaseTemplates';
import { useCaseCategories } from '@/hooks/useOperationsCases';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { PipelineColumn } from '@/hooks/usePipelines';
import type { CaseKind } from '@/types/operations';

interface Props {
  pipelineId: string;
  columns: PipelineColumn[];
}

export function OperationsTriggerSection({ pipelineId, columns }: Props) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: templates = [] } = useCaseTemplates();
  const [creatingFor, setCreatingFor] = useState<string | null>(null);

  // Carrega gatilhos existentes para este pipeline
  const { data: triggers = [] } = useQuery({
    queryKey: ['case-triggers-pipeline', pipelineId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('case_triggers')
        .select('*')
        .eq('pipeline_id', pipelineId);
      if (error) throw error;
      return data || [];
    },
  });

  const upsertTrigger = useMutation({
    mutationFn: async ({ columnId, templateId, isActive }: { columnId: string; templateId: string | null; isActive: boolean }) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      const existing = triggers.find((t: any) => t.column_id === columnId);
      if (existing) {
        if (!templateId || !isActive) {
          const { error } = await (supabase as any).from('case_triggers').delete().eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await (supabase as any)
            .from('case_triggers')
            .update({ template_id: templateId, is_active: isActive })
            .eq('id', existing.id);
          if (error) throw error;
        }
      } else if (templateId && isActive) {
        const { error } = await (supabase as any).from('case_triggers').insert({
          organization_id: profile.organization_id,
          pipeline_id: pipelineId,
          column_id: columnId,
          template_id: templateId,
          is_active: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-triggers-pipeline', pipelineId] });
      qc.invalidateQueries({ queryKey: ['case-triggers'] });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const getTriggerForColumn = (columnId: string) =>
    triggers.find((t: any) => t.column_id === columnId);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Briefcase className="h-4 w-4" /> Operacional
        </h3>
        <p className="text-xs text-muted-foreground">
          Quando um lead chegar a uma coluna abaixo, um caso operacional será criado automaticamente com o template escolhido.
        </p>
      </div>

      <div className="space-y-2">
        {columns.map((col) => {
          const trigger = getTriggerForColumn(col.id);
          const template = trigger ? templates.find((t: any) => t.id === trigger.template_id) : null;
          const isActive = !!trigger?.is_active;

          return (
            <Card key={col.id} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                  <span className="text-sm font-medium truncate">{col.name}</span>
                </div>
                <Switch
                  checked={isActive}
                  onCheckedChange={(checked) => {
                    if (!checked) {
                      upsertTrigger.mutate({ columnId: col.id, templateId: null, isActive: false });
                    } else if (templates.length > 0) {
                      upsertTrigger.mutate({ columnId: col.id, templateId: templates[0].id, isActive: true });
                    } else {
                      setCreatingFor(col.id);
                    }
                  }}
                />
              </div>

              {isActive && (
                <div className="space-y-2 pl-5 border-l-2 border-primary/20">
                  <div className="flex items-center gap-2">
                    <Select
                      value={trigger?.template_id || ''}
                      onValueChange={(v) => upsertTrigger.mutate({ columnId: col.id, templateId: v, isActive: true })}
                    >
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue placeholder="Selecione um template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t: any) => (
                          <SelectItem key={t.id} value={t.id}>
                            <div className="flex items-center gap-2">
                              {t.kind === 'judicial' ? <Scale className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                              {t.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      onClick={() => setCreatingFor(col.id)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Novo
                    </Button>
                  </div>

                  {template && (
                    <div className="flex items-center gap-1 flex-wrap text-xs">
                      <Badge variant="outline" className="text-[10px] gap-1">
                        {template.kind === 'judicial' ? <Scale className="h-2.5 w-2.5" /> : <Building2 className="h-2.5 w-2.5" />}
                        {template.kind === 'judicial' ? 'Judicial' : 'Administrativo'}
                      </Badge>
                      {(template as any).category?.name && (
                        <Badge variant="outline" className="text-[10px]">{(template as any).category.name}</Badge>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {creatingFor && (
        <NewTemplateInline
          onClose={() => setCreatingFor(null)}
          onCreated={(templateId) => {
            upsertTrigger.mutate({ columnId: creatingFor, templateId, isActive: true });
            setCreatingFor(null);
          }}
        />
      )}
    </div>
  );
}

function NewTemplateInline({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CaseKind>('judicial');
  const [categoryId, setCategoryId] = useState<string>('');
  const [tasks, setTasks] = useState<{ title: string; days_to_due: number }[]>([{ title: '', days_to_due: 7 }]);
  const { data: categories = [] } = useCaseCategories();
  const createTpl = useCreateCaseTemplate();
  const createTask = useCreateTemplateTask();

  const filteredCategories = categories.filter((c: any) => c.kind === kind);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Informe o nome do template', variant: 'destructive' });
      return;
    }
    const tpl = await createTpl.mutateAsync({
      name: name.trim(),
      kind,
      category_id: categoryId || null,
    });
    // Cria as tarefas em ordem
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (t.title.trim()) {
        await createTask.mutateAsync({
          template_id: tpl.id,
          title: t.title.trim(),
          days_to_due: t.days_to_due,
          order: i,
        });
      }
    }
    onCreated(tpl.id);
  };

  return (
    <Card className="p-3 space-y-3 border-primary/40">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Novo template de caso</h4>
        <Button size="sm" variant="ghost" onClick={onClose}>×</Button>
      </div>

      <div className="space-y-2">
        <div>
          <Label className="text-xs">Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Reclusão INSS" className="h-8 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={kind} onValueChange={(v: CaseKind) => { setKind(v); setCategoryId(''); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="judicial">Judicial</SelectItem>
                <SelectItem value="administrative">Administrativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {filteredCategories.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Tarefas do checklist</Label>
          {tasks.map((t, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                value={t.title}
                onChange={(e) => setTasks(tasks.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))}
                placeholder={`Tarefa ${i + 1}`}
                className="h-7 text-xs flex-1"
              />
              <Input
                type="number"
                value={t.days_to_due}
                onChange={(e) => setTasks(tasks.map((x, idx) => idx === i ? { ...x, days_to_due: parseInt(e.target.value) || 0 } : x))}
                className="h-7 text-xs w-16"
                title="Dias para vencer"
              />
              <span className="text-[10px] text-muted-foreground">d</span>
              {tasks.length > 1 && (
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setTasks(tasks.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setTasks([...tasks, { title: '', days_to_due: 7 }])}
          >
            <Plus className="h-3 w-3 mr-1" /> Tarefa
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={handleCreate} disabled={createTpl.isPending}>
          Criar template
        </Button>
      </div>
    </Card>
  );
}
