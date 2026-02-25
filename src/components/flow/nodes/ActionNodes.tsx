import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Tag, Kanban, UserPlus, Clock, Webhook } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionNodeData extends Record<string, unknown> {
  label?: string;
  tagName?: string;
  action?: string;
  pipelineColumn?: string;
  agentName?: string;
  duration?: number;
  unit?: string;
  webhookUrl?: string;
}

type ActionNode = Node<ActionNodeData>;

function BaseActionNode({ 
  selected, 
  icon: Icon, 
  color, 
  title, 
  children 
}: { 
  selected: boolean; 
  icon: React.ComponentType<{ className?: string }>; 
  color: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div 
      className={cn(
        "group relative min-w-[180px] max-w-[240px] rounded-xl bg-card shadow-lg border-2 transition-all overflow-visible",
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-left-1.5"
      />
      
      <div className={cn("flex items-center gap-2 px-3 py-2 rounded-t-[10px]", color)}>
        <Icon className="h-4 w-4 text-white" />
        <span className="font-medium text-sm text-white">{title}</span>
      </div>
      
      <div className="p-3 bg-card rounded-b-[10px]">
        {children}
      </div>
      
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-right-1.5"
      />
    </div>
  );
}

export function TagActionNode({ data, selected }: NodeProps<ActionNode>) {
  return (
    <BaseActionNode selected={!!selected} icon={Tag} color="bg-amber-500" title="Atribuir Tag">
      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          {data.action === 'remove' ? '−' : '+'} {data.tagName || 'tag'}
        </span>
      </div>
    </BaseActionNode>
  );
}

export function PipelineActionNode({ data, selected }: NodeProps<ActionNode>) {
  return (
    <BaseActionNode selected={!!selected} icon={Kanban} color="bg-green-500" title="Mover Pipeline">
      <p className="text-xs text-muted-foreground">
        Mover para: <span className="font-medium text-foreground">{data.pipelineColumn || 'Selecionar...'}</span>
      </p>
    </BaseActionNode>
  );
}

export function TransferActionNode({ data, selected }: NodeProps<ActionNode>) {
  return (
    <BaseActionNode selected={!!selected} icon={UserPlus} color="bg-rose-500" title="Transferir">
      <p className="text-xs text-muted-foreground">
        Para: <span className="font-medium text-foreground">{data.agentName || 'Selecionar agente...'}</span>
      </p>
    </BaseActionNode>
  );
}

export function DelayActionNode({ data, selected }: NodeProps<ActionNode>) {
  return (
    <BaseActionNode selected={!!selected} icon={Clock} color="bg-slate-500" title="Pausa">
      <p className="text-xs text-muted-foreground">
        Aguardar: <span className="font-medium text-foreground">
          {data.duration || 3} {data.unit || 'segundos'}
        </span>
      </p>
    </BaseActionNode>
  );
}

export function WebhookActionNode({ data, selected }: NodeProps<ActionNode>) {
  return (
    <BaseActionNode selected={!!selected} icon={Webhook} color="bg-orange-500" title="Webhook">
      <p className="text-xs text-muted-foreground truncate">
        {data.webhookUrl || 'Configurar URL...'}
      </p>
    </BaseActionNode>
  );
}
