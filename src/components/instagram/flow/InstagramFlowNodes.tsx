import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Clock,
  GitBranch,
  Instagram,
  MessageSquare,
  MousePointerClick,
  Tag,
  UserCheck,
  Webhook,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Nós do construtor de fluxos do Instagram.
 *
 * Só existem aqui os tipos que o canal realmente suporta — é o que evita
 * desenhar um fluxo que não pode rodar. O motor (instagram-flow-execute)
 * entende exatamente esta lista.
 */

const targetHandleClass =
  '!w-3 !h-3 !bg-background !border-2 !border-muted-foreground !-left-1.5';
const sourceHandleClass =
  '!w-3 !h-3 !bg-background !border-2 !border-primary !-right-1.5';

function NodeShell({
  selected,
  children,
  accent,
}: {
  selected?: boolean;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div
      className={cn(
        'group relative min-w-[200px] max-w-[280px] rounded-xl bg-card shadow-lg border-2 transition-all',
        selected ? 'border-primary ring-2 ring-primary/30' : accent || 'border-border',
      )}
    >
      {children}
    </div>
  );
}

function NodeHeader({
  icon: Icon,
  title,
  tone = 'text-primary',
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2">
      <Icon className={cn('h-4 w-4 shrink-0', tone)} />
      <span className="truncate text-sm font-semibold">{title}</span>
    </div>
  );
}

export function IgStartNode({ selected }: NodeProps) {
  return (
    <div
      className={cn(
        'group relative rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 px-4 py-3 shadow-lg border-2 transition-all',
        selected ? 'border-white ring-2 ring-fuchsia-400' : 'border-fuchsia-400/50',
      )}
    >
      <div className="flex items-center gap-2 text-white">
        <Instagram className="h-4 w-4" />
        <span className="text-sm font-semibold">Quando o gatilho acontecer</span>
      </div>
      <Handle type="source" position={Position.Right} className={sourceHandleClass} />
    </div>
  );
}

export function IgMessageNode({ data, selected }: NodeProps) {
  const text = String((data as any)?.text || '');
  const buttonUrl = String((data as any)?.buttonUrl || '');
  const quickReplies = ((data as any)?.quickReplies || []) as Array<{ label: string }>;

  return (
    <NodeShell selected={selected}>
      <Handle type="target" position={Position.Left} className={targetHandleClass} />
      <NodeHeader icon={MessageSquare} title="Enviar mensagem" />
      <div className="space-y-1.5 px-3 py-2">
        <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
          {text || 'Sem texto ainda'}
        </p>
        {!!quickReplies.length && (
          <div className="flex flex-wrap gap-1">
            {quickReplies.slice(0, 3).map((q, i) => (
              <span key={i} className="rounded-full border border-[#0095f6] px-2 py-0.5 text-[10px] text-[#0095f6]">
                {q.label}
              </span>
            ))}
          </div>
        )}
        {!quickReplies.length && !!buttonUrl && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <MousePointerClick className="h-3 w-3" />
            botão de link
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} className={sourceHandleClass} />
    </NodeShell>
  );
}

export function IgDelayNode({ data, selected }: NodeProps) {
  const value = (data as any)?.waitValue ?? 1;
  const unit = String((data as any)?.waitUnit || 'minutes');
  const unitLabel = unit === 'seconds' ? 'segundo(s)'
    : unit === 'hours' ? 'hora(s)'
    : unit === 'days' ? 'dia(s)'
    : 'minuto(s)';

  return (
    <NodeShell selected={selected}>
      <Handle type="target" position={Position.Left} className={targetHandleClass} />
      <NodeHeader icon={Clock} title="Esperar" tone="text-amber-500" />
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {value} {unitLabel}
      </div>
      <Handle type="source" position={Position.Right} className={sourceHandleClass} />
    </NodeShell>
  );
}

/**
 * Espera a pessoa responder. Duas saídas, porque o fluxo precisa continuar
 * mesmo quando ninguém responde — que é o caso mais comum.
 */
