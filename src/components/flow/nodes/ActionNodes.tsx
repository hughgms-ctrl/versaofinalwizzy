import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Tag, Kanban, UserPlus, Clock, Webhook, IterationCw, FileText, GitBranch, Building2, Users, UserCog, FileDown, DatabaseZap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFollowUpOutputs } from './followUpHandles';
import { WaitOutputRows } from './followUpOutputs';

interface ActionNodeData extends Record<string, unknown> {
  label?: string;
  tagName?: string;
  action?: string;
  pipelineName?: string;
  pipelineColumnName?: string;
  agentName?: string;
  duration?: number;
  unit?: string;
  webhookUrl?: string;
  flowName?: string;
  departmentName?: string;
  templateName?: string;
  signingMethod?: string;
  conditionLabel?: string;
  groupId?: string;
  groupJid?: string;
  groupName?: string;
  items?: unknown[];
  assignments?: unknown[];
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
        className="!w-3.5 !h-3.5 !bg-primary !border-2 !border-background !-left-[7px] !z-50"
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
        className="!w-3.5 !h-3.5 !bg-primary !border-2 !border-background !-right-[7px] !z-50"
      />
    </div>
  );
}

export function TagActionNode({ data, selected }: NodeProps<ActionNode>) {
  const hasWarning = !data.tagId && data.tagName?.includes('⚠️');
  return (
    <BaseActionNode selected={!!selected} icon={Tag} color="bg-amber-500" title="Atribuir Tag">
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${hasWarning ? 'bg-destructive/20 text-destructive' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
          {data.action === 'remove' ? '−' : '+'} {data.tagName || 'tag'}
        </span>
      </div>
    </BaseActionNode>
  );
}

export function PipelineActionNode({ data, selected }: NodeProps<ActionNode>) {
  const hasWarning = !data.pipelineId && data.pipelineName?.includes('⚠️');
  return (
    <BaseActionNode selected={!!selected} icon={Kanban} color="bg-blue-500" title="Mover Pipeline">
      <p className={`text-xs ${hasWarning ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
        {hasWarning ? data.pipelineName : <>Para: <span className="font-medium text-foreground">{data.pipelineColumnName || 'Selecionar...'}</span></>}
      </p>
    </BaseActionNode>
  );
}

export function DepartmentActionNode({ data, selected }: NodeProps<ActionNode>) {
  return (
    <BaseActionNode selected={!!selected} icon={Webhook} color="bg-cyan-500" title="Alterar Departamento">
      <p className="text-xs text-muted-foreground text-cyan-700/70">
        Destino: <span className="font-medium text-cyan-900 dark:text-cyan-100">{data.departmentName || 'Selecionar...'}</span>
      </p>
    </BaseActionNode>
  );
}

export function FlowActionNode({ data, selected }: NodeProps<ActionNode>) {
  const waitForResponse = !!(data.waitForResponse);
  const steps = (data.remarketingSteps as any[]) || [];
  const followUpOutputs = getFollowUpOutputs(data);
  const hasFollowUpOutputs = waitForResponse && followUpOutputs.length > 0;
  const hasWarning = !data.flowId && data.flowName?.includes('⚠️');

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

      <div className={cn("flex items-center gap-2 px-3 py-2 rounded-t-[10px]", "bg-indigo-500")}>
        <IterationCw className="h-4 w-4 text-white" />
        <span className="font-medium text-sm text-white">Iniciar Fluxo</span>
      </div>

      <div className="p-3 bg-card rounded-b-[10px] space-y-1">
        <p className={`text-xs ${hasWarning ? 'text-destructive font-medium' : 'text-muted-foreground text-indigo-700/70'}`}>
          {hasWarning ? data.flowName : <>Fluxo: <span className="font-medium text-indigo-900 dark:text-indigo-100">{data.flowName || 'Selecionar...'}</span></>}
        </p>
        {waitForResponse && steps.length > 0 && (
          <div className="flex items-center gap-1 pt-1 border-t border-border/50">
            <span className="text-[10px] text-blue-500">
              📩 {steps.length} follow-ups
            </span>
          </div>
        )}

        {hasFollowUpOutputs && <WaitOutputRows outputs={followUpOutputs} />}
      </div>

      {hasFollowUpOutputs ? null : !waitForResponse ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-primary !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-right-1.5"
        />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

export function DocumentActionNode({ data, selected }: NodeProps<ActionNode>) {
  const waitForResponse = data.waitForResponse === true || data.documentMode === 'agent_ai';

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
        className="!w-3.5 !h-3.5 !bg-rose-500 !border-2 !border-background !-left-[7px] !z-50"
      />

      <div className="flex items-center gap-2 px-3 py-2 bg-rose-500 rounded-t-[10px]">
        <FileText className="h-4 w-4 text-white" />
        <span className="font-medium text-sm text-white">Gerar Documento</span>
      </div>

      <div className="p-3 bg-card rounded-b-[10px] space-y-1">
        <p className="text-xs text-muted-foreground text-rose-700/70 truncate">
          {String(data.templateName || data.packName || 'Selecionar template...')}
        </p>
        <div className="flex items-center gap-1 text-[9px] text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full w-fit">
          <Clock className="h-2.5 w-2.5" />
          <span>Assinatura: {String(data.signingMethod || 'Manual')}</span>
        </div>
      </div>

      {!waitForResponse ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3.5 !h-3.5 !bg-rose-500 !border-2 !border-background !-right-[7px] !z-50"
        />
      ) : (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="responded"
            className="!w-3.5 !h-3.5 !bg-green-500 !border-2 !border-background !-right-[7px] !z-50"
            style={{ top: '40%' }}
            title="Respondeu"
          />
          <Handle
            type="source"
            position={Position.Right}
            id="timeout"
            className="!w-3.5 !h-3.5 !bg-red-500 !border-2 !border-background !-right-[7px] !z-50"
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
        </>
      )}
    </div>
  );
}

export function TransferActionNode({ data, selected }: NodeProps<ActionNode>) {
  return (
    <BaseActionNode selected={!!selected} icon={UserPlus} color="bg-rose-500" title="Escalação Humana">
      <p className="text-xs text-muted-foreground">
        Atendimento humano ativado
      </p>
      {data.stopAI === true && (
        <p className="text-[10px] text-rose-500 font-medium mt-1">
          IA encerrada nesta conversa
        </p>
      )}
    </BaseActionNode>
  );
}

export function DelayActionNode({ data, selected }: NodeProps<ActionNode>) {
  return (
    <BaseActionNode selected={!!selected} icon={Clock} color="bg-slate-500" title="Pausa (Delay)">
      <p className="text-xs text-muted-foreground">
        Aguardar: <span className="font-medium text-foreground">
          {data.delaySeconds ? (
            (data.delaySeconds as number) >= 60 && (data.delaySeconds as number) % 60 === 0
              ? `${(data.delaySeconds as number) / 60} min`
              : `${data.delaySeconds} seg`
          ) : '5 seg'}
        </span>
      </p>
    </BaseActionNode>
  );
}

export function WebhookActionNode({ data, selected }: NodeProps<ActionNode>) {
  return (
    <BaseActionNode selected={!!selected} icon={Webhook} color="bg-orange-500" title="Entrada de Dados">
      <p className="text-xs text-muted-foreground truncate">
        Webhook: {data.webhookUrl || 'Configurar...'}
      </p>
    </BaseActionNode>
  );
}

export function WorkspaceActionNode({ data, selected }: NodeProps<ActionNode>) {
  return (
    <BaseActionNode selected={!!selected} icon={Building2} color="bg-sky-500" title="Atribuir Workspace">
      <p className="text-xs text-muted-foreground">
        Workspace: <span className="font-medium text-foreground">{String(data.workspaceName || 'Selecionar...')}</span>
      </p>
    </BaseActionNode>
  );
}

export function ContactFieldActionNode({ data, selected }: NodeProps<ActionNode>) {
  const count = Array.isArray(data.assignments) ? (data.assignments as unknown[]).length : 0;
  return (
    <BaseActionNode selected={!!selected} icon={UserCog} color="bg-teal-600" title="Salvar no Contato">
      <p className="text-xs text-muted-foreground">
        {count > 0
          ? `${count} campo${count > 1 ? 's' : ''} do contato`
          : 'Configurar campos...'}
      </p>
    </BaseActionNode>
  );
}

export function GeneratePdfActionNode({ data, selected }: NodeProps<ActionNode>) {
  const variable = String(data.saveUrlToVariable || 'pdf_url');
  return (
    <BaseActionNode selected={!!selected} icon={FileDown} color="bg-fuchsia-600" title="Gerar PDF">
      <p className="text-xs text-muted-foreground truncate">
        {String(data.documentName || 'Nomear o arquivo...')}
      </p>
      <p className="text-[10px] text-muted-foreground mt-1">
        URL em <span className="font-mono text-foreground">{`{{${variable}}}`}</span>
      </p>
    </BaseActionNode>
  );
}

export function QueryContactsActionNode({ data, selected }: NodeProps<ActionNode>) {
  const variable = String(data.outputVariable || 'consulta_resultado');
  const mode = String(data.queryMode || 'count');
  const groupField = String(data.groupByField || '');
  const filterCount = Array.isArray(data.filters) ? (data.filters as unknown[]).length : 0;
  // "3 filtro(s)" le igual nos dois modos e sao recortes bem diferentes: quem
  // olha o canvas precisa ver que esta lendo uma uniao.
  const filterLogicLabel = filterCount > 1 && String(data.filterLogic || 'and') === 'or' ? ' (OU)' : '';

  return (
    <BaseActionNode selected={!!selected} icon={DatabaseZap} color="bg-indigo-600" title="Consultar Contatos">
      <p className="text-xs text-muted-foreground truncate">
        {mode === 'group'
          ? `Agrupar por ${groupField || '...'}`
          : `${mode === 'list' ? 'Listar' : 'Contar'} contatos`}
        {filterCount > 0 ? ` — ${filterCount} filtro(s)${filterLogicLabel}` : ' — sem filtro'}
      </p>
      <p className="text-[10px] text-muted-foreground mt-1">
        Resultado em <span className="font-mono text-foreground">{`{{${variable}}}`}</span>
      </p>
    </BaseActionNode>
  );
}

export function WhatsAppGroupActionNode({ data, selected }: NodeProps<ActionNode>) {
  const itemCount = Array.isArray(data.items) ? (data.items as unknown[]).length : 0;
  return (
    <BaseActionNode selected={!!selected} icon={Users} color="bg-emerald-500" title="Grupo WhatsApp">
      <p className="text-xs text-muted-foreground">
        Grupo: <span className="font-medium text-foreground">{String(data.groupName || 'Selecionar...')}</span>
      </p>
      {itemCount > 0 && (
        <p className="text-[10px] text-muted-foreground mt-1">{itemCount} item(ns)</p>
      )}
    </BaseActionNode>
  );
}
