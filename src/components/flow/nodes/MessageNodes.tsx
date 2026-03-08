import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { MousePointerClick, List } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageNodeData extends Record<string, unknown> {
  label?: string;
  content?: string;
  text?: string;
  mediaType?: string;
  buttons?: Array<{ id: string; label: string }>;
  remarketingSteps?: Array<{ id: string; delayMinutes: number; message: string }>;
}

type MessageNode = Node<MessageNodeData>;

function BaseMessageNode({ 
  selected, 
  icon: Icon, 
  color, 
  title, 
  children,
  hasFollowUps,
  followUpCount,
}: { 
  selected: boolean; 
  icon: React.ComponentType<{ className?: string }>; 
  color: string;
  title: string;
  children?: React.ReactNode;
  hasFollowUps?: boolean;
  followUpCount?: number;
}) {
  return (
    <div 
      className={cn(
        "group relative min-w-[200px] max-w-[280px] rounded-xl bg-card shadow-lg border-2 transition-all overflow-visible",
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
      
      <div className="p-3 bg-card rounded-b-[10px] space-y-2">
        {children}
        {hasFollowUps && followUpCount && followUpCount > 0 ? (
          <div className="flex items-center gap-1 pt-1 border-t border-border/50">
            <span className="text-[10px] text-blue-500">
              📩 {followUpCount} follow-ups
            </span>
          </div>
        ) : null}
      </div>
      
      {/* Always show dual handles for interactive messages (they always wait for response) */}
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
    </div>
  );
}

export function ButtonsMessageNode({ data, selected }: NodeProps<MessageNode>) {
  const buttons = data.buttons as Array<{ id: string; label: string }> | undefined;
  const steps = (data.remarketingSteps as any[]) || [];
  
  return (
    <BaseMessageNode
      selected={!!selected}
      icon={MousePointerClick}
      color="bg-indigo-500"
      title="Botões"
      hasFollowUps={steps.length > 0}
      followUpCount={steps.length}
    >
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground mb-2">
          {data.text || data.content || 'Mensagem com botões...'}
        </p>
        {(buttons?.length ?? 0) > 0 ? (
          buttons?.map((btn) => (
            <div 
              key={btn.id} 
              className="text-xs px-2 py-1 rounded-md bg-muted text-center text-foreground"
            >
              {btn.label}
            </div>
          ))
        ) : (
          <div className="text-xs px-2 py-1 rounded-md bg-muted text-center text-muted-foreground">
            + Adicionar botão
          </div>
        )}
      </div>
    </BaseMessageNode>
  );
}

export function ListMessageNode({ data, selected }: NodeProps<MessageNode>) {
  const steps = (data.remarketingSteps as any[]) || [];
  
  return (
    <BaseMessageNode
      selected={!!selected}
      icon={List}
      color="bg-cyan-500"
      title="Lista"
      hasFollowUps={steps.length > 0}
      followUpCount={steps.length}
    >
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {data.content || 'Lista interativa de opções...'}
        </p>
        <div className="text-xs px-2 py-1.5 rounded-md bg-muted text-center text-foreground border border-dashed border-border">
          📋 Ver opções
        </div>
      </div>
    </BaseMessageNode>
  );
}
