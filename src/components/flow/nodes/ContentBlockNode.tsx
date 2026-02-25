import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Layers, Type, Image, Video, Music, FileText, Clock, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContentItem } from '@/types/flow';

interface ContentBlockNodeData extends Record<string, unknown> {
  label?: string;
  items?: ContentItem[];
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
      </div>
      
      <div className="p-3 bg-card rounded-b-[10px] space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">
            Clique para adicionar conteúdos...
          </p>
        ) : (
          <div className="space-y-1.5">
            {items.slice(0, 5).map((item, index) => {
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
      </div>
      
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background opacity-0 group-hover:opacity-100 transition-opacity !-right-1.5"
      />
    </div>
  );
}
