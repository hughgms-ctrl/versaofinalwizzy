import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Bot, Kanban, Tag, Building2, GitBranch, Clock, UserPlus, Zap, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const handleStyle = { width: 8, height: 8, background: 'hsl(var(--primary))' };

// Trigger Node (Start)
export const OrchestratorTriggerNode = memo(({ data }: NodeProps) => (
  <div className="px-4 py-3 rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg min-w-[160px]">
    <Handle type="source" position={Position.Right} style={handleStyle} />
    <div className="flex items-center gap-2">
      <Zap className="h-5 w-5" />
      <div>
        <p className="text-sm font-semibold">Gatilho</p>
        <p className="text-[10px] opacity-80">{(data as any).label || 'Entrada'}</p>
      </div>
    </div>
  </div>
));
OrchestratorTriggerNode.displayName = 'OrchestratorTriggerNode';

// Agent Node
export const OrchestratorAgentNode = memo(({ data, selected }: NodeProps) => (
  <div className={cn(
    "px-4 py-3 rounded-xl border-2 shadow-md min-w-[180px] bg-card transition-all",
    selected ? "border-violet-500 shadow-violet-500/20" : "border-violet-500/30"
  )}>
    <Handle type="target" position={Position.Left} style={handleStyle} />
    <Handle type="source" position={Position.Right} style={handleStyle} />
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-violet-500 flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Agente IA</p>
        <p className="text-sm font-semibold text-foreground truncate">{(data as any).agentName || (data as any).label || 'Selecionar...'}</p>
      </div>
    </div>
  </div>
));
OrchestratorAgentNode.displayName = 'OrchestratorAgentNode';

// Pipeline Node
export const OrchestratorPipelineNode = memo(({ data, selected }: NodeProps) => (
  <div className={cn(
    "px-4 py-3 rounded-xl border-2 shadow-md min-w-[180px] bg-card transition-all",
    selected ? "border-blue-500 shadow-blue-500/20" : "border-blue-500/30"
  )}>
    <Handle type="target" position={Position.Left} style={handleStyle} />
    <Handle type="source" position={Position.Right} style={handleStyle} />
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
        <Kanban className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Pipeline</p>
        <p className="text-sm font-semibold text-foreground truncate">{(data as any).pipelineName || (data as any).label || 'Selecionar...'}</p>
      </div>
    </div>
  </div>
));
OrchestratorPipelineNode.displayName = 'OrchestratorPipelineNode';

// Tag Node
export const OrchestratorTagNode = memo(({ data, selected }: NodeProps) => (
  <div className={cn(
    "px-4 py-3 rounded-xl border-2 shadow-md min-w-[160px] bg-card transition-all",
    selected ? "border-amber-500 shadow-amber-500/20" : "border-amber-500/30"
  )}>
    <Handle type="target" position={Position.Left} style={handleStyle} />
    <Handle type="source" position={Position.Right} style={handleStyle} />
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
        <Tag className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{(data as any).action === 'remove' ? 'Remover Tag' : 'Adicionar Tag'}</p>
        <p className="text-sm font-semibold text-foreground truncate">{(data as any).tagName || (data as any).label || 'Selecionar...'}</p>
      </div>
    </div>
  </div>
));
OrchestratorTagNode.displayName = 'OrchestratorTagNode';

// Department Node
export const OrchestratorDepartmentNode = memo(({ data, selected }: NodeProps) => (
  <div className={cn(
    "px-4 py-3 rounded-xl border-2 shadow-md min-w-[160px] bg-card transition-all",
    selected ? "border-cyan-500 shadow-cyan-500/20" : "border-cyan-500/30"
  )}>
    <Handle type="target" position={Position.Left} style={handleStyle} />
    <Handle type="source" position={Position.Right} style={handleStyle} />
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-cyan-500 flex items-center justify-center shrink-0">
        <Building2 className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Departamento</p>
        <p className="text-sm font-semibold text-foreground truncate">{(data as any).departmentName || (data as any).label || 'Selecionar...'}</p>
      </div>
    </div>
  </div>
));
OrchestratorDepartmentNode.displayName = 'OrchestratorDepartmentNode';