export function IgUserInputNode({ data, selected }: NodeProps) {
  const timeoutMinutes = Number((data as any)?.timeoutMinutes || 0);

  return (
    <NodeShell selected={selected}>
      <Handle type="target" position={Position.Left} className={targetHandleClass} />
      <NodeHeader icon={MousePointerClick} title="Esperar resposta" tone="text-blue-500" />
      <div className="space-y-2 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          Guarda o que a pessoa escrever em <code className="text-[10px]">ultima_resposta</code>
        </p>
        <div className="space-y-1.5">
          <div className="relative flex items-center justify-end gap-1.5 pr-1">
            <span className="text-[10px] font-medium text-green-600">respondeu</span>
            <Handle
              type="source"
              id="replied"
              position={Position.Right}
              style={{ position: 'relative', transform: 'none', right: 0, top: 0 }}
              className="!static !w-3 !h-3 !bg-background !border-2 !border-green-500"
            />
          </div>
          <div className="relative flex items-center justify-end gap-1.5 pr-1">
            <span className="text-[10px] font-medium text-muted-foreground">
              {timeoutMinutes > 0 ? `sem resposta em ${timeoutMinutes}min` : 'sem resposta'}
            </span>
            <Handle
              type="source"
              id="timeout"
              position={Position.Right}
              style={{ position: 'relative', transform: 'none', right: 0, top: 0 }}
              className="!static !w-3 !h-3 !bg-background !border-2 !border-muted-foreground"
            />
          </div>
        </div>
        {timeoutMinutes <= 0 && (
          <p className="text-[10px] text-amber-600">
            Sem prazo definido, a saída “sem resposta” nunca dispara.
          </p>
        )}
      </div>
    </NodeShell>
  );
}

export function IgConditionNode({ data, selected }: NodeProps) {
  const kind = String((data as any)?.conditionType || 'variable');
  const label = kind === 'has_tag' ? `Tem a etiqueta “${(data as any)?.tag || '—'}”`
    : kind === 'clicked_link' ? 'Clicou no último link'
    : `${(data as any)?.variable || 'variável'} ${(data as any)?.operator === 'equals' ? 'é igual a' : 'contém'} “${(data as any)?.value || ''}”`;

  return (
    <NodeShell selected={selected}>
      <Handle type="target" position={Position.Left} className={targetHandleClass} />
      <NodeHeader icon={GitBranch} title="Se / então" tone="text-violet-500" />
      <div className="space-y-2 px-3 py-2">
        <p className="line-clamp-2 text-xs text-muted-foreground">{label}</p>
        <div className="space-y-1.5">
          <div className="relative flex items-center justify-end gap-1.5 pr-1">
            <span className="text-[10px] font-medium text-green-600">sim</span>
            <Handle
              type="source"
              id="true"
              position={Position.Right}
              style={{ position: 'relative', transform: 'none', right: 0, top: 0 }}
              className="!static !w-3 !h-3 !bg-background !border-2 !border-green-500"
            />
          </div>
          <div className="relative flex items-center justify-end gap-1.5 pr-1">
            <span className="text-[10px] font-medium text-destructive">não</span>
            <Handle
              type="source"
              id="false"
              position={Position.Right}
              style={{ position: 'relative', transform: 'none', right: 0, top: 0 }}
              className="!static !w-3 !h-3 !bg-background !border-2 !border-destructive"
            />
          </div>
        </div>
      </div>
    </NodeShell>
  );
}

export function IgTagNode({ data, selected }: NodeProps) {
  return (
    <NodeShell selected={selected}>
      <Handle type="target" position={Position.Left} className={targetHandleClass} />
      <NodeHeader icon={Tag} title="Adicionar etiqueta" tone="text-emerald-500" />
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {(data as any)?.tag || 'Sem etiqueta definida'}
      </div>
      <Handle type="source" position={Position.Right} className={sourceHandleClass} />
    </NodeShell>
  );
}

export function IgTransferNode({ selected }: NodeProps) {
  return (
    <NodeShell selected={selected}>
      <Handle type="target" position={Position.Left} className={targetHandleClass} />
      <NodeHeader icon={UserCheck} title="Passar para atendente" tone="text-orange-500" />
      <div className="px-3 py-2 text-xs text-muted-foreground">
        A conversa sai do modo automático.
      </div>
      <Handle type="source" position={Position.Right} className={sourceHandleClass} />
    </NodeShell>
  );
}

export function IgWebhookNode({ data, selected }: NodeProps) {
  return (
    <NodeShell selected={selected}>
      <Handle type="target" position={Position.Left} className={targetHandleClass} />
      <NodeHeader icon={Webhook} title="Chamar sistema externo" tone="text-slate-500" />
      <div className="truncate px-3 py-2 text-xs text-muted-foreground">
        {(data as any)?.url || 'Sem endereço definido'}
      </div>
      <Handle type="source" position={Position.Right} className={sourceHandleClass} />
    </NodeShell>
  );
}

export const instagramNodeTypes = {
  start: IgStartNode,
  'ig-message': IgMessageNode,
  'ig-delay': IgDelayNode,
  'ig-user-input': IgUserInputNode,
  'ig-condition': IgConditionNode,
  'ig-action-tag': IgTagNode,
  'ig-action-transfer': IgTransferNode,
  'ig-action-webhook': IgWebhookNode,
};
