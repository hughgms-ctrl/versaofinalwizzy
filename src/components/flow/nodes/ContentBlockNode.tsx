import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Layers, Type, Image, Video, Music, FileText, Clock, GripVertical, MessageSquareMore, TimerOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContentItem } from '@/types/flow';

interface ContentBlockNodeData extends Record<string, unknown> {
  label?: string;
  items?: ContentItem[];
  waitForResponse?: boolean;
  saveVariable?: string;
  timeoutMinutes?: number;
}

type ContentBlockNode = Node<ContentBlockNodeData>;

const itemTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  text: Type,
  image: Image,
  video: Video,
  audio: Music,
  document: FileText,
  delay: Clock,
};

const itemTypeLabels: Record<string, string> = {
  text: 'Texto',
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  document: 'Documento',
  delay: 'Pausa',
};

export function ContentBlockNode({ data, selected }: NodeProps<ContentBlockNode>) {
  const items = (data.items as ContentItem[]) || [];
  const waitForResponse = !!data.waitForResponse;

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
      
      <div className="flex items-center gap-2 px-3 py-2 rounded-t-[10px] bg-blue-500">
        <Layers className="h-4 w-4 text-white" />
        <span className="font-medium text-sm text-white">Bloco de Conteúdo</span>
        {waitForResponse && (
          <MessageSquareMore className="h-3 w-3 text-white/70 ml-auto" title="Aguardando resposta" />
        )}
      </div>
      
      <div className="p-3 bg-card rounded-b-[10px] space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">
            Clique para adicionar conteúdos...
          </p>
        ) : (
          <div className="space-y-1.5">
            {items.slice(0, 5).map((item) => {
              const Icon = itemTypeIcons[item.type] || Type;
              return (
                <div 
                  key={item.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border border-border/50"
                >
                  <GripVertical className="h-3 w-3 text-muted-foreground/50" />
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-foreground truncate flex-1">
                    {item.type === 'text' && (item.content?.slice(0, 30) || 'Texto...')}
                    {item.type === 'delay' && `Pausa ${item.delaySeconds || 3}s`}
                    {['image', 'video', 'audio', 'document'].includes(item.type) && (
                      item.mediaUrl ? 'Mídia anexada' : itemTypeLabels[item.type]
                    )}
                  </span>
                </div>
              );
            })}
            {items.length > 5 && (
              <p className="text-xs text-muted-foreground text-center">
                +{items.length - 5} itens...
              </p>
            )}
          </div>
        )}

        {/* Wait for response indicator */}
        {waitForResponse && (
          <div className="flex items-center gap-2 pt-1 border-t border-border/50">
            <MessageSquareMore className="h-3 w-3 text-green-600" />
            <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">
              Aguarda resposta
              {data.saveVariable ? ` → {{${data.saveVariable}}}` : ''}
            </span>
            {data.timeoutMinutes && (
              <span className="text-[10px] text-red-500 ml-auto flex items-center gap-0.5">
                <TimerOff className="h-2.5 w-2.5" />
                {data.timeoutMinutes}min
              </span>
            )}
          </div>
        )}
      </div>
      
      {/* Output handles */}
      {!waitForResponse ? (
        // Single default output
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-primary !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-right-1.5"
        />
      ) : (
        // Two outputs: responded (green) + timeout (red)
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
          {/* Labels */}
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
