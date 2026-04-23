import { useState, useMemo } from 'react';
import { useConversations, DbConversation } from '@/hooks/useConversations';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot, User, GripVertical, MoreHorizontal, Plus, Loader2, Inbox, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface PipelineColumn {
  id: 'open' | 'pending' | 'resolved' | 'archived';
  title: string;
  color: string;
}

const columns: PipelineColumn[] = [
  { id: 'open', title: 'Novos / Abertos', color: 'from-blue-500 to-blue-600' },
  { id: 'pending', title: 'Pendentes', color: 'from-amber-500 to-amber-600' },
  { id: 'resolved', title: 'Resolvidos', color: 'from-green-500 to-green-600' },
  { id: 'archived', title: 'Arquivados', color: 'from-slate-400 to-slate-500' },
];

interface PipelineBoardProps {
  onConversationClick?: (conversation: DbConversation) => void;
}

export function PipelineBoard({ onConversationClick }: PipelineBoardProps) {
  const { data: conversations, isLoading, refetch } = useConversations();
  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const getConversationsByColumn = (columnId: string) => {
    return (conversations || []).filter(c => c.status === columnId);
  };

  const columnCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    columns.forEach(col => {
      counts[col.id] = getConversationsByColumn(col.id).length;
    });
    return counts;
  }, [conversations]);

  const handleDragStart = (e: React.DragEvent, conversationId: string) => {
    setDraggedCard(conversationId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDrop = async (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    if (draggedCard) {
      try {
        const { error } = await supabase
          .from('conversations')
          .update({ status: columnId as any })
          .eq('id', draggedCard);

        if (error) throw error;

        await refetch();
        toast({
          title: 'Conversa movida',
          description: `Status atualizado para ${columns.find(c => c.id === columnId)?.title}`,
        });
      } catch (error) {
        console.error('Error updating conversation:', error);
        toast({
          title: 'Erro ao mover conversa',
          description: 'Não foi possível atualizar o status.',
          variant: 'destructive',
        });
      }
    }
    setDraggedCard(null);
    setDragOverColumn(null);
  };

  const handleDragEnd = () => {
    setDraggedCard(null);
    setDragOverColumn(null);
  };

  const getDisplayName = (conversation: DbConversation) => {
    if (conversation.contact?.name) return conversation.contact.name;
    if (conversation.contact?.phone) return conversation.contact.phone;
    return 'Desconhecido';
  };

  const getInitials = (conversation: DbConversation) => {
    const name = conversation.contact?.name;
    const phone = conversation.contact?.phone || '';
    if (name) {
      return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    }
    return phone.slice(-2);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!conversations || conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Inbox className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">Nenhuma conversa no pipeline</p>
        <p className="text-sm text-center mt-2">
          As conversas aparecerão aqui quando você receber mensagens no WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-140px)] overflow-x-auto">
      {columns.map((column) => {
        const columnConversations = getConversationsByColumn(column.id);
        const isDragOver = dragOverColumn === column.id;

        return (
          <div
            key={column.id}
            className={cn(
              "pipeline-column transition-all duration-200",
              isDragOver && "ring-2 ring-primary ring-offset-2"
            )}
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "h-3 w-3 rounded-full bg-gradient-to-br",
                  column.color
                )} />
                <h3 className="font-semibold text-foreground text-sm">{column.title}</h3>
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                  {columnConversations.length}
                </span>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>

            {/* Cards */}
            <div className="space-y-2 min-h-[200px]">
              {columnConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, conversation.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => onConversationClick?.(conversation)}
                  className={cn(
                    "pipeline-card",
                    draggedCard === conversation.id && "opacity-50 scale-95"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground/50 mt-0.5 cursor-grab" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                            {conversation.contact?.avatar_url ? (
                              <img
                                src={conversation.contact.avatar_url}
                                alt={getDisplayName(conversation)}
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-semibold text-primary">
                                {getInitials(conversation)}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {(() => {
                              const metadata = conversation.contact?.metadata as { note?: string } | null;
                              const note = metadata?.note;

                              if (note) {
                                return (
                                  <div className="flex flex-col gap-0.5">
                                    <span
                                      className="text-[10px] font-semibold px-1.5 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-400 rounded truncate max-w-full inline-block"
                                      title={note}
                                    >
                                      {note}
                                    </span>
                                    <p className="text-[11px] font-medium text-muted-foreground truncate max-w-[140px]" data-sensitive>
                                      {getDisplayName(conversation)}
                                    </p>
                                  </div>
                                );
                              }

                              return (
                                <>
                                  <p className="text-sm font-medium text-foreground truncate max-w-[140px]" data-sensitive>
                                    {getDisplayName(conversation)}
                                  </p>
                                  {conversation.last_message_at && (
                                    <p className="text-[10px] text-muted-foreground">
                                      {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true, locale: ptBR })}
                                    </p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[10px] font-medium flex items-center gap-1">
                            <MessageCircle className="h-3 w-3" />
                            WhatsApp
                          </span>
                        </div>
                        {conversation.unread_count > 0 && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                            {conversation.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
