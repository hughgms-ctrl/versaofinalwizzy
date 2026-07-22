import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AlertTriangle, Loader2, Plus, Trash2, ChevronUp, ChevronDown, Tag, Kanban, Users, Clock, Bot, Workflow, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useTags } from '@/hooks/useTags';
import { useAllPipelineColumns, type PipelineWithColumns } from '@/hooks/usePipelines';
import { useAIAgents, AGENT_FUNCTION_ROLES } from '@/hooks/useAIAgents';
import { useFlows } from '@/hooks/useFlows';
import type { AgentTemplate } from './AgentTemplateGallery';
import { buildStepPreview } from './TemplateDetailDialog';

interface CollidingCampaign {
  id: string;
  name: string;
  trigger_keyword: string;
}

interface PipelineTarget { pipelineId: string; columnId: string; }

// Seletor pipeline+coluna reaproveitado em vários lugares (etapa de mover
// pipeline, roteamento por resultado do agente) -- usa useAllPipelineColumns()
// (colunas de todos os pipelines de uma vez) porque o número de usos é
// dinâmico, então não dá pra chamar um hook por item dentro de um .map().
function PipelineColumnPicker({ pipelines, value, onChange }: {
  pipelines: PipelineWithColumns[];
  value: PipelineTarget;
  onChange: (value: PipelineTarget) => void;
}) {
  const columns = pipelines.find((p) => p.pipeline.id === value.pipelineId)?.columns || [];
  return (
    <div className="flex gap-1.5">
      <Select
        value={value.pipelineId || 'none'}
        onValueChange={(v) => onChange({ pipelineId: v === 'none' ? '' : v, columnId: '' })}
      >
        <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Pipeline..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Nenhum</SelectItem>
          {pipelines.map((p) => <SelectItem key={p.pipeline.id} value={p.pipeline.id}>{p.pipeline.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {value.pipelineId && (
        <Select value={value.columnId || 'none'} onValueChange={(v) => onChange({ ...value, columnId: v === 'none' ? '' : v })}>
          <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Coluna..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Escolha...</SelectItem>
            {columns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

type StepType = 'tag' | 'pipeline' | 'transfer' | 'delay' | 'flow' | 'agent';

interface OutcomeRoutingDraft {
  continueFlag: boolean; // default true -- false = encerra a cadeia ali
  pipeline: PipelineTarget;
  tagId: string;
}

interface RemarketingStepDraft { key: string; message: string; delayMinutes: number; }

function emptyRouting(): OutcomeRoutingDraft {
  return { continueFlag: true, pipeline: { pipelineId: '', columnId: '' }, tagId: '' };
}

type DelayUnit = 'seconds' | 'minutes' | 'hours' | 'days';
const DELAY_UNIT_SECONDS: Record<DelayUnit, number> = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
const DELAY_UNIT_LABEL: Record<DelayUnit, string> = { seconds: 'segundos', minutes: 'minutos', hours: 'horas', days: 'dias' };

function secondsToAmountUnit(totalSeconds: number): { delayAmount: number; delayUnit: DelayUnit } {
  const order: DelayUnit[] = ['days', 'hours', 'minutes', 'seconds'];
  for (const unit of order) {
    const mult = DELAY_UNIT_SECONDS[unit];
    if (totalSeconds >= mult && totalSeconds % mult === 0) return { delayAmount: totalSeconds / mult, delayUnit: unit };
  }
  return { delayAmount: totalSeconds || 1, delayUnit: 'seconds' };
}

interface StepDraft {
  key: string;
  type: StepType;
  tagId: string;
  pipeline: PipelineTarget;
  delayAmount: number;
  delayUnit: DelayUnit;
  agentMode: 'existing' | 'new';
  agentId: string;
  newAgentName: string;
  newAgentFunctionRole: string;
  newAgentPromptBase: string;
  additionalPrompt: string;
  outcomesText: string;
  outcomeRouting: Record<string, OutcomeRoutingDraft>;
  outcomeDefaultTransfer: boolean;
  // 'flow' (Iniciar Fluxo) -- espelha o node action-flow real (Agente Master - AR):
  // disparo fire-and-forget, opcionalmente virando um portão "respondeu"/"não
  // respondeu" com régua de follow-ups enquanto espera a próxima mensagem do cliente.
  flowId: string;
  waitForResponse: boolean;
  remarketingSteps: RemarketingStepDraft[];
  remarketingContext: string;
  remarketingQuietHours: boolean;
  remarketingQuietStart: string;
  flowRouting: { responded: OutcomeRoutingDraft; timeout: OutcomeRoutingDraft };
}

function makeEmptyStep(type: StepType): StepDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    tagId: '',
    pipeline: { pipelineId: '', columnId: '' },
    delayAmount: 1,
    delayUnit: 'minutes',
    agentMode: 'new',
    agentId: '',
    newAgentName: '',
    newAgentFunctionRole: 'recepcao',
    newAgentPromptBase: '',
    additionalPrompt: '',
    outcomesText: '',
    outcomeRouting: {},
    outcomeDefaultTransfer: false,
    flowId: '',
    waitForResponse: true,
    remarketingSteps: [],
    remarketingContext: '',
    remarketingQuietHours: false,
    remarketingQuietStart: '21:00',
    flowRouting: { responded: emptyRouting(), timeout: emptyRouting() },
  };
}

const STEP_TYPE_META: Record<StepType, { label: string; icon: typeof Tag }> = {
  tag: { label: 'Atribuir Tag', icon: Tag },
  pipeline: { label: 'Mover Pipeline', icon: Kanban },
  transfer: { label: 'Transferir', icon: Users },
  delay: { label: 'Aguardar', icon: Clock },
  flow: { label: 'Iniciar Fluxo', icon: Workflow },
  agent: { label: 'Agente de IA', icon: Bot },
};

function stepOutcomes(step: StepDraft): string[] {
  return step.outcomesText.split(',').map((o) => o.trim()).filter(Boolean);
}

function newDraftKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Reconstrói a lista de etapas a partir do grafo ATUAL de um fluxo -- reverso
// exato do que buildStepsGraph (apply-agent-template/index.ts) monta. Só
// reconhece o formato que o PRÓPRIO wizard gera; qualquer coisa fora disso
// (ramificação divergente, node type desconhecido na cadeia principal, mais de
// 1 saída sem handle) devolve null -- nesse caso a edição cai pra "abrir no
// Flow Builder" em vez de arriscar reconstruir errado (ver conversa com o
// usuário: "precisa estar tudo disponível pra ajustar quando quiser", mas
// forçar um encaixe incorreto seria pior que admitir o limite).
function parseFlowToSteps(nodes: any[], edges: any[]): StepDraft[] | null {
  const nodeById = new Map(nodes.map((n: any) => [n.id, n]));
  const edgesFrom = (id: string) => edges.filter((e: any) => e.source === id);
  const edgeFrom = (id: string, handle?: string) =>
    edges.find((e: any) => e.source === id && (handle === undefined ? !e.sourceHandle : e.sourceHandle === handle));

  const start = nodes.find((n: any) => n.type === 'start');
  if (!start) return null;

  // Segue uma ramificação (resultado de agente / saída de "Iniciar Fluxo") até
  // o próximo passo real da lista, absorvendo um nó de tag e/ou pipeline no
  // meio do caminho (nessa ordem -- é a mesma ordem que o builder usa).
  const resolveBranch = (sourceId: string, handle: string): { routing: OutcomeRoutingDraft; next: string | null } | null => {
    const edge = edgeFrom(sourceId, handle);
    if (!edge) return { routing: emptyRouting(), next: null };
    let node = nodeById.get(edge.target);
    if (!node) return null;
    let tagId = '';
    let pipeline: PipelineTarget = { pipelineId: '', columnId: '' };

    if (node.type === 'action-tag') {
      tagId = node.data?.tagId || '';
      const after = edgeFrom(node.id);
      if (!after) return { routing: { continueFlag: false, pipeline, tagId }, next: null };
      node = nodeById.get(after.target);
      if (!node) return null;
    }
    if (node.type === 'action-pipeline') {
      pipeline = { pipelineId: node.data?.pipelineId || '', columnId: node.data?.pipelineColumnId || '' };
      const after = edgeFrom(node.id);
      if (!after) return { routing: { continueFlag: false, pipeline, tagId }, next: null };
      node = nodeById.get(after.target);
      if (!node) return null;
    }
    return { routing: { continueFlag: true, pipeline, tagId }, next: node.id };
  };

  const steps: StepDraft[] = [];
  let currentId: string | null = start.id;
  let guard = 0;

  while (currentId) {
    guard++;
    if (guard > 200) return null;
    const outs = edgesFrom(currentId);
    if (outs.length === 0) break;
    if (outs.length > 1) return null;
    const edge = outs[0];
    if (edge.sourceHandle) return null;
    const node = nodeById.get(edge.target);
    if (!node) return null;

    if (node.type === 'action-tag') {
      const step = makeEmptyStep('tag');
      step.tagId = node.data?.tagId || '';
      steps.push(step);
      currentId = node.id;
    } else if (node.type === 'action-pipeline') {
      const step = makeEmptyStep('pipeline');
      step.pipeline = { pipelineId: node.data?.pipelineId || '', columnId: node.data?.pipelineColumnId || '' };
      steps.push(step);
      currentId = node.id;
    } else if (node.type === 'action-transfer') {
      steps.push(makeEmptyStep('transfer'));
      currentId = node.id;
    } else if (node.type === 'action-delay') {
      const step = makeEmptyStep('delay');
      const { delayAmount, delayUnit } = secondsToAmountUnit(node.data?.delaySeconds || 60);
      step.delayAmount = delayAmount;
      step.delayUnit = delayUnit;
      steps.push(step);
      currentId = node.id;
    } else if (node.type === 'action-flow') {
      const step = makeEmptyStep('flow');
      step.flowId = node.data?.flowId || '';
      step.waitForResponse = !!node.data?.waitForResponse;
      if (!step.waitForResponse) {
        steps.push(step);
        currentId = node.id;
      } else {
        step.remarketingSteps = (node.data?.remarketingSteps || []).map((r: any) => ({ key: newDraftKey(), message: r.message || '', delayMinutes: r.delayMinutes || 10 }));
        step.remarketingContext = node.data?.remarketingContext || '';
        step.remarketingQuietHours = !!node.data?.remarketingQuietHours;
        step.remarketingQuietStart = node.data?.remarketingQuietStart || '21:00';

        const responded = resolveBranch(node.id, 'responded');
        const timeout = resolveBranch(node.id, 'timeout');
        if (!responded || !timeout) return null;
        step.flowRouting = { responded: responded.routing, timeout: timeout.routing };
        steps.push(step);

        if (responded.next !== timeout.next) return null;
        currentId = responded.next;
        continue;
      }
    } else if (node.type === 'ai-handoff') {
      const step = makeEmptyStep('agent');
      step.agentMode = 'existing';
      step.agentId = node.data?.agentId || '';
      step.additionalPrompt = node.data?.additionalPrompt || '';
      const outcomes = String(node.data?.expectedOutcomes || '').split(',').map((o: string) => o.trim()).filter(Boolean);
      step.outcomesText = outcomes.join(', ');

      const defaultEdge = edgeFrom(node.id, 'outcome-default');
      if (defaultEdge) {
        const defaultNode = nodeById.get(defaultEdge.target);
        if (defaultNode?.type !== 'action-transfer') return null;
        step.outcomeDefaultTransfer = true;
      }

      if (outcomes.length === 0) {
        steps.push(step);
        currentId = node.id;
      } else {
        const routing: Record<string, OutcomeRoutingDraft> = {};
        let nextId: string | null | undefined;
        let diverged = false;
        for (const o of outcomes) {
          const branch = resolveBranch(node.id, `outcome-${o}`);
          if (!branch) return null;
          routing[o] = branch.routing;
          if (branch.next !== null) {
            if (nextId === undefined) nextId = branch.next;
            else if (nextId !== branch.next) diverged = true;
          }
        }
        if (diverged) return null;
        step.outcomeRouting = routing;
        steps.push(step);
        currentId = nextId === undefined ? null : nextId;
        continue;
      }
    } else {
      return null;
    }
  }

  return steps;
}

// Bloco "o que fazer depois desse resultado" -- reaproveitado tanto pelos
// resultados de um agente quanto pelas duas saídas fixas ("Respondeu"/"Não
// respondeu") de uma etapa "Iniciar Fluxo" com espera ativada.
function RoutingRow({ label, routing, pipelines, tags, onChange }: {
  label: string;
  routing: OutcomeRoutingDraft;
  pipelines: PipelineWithColumns[];
  tags: { id: string; name: string }[];
  onChange: (patch: Partial<OutcomeRoutingDraft>) => void;
}) {
  return (
    <div className="space-y-1.5 p-2 rounded-md border border-border/50 bg-muted/30">
      <span className="text-[10px] font-semibold text-violet-500">● {label}</span>
      <Select value={routing.continueFlag ? 'continue' : 'end'} onValueChange={(v) => onChange({ continueFlag: v === 'continue' })}>
        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="continue">Continuar para a próxima etapa</SelectItem>
          <SelectItem value="end">Encerrar aqui</SelectItem>
        </SelectContent>
      </Select>
      <PipelineColumnPicker pipelines={pipelines} value={routing.pipeline} onChange={(v) => onChange({ pipeline: v })} />
      <Select value={routing.tagId || 'none'} onValueChange={(v) => onChange({ tagId: v === 'none' ? '' : v })}>
        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Adicionar tag..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Nenhuma tag</SelectItem>
          {tags.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// Card de configuração de UMA etapa da orquestração -- o tipo já foi escolhido
// ao adicionar (via "+ Adicionar etapa"); aqui só configura os campos daquele
// tipo. 'agent' é o único tipo que pode se repetir na lista (várias etapas de
// agente encadeadas -- ver conversa com o usuário sobre "orquestração de
// agentes", ex.: qualificador → verificador de relatório → decide avançar).
function StepCard({
  step, index, total, tags, pipelines, agents, flows, organizationId,
  onChange, onRemove, onMove,
}: {
  step: StepDraft;
  index: number;
  total: number;
  tags: { id: string; name: string }[];
  pipelines: PipelineWithColumns[];
  agents: { id: string; name: string }[];
  flows: { id: string; name: string }[];
  organizationId?: string | null;
  onChange: (patch: Partial<StepDraft>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const meta = STEP_TYPE_META[step.type];
  const Icon = meta.icon;
  const outcomes = stepOutcomes(step);
  // "Iniciar Fluxo" e "Agente de IA" têm muito campo -- recolhidos por padrão
  // (ver conversa com o usuário: "visualização elegante, sem confusão visual"),
  // com um resumo de uma linha e um botão pra abrir/fechar a configuração.
  const collapsible = step.type === 'flow' || step.type === 'agent';
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const [aiInput, setAiInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleAIGenerate = async () => {
    if (!aiInput.trim() || !organizationId) return;
    setIsGenerating(true);
    try {
      const roleLabel = AGENT_FUNCTION_ROLES.find((r) => r.value === step.newAgentFunctionRole)?.label || step.newAgentFunctionRole;
      const { data, error } = await supabase.functions.invoke('generate-agent-prompt', {
        body: { userDescription: aiInput, agentName: step.newAgentName || 'Agente', agentRole: roleLabel, organizationId },
      });
      if (error) throw error;
      if (data?.prompt) {
        onChange({ newAgentPromptBase: data.prompt });
        toast({ title: 'Prompt gerado com sucesso!' });
      }
    } catch (err) {
      toast({ title: 'Erro ao gerar prompt', description: err instanceof Error ? err.message : 'Tente novamente', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const updateRouting = (outcome: string, patch: Partial<OutcomeRoutingDraft>) => {
    const current = step.outcomeRouting[outcome] || emptyRouting();
    onChange({ outcomeRouting: { ...step.outcomeRouting, [outcome]: { ...current, ...patch } } });
  };

  const summary = (() => {
    if (step.type === 'flow') {
      const flowName = flows.find((f) => f.id === step.flowId)?.name;
      return flowName ? `${flowName}${step.waitForResponse ? ' · aguarda resposta' : ''}` : 'Nenhum fluxo escolhido ainda';
    }
    if (step.type === 'agent') {
      const name = step.agentMode === 'existing'
        ? agents.find((a) => a.id === step.agentId)?.name
        : step.newAgentName;
      return name ? `${name}${outcomes.length ? ` · ${outcomes.length} resultado${outcomes.length > 1 ? 's' : ''}` : ''}` : 'Nenhum agente configurado ainda';
    }
    return '';
  })();

  return (
    <div className="rounded-lg border border-border/50 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className={cn('flex items-center gap-2 text-sm font-medium min-w-0 text-left', collapsible && 'cursor-pointer')}
          onClick={() => collapsible && setExpanded((v) => !v)}
        >
          <Icon className="h-4 w-4 text-violet-500 shrink-0" />
          <span className="shrink-0">{meta.label}</span>
          <span className="text-xs text-muted-foreground font-normal shrink-0">#{index + 1}</span>
          {collapsible && !expanded && (
            <span className="text-xs text-muted-foreground font-normal truncate">— {summary}</span>
          )}
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          {collapsible && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Fechar' : 'Editar'}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {step.type === 'tag' && (
        <Select value={step.tagId || 'none'} onValueChange={(v) => onChange({ tagId: v === 'none' ? '' : v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolha a tag..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Escolha...</SelectItem>
            {tags.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {step.type === 'pipeline' && (
        <PipelineColumnPicker pipelines={pipelines} value={step.pipeline} onChange={(v) => onChange({ pipeline: v })} />
      )}

      {step.type === 'transfer' && (
        <p className="text-xs text-muted-foreground">Transfere o atendimento para um humano.</p>
      )}

      {step.type === 'flow' && expanded && (
        <div className="space-y-3">
          <Select value={step.flowId || 'none'} onValueChange={(v) => onChange({ flowId: v === 'none' ? '' : v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolha o fluxo..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Escolha...</SelectItem>
              {flows.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="flex items-center justify-between p-2 rounded-md border border-border/50">
            <Label className="text-xs">Esperar resposta do cliente (com follow-ups)</Label>
            <Switch checked={step.waitForResponse} onCheckedChange={(v) => onChange({ waitForResponse: v })} />
          </div>

          {step.waitForResponse && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Contexto (o que está sendo pedido/perguntado neste momento)</Label>
                <Textarea
                  rows={2} className="text-xs" placeholder="Ex.: estou pedindo a data da prisão e se ele trabalhava registrado."
                  value={step.remarketingContext} onChange={(e) => onChange({ remarketingContext: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground">Follow-ups enquanto espera (mensagem + minutos de atraso)</Label>
                {step.remarketingSteps.map((rm) => (
                  <div key={rm.key} className="flex gap-1.5 items-start">
                    <Textarea
                      rows={2} className="text-xs flex-1" placeholder="Mensagem de follow-up..."
                      value={rm.message}
                      onChange={(e) => onChange({ remarketingSteps: step.remarketingSteps.map((r) => r.key === rm.key ? { ...r, message: e.target.value } : r) })}
                    />
                    <Input
                      type="number" min={1} className="h-8 text-xs w-20" title="minutos de atraso"
                      value={rm.delayMinutes}
                      onChange={(e) => onChange({ remarketingSteps: step.remarketingSteps.map((r) => r.key === rm.key ? { ...r, delayMinutes: Number(e.target.value) || 1 } : r) })}
                    />
                    <Button
                      type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0"
                      onClick={() => onChange({ remarketingSteps: step.remarketingSteps.filter((r) => r.key !== rm.key) })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button" variant="outline" size="sm" className="h-7 text-xs w-full border-dashed"
                  onClick={() => onChange({ remarketingSteps: [...step.remarketingSteps, { key: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, message: '', delayMinutes: 10 }] })}
                >
                  <Plus className="h-3 w-3 mr-1" /> Adicionar follow-up
                </Button>
              </div>

              <div className="flex items-center justify-between p-2 rounded-md border border-border/50">
                <Label className="text-xs">Não enviar follow-up de madrugada</Label>
                <Switch checked={step.remarketingQuietHours} onCheckedChange={(v) => onChange({ remarketingQuietHours: v })} />
              </div>
              {step.remarketingQuietHours && (
                <Input
                  type="time" className="h-8 text-xs w-28"
                  value={step.remarketingQuietStart}
                  onChange={(e) => onChange({ remarketingQuietStart: e.target.value })}
                />
              )}

              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground">Depois de cada saída</Label>
                <RoutingRow
                  label="Respondeu"
                  routing={step.flowRouting.responded}
                  pipelines={pipelines} tags={tags}
                  onChange={(patch) => onChange({ flowRouting: { ...step.flowRouting, responded: { ...step.flowRouting.responded, ...patch } } })}
                />
                <RoutingRow
                  label="Não respondeu (timeout)"
                  routing={step.flowRouting.timeout}
                  pipelines={pipelines} tags={tags}
                  onChange={(patch) => onChange({ flowRouting: { ...step.flowRouting, timeout: { ...step.flowRouting.timeout, ...patch } } })}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {step.type === 'delay' && (
        <div className="flex items-center gap-2">
          <Input
            type="number" min={1} className="h-8 text-xs w-20"
            value={step.delayAmount}
            onChange={(e) => onChange({ delayAmount: Number(e.target.value) || 1 })}
          />
          <Select value={step.delayUnit} onValueChange={(v) => onChange({ delayUnit: v as DelayUnit })}>
            <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(DELAY_UNIT_LABEL) as DelayUnit[]).map((u) => (
                <SelectItem key={u} value={u}>{DELAY_UNIT_LABEL[u]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {step.type === 'agent' && expanded && (
        <div className="space-y-3">
          <div className="flex gap-1.5">
            <Button
              type="button" size="sm" variant={step.agentMode === 'existing' ? 'default' : 'outline'}
              className="h-7 text-xs flex-1" onClick={() => onChange({ agentMode: 'existing' })}
            >
              Usar agente existente
            </Button>
            <Button
              type="button" size="sm" variant={step.agentMode === 'new' ? 'default' : 'outline'}
              className="h-7 text-xs flex-1" onClick={() => onChange({ agentMode: 'new' })}
            >
              Criar novo agente
            </Button>
          </div>

          {step.agentMode === 'existing' ? (
            <Select value={step.agentId || 'none'} onValueChange={(v) => onChange({ agentId: v === 'none' ? '' : v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolha o agente..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Escolha...</SelectItem>
                {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <div className="space-y-2">
              <Input
                className="h-8 text-xs" placeholder="Nome do agente"
                value={step.newAgentName} onChange={(e) => onChange({ newAgentName: e.target.value })}
              />
              <Select value={step.newAgentFunctionRole} onValueChange={(v) => onChange({ newAgentFunctionRole: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AGENT_FUNCTION_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="space-y-1.5 p-2 rounded-lg border border-dashed border-violet-300 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20">
                <Label className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Assistente IA para criação de prompt
                </Label>
                <Textarea
                  rows={2} className="text-xs" placeholder="Descreva com suas palavras o que esse agente deve fazer..."
                  value={aiInput} onChange={(e) => setAiInput(e.target.value)}
                />
                <Button
                  type="button" size="sm" className="h-7 text-xs w-full"
                  disabled={isGenerating || !aiInput.trim()}
                  onClick={handleAIGenerate}
                >
                  {isGenerating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                  {isGenerating ? 'Gerando...' : 'Gerar Prompt com IA'}
                </Button>
              </div>
              <Textarea
                rows={4} className="text-xs" placeholder="Prompt base deste agente (identidade e função)"
                value={step.newAgentPromptBase} onChange={(e) => onChange({ newAgentPromptBase: e.target.value })}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Prompt específico deste passo (opcional -- soma ao prompt base, não substitui)</Label>
            <Textarea
              rows={2} className="text-xs" placeholder="Ex.: neste ponto, verifique o relatório e decida se há direito ao benefício..."
              value={step.additionalPrompt} onChange={(e) => onChange({ additionalPrompt: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Resultados possíveis (opcional, separados por vírgula)</Label>
            <Input
              className="h-8 text-xs" placeholder="ex: qualificado, desqualificado"
              value={step.outcomesText} onChange={(e) => onChange({ outcomesText: e.target.value })}
            />
          </div>

          {outcomes.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[10px] text-muted-foreground">Depois de cada resultado</Label>
              {outcomes.map((outcome) => (
                <RoutingRow
                  key={outcome}
                  label={outcome}
                  routing={step.outcomeRouting[outcome] || emptyRouting()}
                  pipelines={pipelines} tags={tags}
                  onChange={(patch) => updateRouting(outcome, patch)}
                />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between p-2 rounded-md border border-border/50">
            <Label className="text-xs">Transferir para humano se o resultado não for identificado</Label>
            <Switch checked={step.outcomeDefaultTransfer} onCheckedChange={(v) => onChange({ outcomeDefaultTransfer: v })} />
          </div>
        </div>
      )}
    </div>
  );
}

interface ApplyTemplateWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: AgentTemplate | null;
  onApplied?: () => void;
  // Reabre a MESMA lista de etapas a partir do grafo atual dessa instância, em
  // vez de criar do zero -- "Salvar" atualiza o fluxo/campanha existentes.
  // Mutuamente exclusivo com `template`.
  editInstanceId?: string | null;
}

// Wizard de aplicar template (Etapa 5), generalizado pra também montar uma
// orquestração do zero (template=null): mesmo pipeline (fluxo+agente(s)+
// campanha+instância juntos, já linkados, mesmo aviso de colisão de gatilho).
// A etapa "steps" é uma lista dinâmica de passos (Atribuir Tag, Mover
// Pipeline, Transferir, Aguardar, Agente de IA) que o usuário monta livremente
// -- "Agente de IA" pode repetir (múltiplos agentes encadeados na mesma
// orquestração, cada um podendo ser um agente novo ou um já existente,
// reaproveitado de outra orquestração). Workspace já carrega
// whatsapp_instance_id (ver src/hooks/useWorkspaces.ts) -- escolher o
// workspace já resolve "qual número" e "qual workspace" numa etapa só.
export function ApplyTemplateWizard({ open, onOpenChange, template, onApplied, editInstanceId }: ApplyTemplateWizardProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { availableWorkspaces, selectedOrganizationId: organizationId } = useWorkspaceContext();
  const { data: tags = [] } = useTags();
  const { data: pipelinesWithColumns = [] } = useAllPipelineColumns();
  const { data: existingAgents = [] } = useAIAgents();
  const { data: existingFlows = [] } = useFlows();

  const isEditMode = !!editInstanceId;
  const [step, setStep] = useState<'name' | 'steps' | 'workspace' | 'applying' | 'review' | 'activating' | 'loading' | 'unsupported'>('workspace');
  const [orchestrationName, setOrchestrationName] = useState('');
  const [stepDrafts, setStepDrafts] = useState<StepDraft[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [triggerKeyword, setTriggerKeyword] = useState('');
  const [colliding, setColliding] = useState<CollidingCampaign[]>([]);
  const [checkingKeyword, setCheckingKeyword] = useState(false);
  const [editFlowId, setEditFlowId] = useState<string | null>(null);
  // Prévia somente-leitura de quando o fluxo foi editado direto no Flow
  // Builder de um jeito que a lista simplificada não consegue reabrir pra
  // edição -- em vez de só um aviso, mostra o que a orquestração faz AGORA
  // (ver conversa com o usuário: "não quero isso, quero que atualize").
  const [unsupportedPreview, setUnsupportedPreview] = useState<ReturnType<typeof buildStepPreview>>([]);
  // Objetivo de conversão (ver conversa com o usuário) -- '' = sem objetivo
  // definido, card não mostra conversão nenhuma.
  const [goalTagId, setGoalTagId] = useState<string>('');
  const [savingGoal, setSavingGoal] = useState(false);

  const hasAgentStep = stepDrafts.some((s) => s.type === 'agent');
  // Caminho "do zero": workspace precisa ser resolvido ANTES de montar as
  // etapas, pra filtrar tags/pipelines só do workspace escolhido (ver
  // conversa com o usuário: "tem que mostrar apenas tags daquele workspace").
  const goToStepsViaWorkspace = () => {
    if (availableWorkspaces.length > 1) {
      setStep('workspace');
    } else {
      setWorkspaceId(availableWorkspaces[0]?.id || '');
      setStep('steps');
    }
  };

  // Tags/pipelines restritos ao workspace já escolhido (nulo/global some pra
  // fora da lista assim que um workspace é escolhido).
  const scopedTags = workspaceId ? tags.filter((t) => !t.workspace_id || t.workspace_id === workspaceId) : tags;
  const scopedPipelines = workspaceId
    ? pipelinesWithColumns.filter((p) => !p.pipeline.workspace_ids?.length || p.pipeline.workspace_ids.includes(workspaceId))
    : pipelinesWithColumns;

  useEffect(() => {
    if (!open || isEditMode) return;
    setStep(template ? (availableWorkspaces.length > 1 ? 'workspace' : 'applying') : 'name');
    setOrchestrationName('');
    setStepDrafts([]);
    setWorkspaceId(availableWorkspaces.length === 1 ? availableWorkspaces[0].id : '');
    setInstanceId(null);
    setCampaignId(null);
    setTriggerKeyword('');
    setColliding([]);
    setEditFlowId(null);
    setGoalTagId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id, isEditMode]);

  // Modo de edição: carrega o estado ATUAL da instância (fluxo+campanha) e
  // tenta reconstruir a lista de etapas a partir do grafo. Se o grafo não bate
  // com o formato que o próprio wizard gera (editado à mão no Flow Builder
  // além do que a lista representa), cai pro estado "unsupported" em vez de
  // arriscar reconstruir errado.
  useEffect(() => {
    if (!open || !editInstanceId) return;
    setStep('loading');
    (async () => {
      const { data: instance, error: instanceError } = await supabase
        .from('agent_instances' as any)
        .select('id, flow_id, campaign_id, goal_tag_id')
        .eq('id', editInstanceId)
        .maybeSingle();
      if (instanceError || !instance) {
        toast({ title: 'Erro ao carregar orquestração', description: instanceError?.message, variant: 'destructive' });
        onOpenChange(false);
        return;
      }
      const flowId = (instance as any).flow_id as string;
      const campaignIdValue = (instance as any).campaign_id as string | null;

      const [{ data: flow, error: flowError }, campaignResult] = await Promise.all([
        supabase.from('flows').select('name, nodes, edges, workspace_id').eq('id', flowId).maybeSingle(),
        campaignIdValue
          ? supabase.from('campaigns').select('trigger_keyword').eq('id', campaignIdValue).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (flowError || !flow) {
        toast({ title: 'Erro ao carregar fluxo', description: flowError?.message, variant: 'destructive' });
        onOpenChange(false);
        return;
      }

      const parsed = parseFlowToSteps((flow as any).nodes || [], (flow as any).edges || []);
      setInstanceId(editInstanceId);
      setCampaignId(campaignIdValue);
      setOrchestrationName((flow as any).name || '');
      setWorkspaceId((flow as any).workspace_id || '');
      setTriggerKeyword((campaignResult as any)?.data?.trigger_keyword || '');
      setEditFlowId(flowId);
      setGoalTagId((instance as any).goal_tag_id || '');

      if (!parsed) {
        setUnsupportedPreview(buildStepPreview((flow as any).nodes || [], (flow as any).edges || []));
        setStep('unsupported');
        return;
      }
      setStepDrafts(parsed);
      setStep('steps');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editInstanceId]);

  const addStep = (type: StepType) => setStepDrafts((prev) => [...prev, makeEmptyStep(type)]);
  const updateStep = (key: string, patch: Partial<StepDraft>) =>
    setStepDrafts((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const removeStep = (key: string) => setStepDrafts((prev) => prev.filter((s) => s.key !== key));
  const moveStep = (key: string, direction: -1 | 1) =>
    setStepDrafts((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      const target = idx + direction;
      if (idx === -1 || target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });

  useEffect(() => {
    if (step !== 'applying') return;
    (async () => {
      const tagRef = (id: string) => {
        const t = tags.find((x) => x.id === id);
        return t ? { id: t.id, name: t.name } : undefined;
      };
      const pipelineRef = (target: PipelineTarget) => {
        if (!target.pipelineId || !target.columnId) return undefined;
        const entry = pipelinesWithColumns.find((p) => p.pipeline.id === target.pipelineId);
        const column = entry?.columns.find((c) => c.id === target.columnId);
        if (!entry || !column) return undefined;
        return { id: target.pipelineId, name: entry.pipeline.name, columnId: target.columnId, columnName: column.name };
      };

      const routingEntry = (routing: OutcomeRoutingDraft | undefined) => {
        const entry: any = { continue: routing?.continueFlag !== false };
        if (routing?.pipeline) {
          const p = pipelineRef(routing.pipeline);
          if (p) entry.pipeline = p;
        }
        if (routing?.tagId) {
          const t = tagRef(routing.tagId);
          if (t) entry.tag = t;
        }
        return entry;
      };

      const steps = template ? undefined : stepDrafts.map((s) => {
        if (s.type === 'tag') return { type: 'tag', tag: tagRef(s.tagId) };
        if (s.type === 'pipeline') return { type: 'pipeline', pipeline: pipelineRef(s.pipeline) };
        if (s.type === 'transfer') return { type: 'transfer' };
        if (s.type === 'delay') return { type: 'delay', delaySeconds: s.delayAmount * DELAY_UNIT_SECONDS[s.delayUnit] };
        if (s.type === 'flow') {
          return {
            type: 'flow',
            flowId: s.flowId,
            flowName: existingFlows.find((f) => f.id === s.flowId)?.name,
            waitForResponse: s.waitForResponse,
            ...(s.waitForResponse ? {
              remarketingSteps: s.remarketingSteps.filter((r) => r.message.trim()).map((r) => ({ message: r.message.trim(), delayMinutes: r.delayMinutes })),
              remarketingContext: s.remarketingContext || undefined,
              remarketingQuietHours: s.remarketingQuietHours,
              remarketingQuietStart: s.remarketingQuietHours ? s.remarketingQuietStart : undefined,
              routing: { responded: routingEntry(s.flowRouting.responded), timeout: routingEntry(s.flowRouting.timeout) },
            } : {}),
          };
        }
        // agent
        const outcomes = stepOutcomes(s);
        const outcomeRouting = outcomes.length
          ? Object.fromEntries(outcomes.map((o) => [o, routingEntry(s.outcomeRouting[o])]))
          : undefined;
        return {
          type: 'agent',
          ...(s.agentMode === 'existing'
            ? { agentId: s.agentId, agentName: existingAgents.find((a) => a.id === s.agentId)?.name }
            : { newAgent: { name: s.newAgentName.trim(), functionRole: s.newAgentFunctionRole, promptBase: s.newAgentPromptBase } }),
          additionalPrompt: s.additionalPrompt || undefined,
          outcomes,
          outcomeRouting,
          outcomeDefaultTransfer: s.outcomeDefaultTransfer || undefined,
        };
      });

      const { data, error } = await supabase.functions.invoke('apply-agent-template', {
        body: isEditMode
          ? { action: 'update_orchestration', instanceId, name: orchestrationName.trim(), workspaceId: workspaceId || null, steps, triggerKeyword }
          : template
            ? { action: 'apply', templateId: template.id, workspaceId: workspaceId || null }
            : { action: 'apply', name: orchestrationName.trim(), workspaceId: workspaceId || null, steps },
      });
      if (error || data?.error) {
        toast({ title: isEditMode ? 'Erro ao salvar orquestração' : 'Erro ao criar orquestração', description: error?.message || data?.error, variant: 'destructive' });
        onOpenChange(false);
        return;
      }
      if (isEditMode) {
        setColliding(data.collidingCampaigns || []);
      } else {
        setInstanceId(data.instance.id);
        setCampaignId(data.campaign.id);
        setTriggerKeyword(data.campaign.trigger_keyword);
        setColliding(data.collidingCampaigns || []);
      }
      setStep('review');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const recheckKeyword = async () => {
    if (!instanceId || !triggerKeyword.trim()) return;
    setCheckingKeyword(true);
    try {
      const { data, error } = await supabase.functions.invoke('apply-agent-template', {
        body: { action: 'check_keyword', instanceId, triggerKeyword },
      });
      if (error || data?.error) {
        toast({ title: 'Erro ao checar gatilho', description: error?.message || data?.error, variant: 'destructive' });
        return;
      }
      setColliding(data.collidingCampaigns || []);
    } finally {
      setCheckingKeyword(false);
    }
  };

  const saveGoalTag = async () => {
    if (!instanceId) return;
    setSavingGoal(true);
    const { data, error } = await supabase.functions.invoke('apply-agent-template', {
      body: { action: 'set_goal_tag', instanceId, goalTagId: goalTagId || null },
    });
    setSavingGoal(false);
    if (error || data?.error) {
      toast({ title: 'Erro ao salvar objetivo', description: error?.message || data?.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Objetivo salvo', description: goalTagId ? 'A conversão passa a ser calculada por essa tag.' : 'Objetivo removido -- a conversão deixa de ser mostrada.' });
  };

  const activate = async () => {
    if (!instanceId) return;
    setStep('activating');
    const { data, error } = await supabase.functions.invoke('apply-agent-template', {
      body: { action: 'activate', instanceId },
    });
    if (error || data?.error) {
      toast({ title: 'Erro ao ativar', description: error?.message || data?.error, variant: 'destructive' });
      setStep('review');
      return;
    }
    toast({
      title: isEditMode ? 'Orquestração atualizada' : 'Agente ativado',
      description: isEditMode
        ? 'As alterações estão salvas e a campanha está ativa.'
        : template
          ? 'O template está aplicado e a campanha está ativa.'
          : 'A orquestração está pronta e a campanha está ativa.',
    });
    onOpenChange(false);
    onApplied?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Editar orquestração' : template ? `Aplicar template: ${template.name}` : 'Criar orquestração'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Ajuste as etapas -- as mudanças atualizam o fluxo e a campanha já existentes, sem criar nada novo.'
              : template
                ? 'Isso cria um fluxo, um agente e uma campanha novos pra sua organização, a partir deste template.'
                : 'Monte a sequência de etapas -- um ou mais agentes de IA, com tags, movimentações de pipeline etc. -- e ela vira um fluxo e uma campanha reais, prontos pra testar e ativar.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            Carregando orquestração...
          </div>
        )}

        {step === 'unsupported' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Essa orquestração foi personalizada direto no construtor de fluxos completo (ramificações que essa lista
              simplificada não edita com segurança). Aqui está o que ela faz agora, atualizado -- pra ajustar, use o Flow Builder.
            </p>
            <div className="max-h-[45vh] overflow-y-auto pr-1 space-y-2">
              {unsupportedPreview.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Esse fluxo ainda não tem etapas desenhadas.</p>
              )}
              {unsupportedPreview.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={i} className="flex items-start gap-2.5 rounded-lg border border-border/50 p-2.5">
                    <div className="w-6 h-6 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="h-3.5 w-3.5 text-violet-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{s.label}</p>
                      {s.subtitle && <p className="text-xs text-muted-foreground truncate">{s.subtitle}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button onClick={() => { onOpenChange(false); if (editFlowId) navigate(`/flows/${editFlowId}`); }}>
                Abrir no Flow Builder
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'name' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="orchestration-name">Nome da orquestração</Label>
              <Input
                id="orchestration-name"
                placeholder="Ex.: Auxílio Reclusão"
                value={orchestrationName}
                onChange={(e) => setOrchestrationName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Vira o nome do fluxo e da campanha. Cada agente que você adicionar na próxima etapa tem seu próprio nome.</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button disabled={!orchestrationName.trim()} onClick={goToStepsViaWorkspace}>Continuar</Button>
            </DialogFooter>
          </div>
        )}

        {step === 'steps' && (
          <div className="space-y-3 py-2">
            <div className="max-h-[55vh] overflow-y-auto pr-1 space-y-3">
              {stepDrafts.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhuma etapa ainda. Adicione ao menos uma etapa de "Agente de IA" pra essa orquestração funcionar.
                </p>
              )}
              {stepDrafts.map((s, i) => (
                <StepCard
                  key={s.key}
                  step={s}
                  index={i}
                  total={stepDrafts.length}
                  tags={scopedTags}
                  pipelines={scopedPipelines}
                  agents={existingAgents}
                  flows={existingFlows}
                  organizationId={organizationId}
                  onChange={(patch) => updateStep(s.key, patch)}
                  onRemove={() => removeStep(s.key)}
                  onMove={(dir) => moveStep(s.key, dir)}
                />
              ))}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full border-dashed">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar etapa
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {(Object.keys(STEP_TYPE_META) as StepType[]).map((t) => {
                  const Icon = STEP_TYPE_META[t].icon;
                  return (
                    <DropdownMenuItem key={t} onClick={() => addStep(t)}>
                      <Icon className="h-4 w-4 mr-2 text-violet-500" />
                      {STEP_TYPE_META[t].label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => (isEditMode ? onOpenChange(false) : setStep(availableWorkspaces.length > 1 ? 'workspace' : 'name'))}
              >
                {isEditMode ? 'Cancelar' : 'Voltar'}
              </Button>
              <Button disabled={!hasAgentStep} onClick={() => setStep('applying')}>Continuar</Button>
            </DialogFooter>
          </div>
        )}

        {step === 'workspace' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Workspace</Label>
              <Select value={workspaceId} onValueChange={setWorkspaceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o workspace..." />
                </SelectTrigger>
                <SelectContent>
                  {availableWorkspaces.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O número de WhatsApp e o pipeline usados serão os já configurados para esse workspace.
                {!template && ' As tags e pipelines disponíveis na próxima etapa também são só desse workspace.'}
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => (template ? onOpenChange(false) : setStep('name'))}>
                {template ? 'Cancelar' : 'Voltar'}
              </Button>
              <Button disabled={!workspaceId} onClick={() => setStep(template ? 'applying' : 'steps')}>Continuar</Button>
            </DialogFooter>
          </div>
        )}

        {(step === 'applying' || step === 'activating') && (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            {step === 'applying' ? (isEditMode ? 'Salvando alterações...' : 'Criando fluxo, agente(s) e campanha...') : 'Ativando...'}
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {isEditMode ? 'Alterações salvas. Confira a palavra-chave antes de confirmar.' : 'Criado como rascunho. Confira a palavra-chave que vai disparar esse atendimento antes de ativar.'}
            </p>
            <div className="space-y-2">
              <Label htmlFor="trigger-keyword">Palavra-chave de gatilho</Label>
              <div className="flex gap-2">
                <Input
                  id="trigger-keyword"
                  value={triggerKeyword}
                  onChange={(e) => setTriggerKeyword(e.target.value)}
                />
                <Button variant="outline" size="sm" onClick={recheckKeyword} disabled={checkingKeyword}>
                  {checkingKeyword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Checar'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-tag">Objetivo de conversão (opcional)</Label>
              <div className="flex gap-2">
                <Select value={goalTagId || 'none'} onValueChange={(v) => setGoalTagId(v === 'none' ? '' : v)}>
                  <SelectTrigger id="goal-tag">
                    <SelectValue placeholder="Sem objetivo definido" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem objetivo definido</SelectItem>
                    {scopedTags.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={saveGoalTag} disabled={savingGoal}>
                  {savingGoal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Quando um contato que passou por essa orquestração recebe essa tag, conta como conversão -- é isso que aparece no card em "Meus agentes" e na galeria.
              </p>
            </div>

            {colliding.length > 0 && (
              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Esse gatilho já está em uso.</p>
                  <p className="mt-1">
                    {colliding.map((c) => c.name).join(', ')} já {colliding.length > 1 ? 'usam' : 'usa'} uma palavra-chave parecida —
                    seus leads podem se misturar entre as campanhas. Você pode trocar a palavra-chave acima, ou ativar mesmo assim.
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => { onOpenChange(false); if (isEditMode) onApplied?.(); }}>{isEditMode ? 'Fechar' : 'Deixar como rascunho'}</Button>
              <Button onClick={activate}>{isEditMode ? 'Confirmar' : colliding.length > 0 ? 'Ativar mesmo assim' : 'Ativar'}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