// Flow Node
export const OrchestratorFlowNode = memo(({ data, selected }: NodeProps) => (
  <div className={cn(
    "px-4 py-3 rounded-xl border-2 shadow-md min-w-[160px] bg-card transition-all",
    selected ? "border-indigo-500 shadow-indigo-500/20" : "border-indigo-500/30"
  )}>
    <Handle type="target" position={Position.Left} style={handleStyle} />
    <Handle type="source" position={Position.Right} style={handleStyle} />
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0">
        <GitBranch className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Iniciar Fluxo</p>
        <p className="text-sm font-semibold text-foreground truncate">{(data as any).flowName || (data as any).label || 'Selecionar...'}</p>
      </div>
    </div>
  </div>
));
OrchestratorFlowNode.displayName = 'OrchestratorFlowNode';

// Delay Node
export const OrchestratorDelayNode = memo(({ data, selected }: NodeProps) => (
  <div className={cn(
    "px-4 py-3 rounded-xl border-2 shadow-md min-w-[140px] bg-card transition-all",
    selected ? "border-slate-500 shadow-slate-500/20" : "border-slate-500/30"
  )}>
    <Handle type="target" position={Position.Left} style={handleStyle} />
    <Handle type="source" position={Position.Right} style={handleStyle} />
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-slate-500 flex items-center justify-center shrink-0">
        <Clock className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Intervalo</p>
        <p className="text-sm font-semibold text-foreground">{(data as any).delaySeconds || 5}s</p>
      </div>
    </div>
  </div>
));
OrchestratorDelayNode.displayName = 'OrchestratorDelayNode';

// Condition Node
export const OrchestratorConditionNode = memo(({ data, selected }: NodeProps) => (
  <div className={cn(
    "px-4 py-3 rounded-xl border-2 shadow-md min-w-[160px] bg-card transition-all",
    selected ? "border-yellow-500 shadow-yellow-500/20" : "border-yellow-500/30"
  )}>
    <Handle type="target" position={Position.Left} style={handleStyle} />
    <Handle type="source" position={Position.Right} id="true" style={{ ...handleStyle, top: '30%' }} />
    <Handle type="source" position={Position.Right} id="false" style={{ ...handleStyle, top: '70%' }} />
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-yellow-500 flex items-center justify-center shrink-0">
        <GitBranch className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Condição</p>
        <p className="text-sm font-semibold text-foreground truncate">{(data as any).conditionLabel || (data as any).label || 'Configurar...'}</p>
      </div>
    </div>
    <div className="flex flex-col absolute right-[-40px] top-[20%] text-[10px] text-muted-foreground gap-4">
      <span className="text-green-500">Sim</span>
      <span className="text-red-500">Não</span>
    </div>
  </div>
));
OrchestratorConditionNode.displayName = 'OrchestratorConditionNode';

// Human Escalation Node
export const OrchestratorHumanNode = memo(({ data, selected }: NodeProps) => (
  <div className={cn(
    "px-4 py-3 rounded-xl border-2 shadow-md min-w-[160px] bg-card transition-all",
    selected ? "border-green-500 shadow-green-500/20" : "border-green-500/30"
  )}>
    <Handle type="target" position={Position.Left} style={handleStyle} />
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
        <UserPlus className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Escalação</p>
        <p className="text-sm font-semibold text-foreground truncate">{(data as any).label || 'Humano'}</p>
      </div>
    </div>
  </div>
));
OrchestratorHumanNode.displayName = 'OrchestratorHumanNode';

// Document/Contract Node
export const OrchestratorDocumentNode = memo(({ data, selected }: NodeProps) => (
  <div className={cn(
    "px-4 py-3 rounded-xl border-2 shadow-md min-w-[180px] bg-card transition-all",
    selected ? "border-rose-500 shadow-rose-500/20" : "border-rose-500/30"
  )}>
    <Handle type="target" position={Position.Left} style={handleStyle} />
    <Handle type="source" position={Position.Right} style={handleStyle} />
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-rose-500 flex items-center justify-center shrink-0">
        <FileText className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Contrato</p>
        <p className="text-sm font-semibold text-foreground truncate">{(data as any).templateName || (data as any).label || 'Selecionar...'}</p>
      </div>
    </div>
  </div>
));
OrchestratorDocumentNode.displayName = 'OrchestratorDocumentNode';
