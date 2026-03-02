import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { GitBranch, FormInput } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogicNodeData extends Record<string, unknown> {
  label?: string;
  variable?: string;
  operator?: string;
  value?: string;
  variableName?: string;
  inputType?: string;
}

type LogicNode = Node<LogicNodeData>;

export function ConditionNode({ data, selected }: NodeProps<LogicNode>) {
  return (
    <div
      className={cn(
        "group relative min-w-[200px] rounded-xl bg-card shadow-lg border-2 transition-all overflow-visible",
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-left-1.5"
      />

      <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500 rounded-t-[10px]">
        <GitBranch className="h-4 w-4 text-white" />
        <span className="font-medium text-sm text-white">Condição</span>
      </div>

      <div className="p-3 bg-card">
        {data.conditionLabel && (
          <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 mb-1 line-clamp-1">
            {data.conditionLabel as string}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Se <span className="font-mono bg-muted px-1 rounded">{data.variable as string || 'variável'}</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1 text-yellow-800/60">
          {data.operator as string || '='} <span className="font-mono bg-muted px-1 rounded">{data.value as string || 'valor'}</span>
        </p>
      </div>

      {/* Two output handles for true/false on right side */}
      <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 flex flex-col gap-6">
        <div className="relative flex items-center">
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="!relative !transform-none !w-3 !h-3 !bg-green-500 !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity"
          />
          <span className="absolute left-5 text-[10px] text-green-600 dark:text-green-400 font-medium whitespace-nowrap">Sim</span>
        </div>
        <div className="relative flex items-center">
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            className="!relative !transform-none !w-3 !h-3 !bg-red-500 !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity"
          />
          <span className="absolute left-5 text-[10px] text-red-600 dark:text-red-400 font-medium whitespace-nowrap">Não</span>
        </div>
      </div>
    </div>
  );
}

export function UserInputNode({ data, selected }: NodeProps<LogicNode>) {
  return (
    <div
      className={cn(
        "group relative min-w-[200px] rounded-xl bg-card shadow-lg border-2 transition-all overflow-visible",
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-left-1.5"
      />

      <div className="flex items-center gap-2 px-3 py-2 bg-teal-500 rounded-t-[10px]">
        <FormInput className="h-4 w-4 text-white" />
        <span className="font-medium text-sm text-white">Entrada do Usuário</span>
      </div>

      <div className="p-3 bg-card rounded-b-[10px] space-y-2">
        <p className="text-xs text-muted-foreground">
          Salvar em: <span className="font-mono bg-muted px-1 rounded">{data.variableName || 'resposta'}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Tipo: <span className="font-medium text-foreground">{data.inputType || 'texto'}</span>
        </p>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-right-1.5"
      />
    </div>
  );
}
