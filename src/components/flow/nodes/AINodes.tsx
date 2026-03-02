import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Bot, IterationCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AINodeData extends Record<string, unknown> {
  label?: string;
  agentName?: string;
  contextMessage?: string;
  returnToNode?: string;
}

type AINode = Node<AINodeData>;

export function AIHandoffNode({ data, selected }: NodeProps<AINode>) {
  return (
    <div
      className={cn(
        "group relative min-w-[220px] rounded-xl bg-card shadow-lg border-2 transition-all overflow-visible",
        selected ? 'border-violet-500 ring-2 ring-violet-400/30' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-violet-500 !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-left-1.5"
      />

      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-violet-500 to-purple-600 rounded-t-[10px]">
        <Bot className="h-4 w-4 text-white" />
        <span className="font-medium text-sm text-white">Transbordo IA</span>
        <Sparkles className="h-3 w-3 text-white/70 ml-auto" />
      </div>

      <div className="p-3 bg-card rounded-b-[10px] space-y-2">
        <p className="text-xs text-muted-foreground">
          Agente: <span className="font-medium text-foreground">{data.agentName || 'Selecionar...'}</span>
        </p>
        {data.contextMessage && (
          <p className="text-xs text-muted-foreground italic">
            "{data.contextMessage}"
          </p>
        )}
        <div className="flex items-center gap-1.5 text-[10px] text-violet-600 dark:text-violet-400">
          <Sparkles className="h-3 w-3" />
          <span>A IA assumirá a conversa</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-violet-500 !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-right-1.5"
      />
    </div>
  );
}

export function AIMasterNode({ data, selected }: NodeProps<AINode>) {
  return (
    <div
      className={cn(
        "group relative min-w-[240px] rounded-xl bg-card shadow-lg border-2 transition-all overflow-visible",
        selected ? 'border-indigo-500 ring-2 ring-indigo-400/30' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-left-1.5"
      />

      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-t-[10px]">
        <Bot className="h-4 w-4 text-white" />
        <span className="font-medium text-sm text-white">Agente Master</span>
        <Sparkles className="h-3 w-3 text-white/70 ml-auto" />
      </div>

      <div className="p-3 bg-card rounded-b-[10px] space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Orquestrador Ativo
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground line-clamp-2 italic">
          {typeof data.prompt === 'string' ? `"${data.prompt.substring(0, 60)}..."` : 'Sem prompt configurado'}
        </p>
        <div className="pt-1 flex flex-wrap gap-1">
          <div className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[9px] font-medium border border-indigo-500/20">
            Inteligência Superior
          </div>
          <div className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[9px] font-medium border border-blue-500/20">
            Nicho: {String(data.niche || 'Geral')}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-right-1.5"
      />
    </div>
  );
}

export function AIReturnNode({ data, selected }: NodeProps<AINode>) {
  return (
    <div
      className={cn(
        "group relative min-w-[200px] rounded-xl bg-card shadow-lg border-2 transition-all overflow-visible",
        selected ? 'border-fuchsia-500 ring-2 ring-fuchsia-400/30' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-fuchsia-500 !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-left-1.5"
      />

      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-fuchsia-500 to-pink-600 rounded-t-[10px]">
        <IterationCw className="h-4 w-4 text-white" />
        <span className="font-medium text-sm text-white">Retorno do Fluxo</span>
      </div>

      <div className="p-3 bg-card rounded-b-[10px] space-y-2">
        <p className="text-xs text-muted-foreground">
          A IA retorna o controle para o fluxo
        </p>
        {data.returnToNode && (
          <p className="text-xs text-muted-foreground">
            Continuar em: <span className="font-medium text-foreground">{data.returnToNode}</span>
          </p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-fuchsia-500 !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-right-1.5"
      />
    </div>
  );
}
