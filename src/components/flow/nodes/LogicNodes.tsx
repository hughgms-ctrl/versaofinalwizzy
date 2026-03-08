import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { GitBranch, FormInput, Shuffle, Clock, Tag, Kanban, User, MessageSquare, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConditionRule, RandomizerVariant } from '@/types/flow';

interface LogicNodeData extends Record<string, unknown> {
  label?: string;
  variable?: string;
  operator?: string;
  value?: string;
  variableName?: string;
  inputType?: string;
  // Advanced condition
  matchType?: 'all' | 'any';
  rules?: ConditionRule[];
  conditionLabel?: string;
  // Randomizer
  variants?: RandomizerVariant[];
  // Smart delay
  delayType?: string;
  fixedMinutes?: number;
  time?: string;
}

type LogicNode = Node<LogicNodeData>;

const ruleTypeLabels: Record<string, string> = {
  tag: 'Tag',
  pipeline: 'Pipeline',
  assigned: 'Responsável',
  variable: 'Variável',
  contact_field: 'Campo do contato',
  service_mode: 'Modo atendimento',
};

const ruleTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  tag: Tag,
  pipeline: Kanban,
  assigned: User,
  variable: FileText,
  contact_field: User,
  service_mode: MessageSquare,
};

export function ConditionNode({ data, selected }: NodeProps<LogicNode>) {
  const rules = (data.rules as ConditionRule[]) || [];
  const matchType = (data.matchType as string) || 'all';
  const hasAdvancedRules = rules.length > 0;

  return (
    <div
      className={cn(
        "group relative min-w-[220px] max-w-[280px] rounded-xl bg-card shadow-lg border-2 transition-all overflow-visible",
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

      <div className="p-3 bg-card space-y-1.5">
        {data.conditionLabel && (
          <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 line-clamp-1">
            {data.conditionLabel as string}
          </p>
        )}

        {hasAdvancedRules ? (
          <>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
              {rules.length} {rules.length === 1 ? 'regra' : 'regras'} • {matchType === 'all' ? 'TODAS' : 'QUALQUER'}
            </p>
            <div className="space-y-1">
              {rules.slice(0, 3).map((rule) => {
                const Icon = ruleTypeIcons[rule.type] || GitBranch;
                const negateLabel = rule.negate ? 'NÃO' : '';
                return (
                  <div key={rule.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Icon className="h-3 w-3 shrink-0 text-yellow-600" />
                    <span className="truncate">
                      {negateLabel ? <span className="text-red-500 font-semibold mr-0.5">{negateLabel}</span> : null}
                      {ruleTypeLabels[rule.type] || rule.type}
                    </span>
                  </div>
                );
              })}
              {rules.length > 3 && (
                <p className="text-[10px] text-muted-foreground/70 italic">
                  +{rules.length - 3} mais...
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Se <span className="font-mono bg-muted px-1 rounded">{data.variable as string || 'variável'}</span>
            </p>
            <p className="text-xs text-muted-foreground text-yellow-800/60">
              {data.operator as string || '='} <span className="font-mono bg-muted px-1 rounded">{data.value as string || 'valor'}</span>
            </p>
          </>
        )}
      </div>

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
  const steps = (data.remarketingSteps as any[]) || [];

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
        {steps.length > 0 && (
          <div className="flex items-center gap-1 pt-1 border-t border-border/50">
            <span className="text-[10px] text-blue-500">
              📩 {steps.length} follow-ups
            </span>
          </div>
        )}
      </div>

      {/* Dual handles - user-input always waits for response */}
      <Handle
        type="source"
        position={Position.Right}
        id="responded"
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-background !-right-1.5"
        style={{ top: '40%' }}
        title="Respondeu"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="timeout"
        className="!w-3 !h-3 !bg-red-500 !border-2 !border-background !-right-1.5"
        style={{ top: '70%' }}
        title="Não respondeu (timeout)"
      />
      <span
        className="absolute text-[9px] text-green-600 dark:text-green-400 font-medium whitespace-nowrap pointer-events-none"
        style={{ right: '-8px', top: '40%', transform: 'translate(100%, -50%)', paddingLeft: '4px' }}
      >
        ✓ Respondeu
      </span>
      <span
        className="absolute text-[9px] text-red-500 font-medium whitespace-nowrap pointer-events-none"
        style={{ right: '-8px', top: '70%', transform: 'translate(100%, -50%)', paddingLeft: '4px' }}
      >
        ✗ Timeout
      </span>
    </div>
  );
}

export function RandomizerNode({ data, selected }: NodeProps<LogicNode>) {
  const variants = (data.variants as RandomizerVariant[]) || [
    { id: 'A', label: 'Variante A', weight: 50 },
    { id: 'B', label: 'Variante B', weight: 50 },
  ];

  return (
    <div
      className={cn(
        "group relative min-w-[200px] max-w-[260px] rounded-xl bg-card shadow-lg border-2 transition-all overflow-visible",
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-left-1.5"
      />

      <div className="flex items-center gap-2 px-3 py-2 bg-purple-500 rounded-t-[10px]">
        <Shuffle className="h-4 w-4 text-white" />
        <span className="font-medium text-sm text-white">Randomizador</span>
      </div>

      <div className="p-3 bg-card space-y-1.5">
        {variants.map((v) => (
          <div key={v.id} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground truncate">{v.label}</span>
            <span className="font-mono font-semibold text-purple-600 dark:text-purple-400 ml-2">{v.weight}%</span>
          </div>
        ))}
      </div>

      {/* Dynamic handles on right - one per variant */}
      <div className="absolute -right-1.5 flex flex-col" style={{
        top: '50%',
        transform: 'translateY(-50%)',
        gap: `${Math.max(20, 48 / variants.length)}px`,
      }}>
        {variants.map((v, i) => (
          <div key={v.id} className="relative flex items-center">
            <Handle
              type="source"
              position={Position.Right}
              id={v.id}
              className="!relative !transform-none !w-3 !h-3 !bg-purple-500 !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity"
            />
            <span className="absolute left-5 text-[10px] text-purple-600 dark:text-purple-400 font-medium whitespace-nowrap">
              {v.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SmartDelayNode({ data, selected }: NodeProps<LogicNode>) {
  const delayType = (data.delayType as string) || 'fixed';

  const delayLabels: Record<string, string> = {
    fixed: 'Tempo fixo',
    until_time: 'Até horário',
    until_business_hours: 'Horário comercial',
    until_date: 'Até data',
  };

  const getDelayDescription = () => {
    switch (delayType) {
      case 'fixed':
        return `${data.fixedMinutes || 30} minutos`;
      case 'until_time':
        return `Até ${data.time || '09:00'}`;
      case 'until_business_hours':
        return 'Próximo horário comercial';
      case 'until_date':
        return `Até ${data.date || 'data definida'}`;
      default:
        return 'Configurar...';
    }
  };

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

      <div className="flex items-center gap-2 px-3 py-2 bg-orange-500 rounded-t-[10px]">
        <Clock className="h-4 w-4 text-white" />
        <span className="font-medium text-sm text-white">Atraso Inteligente</span>
      </div>

      <div className="p-3 bg-card space-y-1">
        <p className="text-xs font-medium text-orange-600 dark:text-orange-400">
          {delayLabels[delayType] || delayType}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {getDelayDescription()}
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
