import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { MousePointerClick, List, ImageIcon, Video, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageNodeData extends Record<string, unknown> {
  label?: string;
  content?: string;
  text?: string;
  mediaType?: string;
  buttons?: Array<{ id: string; label: string }>;
  sections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
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
        "group relative min-w-[220px] max-w-[300px] rounded-xl bg-card shadow-lg border-2 transition-all overflow-visible",
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
    </div>
  );
}

export function ButtonsMessageNode({ data, selected }: NodeProps<MessageNode>) {
  const buttons = (data.buttons as Array<{ id: string; label: string }>) || [];
  const steps = (data.remarketingSteps as any[]) || [];
  const validButtons = buttons.filter(b => b.label);
  
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
        
        {validButtons.length > 0 ? (
          validButtons.map((btn, index) => (
            <div key={btn.id} className="relative">
              <div className="text-xs px-2 py-1.5 rounded-md bg-muted text-center text-foreground pr-5">
                {btn.label}
              </div>
              <Handle
                type="source"
                position={Position.Right}
                id={`btn_${index}`}
                className="!w-2.5 !h-2.5 !bg-indigo-400 !border-2 !border-background !-right-[18px]"
              />
            </div>
          ))
        ) : (
          <div className="text-xs px-2 py-1 rounded-md bg-muted text-center text-muted-foreground">
            + Adicionar botão
          </div>
        )}

        {/* Timeout separator */}
        <div className="relative pt-2 mt-1 border-t border-dashed border-border/60">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-red-500/80" />
            <span className="text-[10px] text-red-500/80 font-medium">Não respondeu</span>
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id="timeout"
            className="!w-2.5 !h-2.5 !bg-red-500 !border-2 !border-background !-right-[18px]"
          />
        </div>
      </div>
    </BaseMessageNode>
  );
}

export function ListMessageNode({ data, selected }: NodeProps<MessageNode>) {
  const steps = (data.remarketingSteps as any[]) || [];
  const sections = (data.sections as Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>) || [];
  
  // Flatten all rows for handle rendering
  const allRows: Array<{ id: string; title: string; sectionTitle?: string }> = [];
  sections.forEach(section => {
    section.rows?.forEach(row => {
      allRows.push({ ...row, sectionTitle: section.title });
    });
  });

  return (
    <BaseMessageNode
      selected={!!selected}
      icon={List}
      color="bg-cyan-500"
      title="Lista"
      hasFollowUps={steps.length > 0}
      followUpCount={steps.length}
    >
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">
          {data.content || 'Lista interativa de opções...'}
        </p>

        {allRows.length > 0 ? (
          <div className="space-y-1 mt-1">
            {allRows.map((row, index) => (
              <div key={row.id} className="relative">
                <div className="text-[11px] px-2 py-1.5 rounded-md bg-muted/70 text-foreground flex items-center gap-1.5 pr-5">
                  <span className="text-cyan-500 text-[10px]">◆</span>
                  <span className="truncate">{row.title}</span>
                </div>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`row_${index}`}
                  className="!w-2.5 !h-2.5 !bg-cyan-400 !border-2 !border-background !-right-[18px]"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs px-2 py-1.5 rounded-md bg-muted text-center text-foreground border border-dashed border-border">
            📋 Ver opções
          </div>
        )}

        {/* Timeout separator */}
        <div className="relative pt-2 mt-1 border-t border-dashed border-border/60">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-red-500/80" />
            <span className="text-[10px] text-red-500/80 font-medium">Não respondeu</span>
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id="timeout"
            className="!w-2.5 !h-2.5 !bg-red-500 !border-2 !border-background !-right-[18px]"
          />
        </div>
      </div>
    </BaseMessageNode>
  );
}
