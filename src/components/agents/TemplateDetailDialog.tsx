import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Tag, Kanban, Users, Clock, Bot, Workflow, GitBranch, Mic } from 'lucide-react';
import { useAgentTemplateDetail } from '@/hooks/useAgentTemplates';
import { AGENT_FUNCTION_ROLES } from '@/hooks/useAIAgents';
import { findRecordedMedia, recordedMediaMessage } from '@/lib/templateMediaCheck';

// Preview SOMENTE LEITURA das etapas de um template -- v1 do "clicar num
// template pra ver dentro" (ver conversa com o usuário). Deliberadamente NÃO
// reaproveita o parser estrito de ApplyTemplateWizard.tsx (que precisa
// reconstruir um StepDraft editável e por isso desiste em grafos que não
// batem exatamente com o formato do wizard) -- aqui é só exibição, então faz
// uma varredura tolerante (BFS a partir do "start", cada nó uma vez) e lê os
// nomes já embutidos no próprio node.data (tagName, pipelineName, agentName,
// flowName) em vez de resolver ids via hooks -- funciona também pra
// templates de outra organização, onde as tags/pipelines originais nem
// seriam visíveis por RLS. Funil/conversão por etapa e o testador ficam pra
// uma fase futura (não há hoje nenhum registro de "por onde os leads
// passaram" pra calcular isso).
const NODE_TYPE_META: Record<string, { label: string; icon: typeof Tag }> = {
  'action-tag': { label: 'Atribuir Tag', icon: Tag },
  'action-pipeline': { label: 'Mover Pipeline', icon: Kanban },
  'action-transfer': { label: 'Transferir', icon: Users },
  'action-delay': { label: 'Aguardar', icon: Clock },
  'action-flow': { label: 'Iniciar Fluxo', icon: Workflow },
  'ai-handoff': { label: 'Agente de IA', icon: Bot },
  condition: { label: 'Condição', icon: GitBranch },
};

function humanizeDelay(totalSeconds: number): string {
  if (totalSeconds % 86400 === 0) return `${totalSeconds / 86400} dia(s)`;
  if (totalSeconds % 3600 === 0) return `${totalSeconds / 3600} hora(s)`;
  if (totalSeconds % 60 === 0) return `${totalSeconds / 60} minuto(s)`;
  return `${totalSeconds} segundo(s)`;
}

function describeNode(node: any): { label: string; subtitle: string; icon: typeof Tag } {
  const meta = NODE_TYPE_META[node.type] || { label: node.data?.label || node.type, icon: Tag };
  const data = node.data || {};
  switch (node.type) {
    case 'action-tag':
      return { ...meta, subtitle: data.tagName ? `Marca "${data.tagName}"` : '' };
    case 'action-pipeline':
      return { ...meta, subtitle: [data.pipelineName, data.pipelineColumnName].filter(Boolean).join(' → ') };
    case 'action-delay':
      return { ...meta, subtitle: humanizeDelay(Number(data.delaySeconds) || 60) };
    case 'action-flow':
      return { ...meta, subtitle: `${data.flowName || ''}${data.waitForResponse ? ' · aguarda resposta do cliente' : ' · disparo direto'}`.trim() };
    case 'ai-handoff': {
      const outcomes = String(data.expectedOutcomes || '').split(',').map((o: string) => o.trim()).filter(Boolean);
      return { ...meta, subtitle: `${data.agentName || 'Agente'}${outcomes.length ? ` · resultados: ${outcomes.join(', ')}` : ''}` };
    }
    case 'condition':
      return { ...meta, subtitle: data.conditionLabel || '' };
    default:
      return { ...meta, subtitle: '' };
  }
}

export function buildStepPreview(nodes: any[], edges: any[]) {
  if (!nodes?.length) return [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const start = nodes.find((n) => n.type === 'start');
  const visited = new Set<string>();
  const order: any[] = [];
  const queue: string[] = start ? [start.id] : [nodes[0].id];
  visited.add(queue[0]);

  while (queue.length) {
    const id = queue.shift()!;
    const node = nodeById.get(id);
    if (node && node.type !== 'start') order.push(node);
    const outs = edges.filter((e) => e.source === id);
    for (const e of outs) {
      if (!visited.has(e.target)) {
        visited.add(e.target);
        queue.push(e.target);
      }
    }
  }
  return order.map(describeNode);
}

interface TemplateDetailDialogProps {
  templateId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply?: (templateId: string) => void;
}

export function TemplateDetailDialog({ templateId, open, onOpenChange, onApply }: TemplateDetailDialogProps) {
  const { data: detail, isLoading } = useAgentTemplateDetail(templateId);
  const steps = detail ? buildStepPreview(detail.flowSnapshot.nodes || [], detail.flowSnapshot.edges || []) : [];
  const mediaWarning = detail ? recordedMediaMessage(findRecordedMedia(detail.flowSnapshot.nodes)) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{detail?.name || 'Template'}</DialogTitle>
          <DialogDescription>{detail?.description || 'Visualização das etapas deste template.'}</DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            Carregando...
          </div>
        )}

        {!isLoading && detail && (
          <div className="space-y-3 py-2">
            {detail.category && <Badge variant="secondary">{detail.category}</Badge>}

            {mediaWarning && (
              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <Mic className="h-4 w-4 shrink-0" />
                <p>{mediaWarning}</p>
              </div>
            )}

            {/* Agente principal (agent_snapshot) -- é a única forma de saber "qual
                agente está nesse template" quando o fluxo ainda não tem etapas
                desenhadas, ou pra ver o prompt sem precisar caçar dentro de um
                passo "Agente de IA" lá embaixo (ver conversa com o usuário). */}
            <div className="rounded-lg border border-border/50 p-3 space-y-1.5 bg-muted/30">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-violet-500 shrink-0" />
                <span className="text-sm font-medium">
                  {AGENT_FUNCTION_ROLES.find((r) => r.value === detail.agentSnapshot.function_role)?.label || detail.agentSnapshot.function_role || 'Agente'}
                </span>
              </div>
              {detail.agentSnapshot.persona && (
                <p className="text-xs text-muted-foreground">{detail.agentSnapshot.persona}</p>
              )}
              {detail.agentSnapshot.prompt_base && (
                <p className="text-xs text-muted-foreground line-clamp-3">{detail.agentSnapshot.prompt_base}</p>
              )}
            </div>

            <div className="max-h-[50vh] overflow-y-auto pr-1 space-y-2">
              {steps.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Este template ainda não tem um fluxo desenhado.
                </p>
              )}
              {steps.map((s, i) => {
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
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          {onApply && templateId && (
            <Button onClick={() => { onOpenChange(false); onApply(templateId); }}>Aplicar template</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
