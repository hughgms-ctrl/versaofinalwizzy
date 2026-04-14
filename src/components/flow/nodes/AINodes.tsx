import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Bot, IterationCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AINodeData extends Record<string, unknown> {
  label?: string;
  agentName?: string;
  contextMessage?: string;
  returnToNode?: string;
  expectedOutcomes?: string;
  outcomes?: string[];
}

type AINode = Node<AINodeData>;

// Parse outcomes from comma-separated string or array
function getOutcomes(data: AINodeData): string[] {
  if (Array.isArray(data.outcomes) && data.outcomes.length > 0) return data.outcomes;
  const raw = data.expectedOutcomes;
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export function AIHandoffNode({ data, selected }: NodeProps<AINode>) {
  const outcomes = getOutcomes(data);
  const hasOutcomes = outcomes.length > 0;

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
        <span className="font-medium text-sm text-white">Agente IA</span>
        <Sparkles className="h-3 w-3 text-white/70 ml-auto" />
      </div>

      <div className="p-3 bg-card rounded-b-[10px] space-y-2">
        <p className="text-xs text-muted-foreground">
          Agente: <span className="font-medium text-foreground">{data.agentName || 'Selecionar...'}</span>
        </p>

        <div className="flex items-center gap-1.5 text-[10px] text-violet-600 dark:text-violet-400">
          <Sparkles className="h-3 w-3" />
          <span>O Agente IA assumirá a conversa</span>
        </div>

        {/* Show configured outcomes */}
        {hasOutcomes && (
          <div className="space-y-1 pt-1 border-t border-border/50">
            <p className="text-[10px] text-muted-foreground font-medium">Resultados:</p>
            {outcomes.map((outcome) => (
              <div key={outcome} className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                <span className="text-[10px] text-foreground">{outcome}</span>
              </div>
            ))}
          </div>
        )}

        {/* Outcome handles rendered inside content area */}
        {hasOutcomes && (
          <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
            {outcomes.map((outcome) => (
              <div key={outcome} className="flex items-center justify-end gap-1.5 relative">
                <span className="text-[9px] text-violet-600 dark:text-violet-400 font-medium">
                  {outcome}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`outcome-${outcome}`}
                  className="!relative !transform-none !top-auto !right-auto !w-4 !h-4 !bg-violet-500 !border-2 !border-background !cursor-crosshair"
                  style={{ pointerEvents: 'all' }}
                  title={outcome}
                />
              </div>
            ))}
            <div className="flex items-center justify-end gap-1.5 relative">
              <span className="text-[9px] text-muted-foreground font-medium">
                padrão
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id="outcome-default"
                className="!relative !transform-none !top-auto !right-auto !w-4 !h-4 !bg-gray-400 !border-2 !border-background !cursor-crosshair"
                style={{ pointerEvents: 'all' }}
                title="Padrão (fallback)"
              />
            </div>
          </div>
        )}
      </div>

      {/* Single handle when no outcomes */}
      {!hasOutcomes && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-violet-500 !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-right-1.5"
        />
      )}
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
