import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  useScheduledMessages, 
  useCancelScheduledMessage, 
  useDeleteScheduledMessage,
  ScheduledMessage 
} from '@/hooks/useScheduledMessages';
import { 
  Calendar, 
  Clock, 
  Loader2, 
  MoreHorizontal, 
  MessageSquare, 
  Workflow, 
  User, 
  Tag, 
  Users,
  Repeat,
  CheckCircle,
  XCircle,
  AlertCircle,
  Pause,
  Trash2,
  Ban
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

const statusConfig = {
  pending: { label: 'Pendente', icon: Clock, color: 'bg-blue-500/10 text-blue-500' },
  processing: { label: 'Processando', icon: Loader2, color: 'bg-yellow-500/10 text-yellow-500' },
  sent: { label: 'Enviado', icon: CheckCircle, color: 'bg-green-500/10 text-green-500' },
  failed: { label: 'Falhou', icon: XCircle, color: 'bg-red-500/10 text-red-500' },
  cancelled: { label: 'Cancelado', icon: Ban, color: 'bg-muted text-muted-foreground' },
};

const recurrenceLabels = {
  once: 'Uma vez',
  daily: 'Diário',
  weekly: 'Semanal',
  monthly: 'Mensal',
};

export function ScheduledMessagesList() {
  const { data: scheduledMessages = [], isLoading } = useScheduledMessages();
  const cancelMutation = useCancelScheduledMessage();
  const deleteMutation = useDeleteScheduledMessage();
  const { selectedWorkspaceId } = useWorkspaceContext();
  
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filteredMessages = useMemo(() => {
    if (!selectedWorkspaceId) return scheduledMessages;
    return scheduledMessages.filter(m => !m.workspace_id || m.workspace_id === selectedWorkspaceId);
  }, [scheduledMessages, selectedWorkspaceId]);

  const handleCancel = (id: string) => {
    cancelMutation.mutate(id);
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (filteredMessages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Calendar className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">Nenhum agendamento</p>
        <p className="text-sm text-center mt-2">
          Crie um novo agendamento para enviar mensagens ou executar fluxos automaticamente.
        </p>
      </div>
    );
  }

  // Group by status
  const pendingMessages = filteredMessages.filter(m => m.status === 'pending');
  const completedMessages = filteredMessages.filter(m => ['sent', 'failed', 'cancelled'].includes(m.status));

  return (
    <div className="space-y-8">
      {/* Pending */}
      {pendingMessages.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            Agendamentos Pendentes ({pendingMessages.length})
          </h2>
          <div className="space-y-3">
            {pendingMessages.map(message => (
              <ScheduledMessageCard 
                key={message.id} 
                message={message}
                onCancel={handleCancel}
                onDelete={setDeleteId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completedMessages.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-muted-foreground" />
            Histórico ({completedMessages.length})
          </h2>
          <div className="space-y-3">
            {completedMessages.map(message => (
              <ScheduledMessageCard 
                key={message.id} 
                message={message}
                onCancel={handleCancel}
                onDelete={setDeleteId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O agendamento será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ScheduledMessageCard({ 
  message, 
  onCancel, 
  onDelete 
}: { 
  message: ScheduledMessage;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const status = statusConfig[message.status];
  const StatusIcon = status.icon;

  const getTargetLabel = () => {
    if (message.target_type === 'single' && message.contact) {
      return message.contact.name || message.contact.phone;
    }
    if (message.target_type === 'tag' && message.tag) {
      return message.tag.name;
    }
    return 'Múltiplos contatos';
  };

  const getTargetIcon = () => {
    if (message.target_type === 'single') return User;
    if (message.target_type === 'tag') return Tag;
    return Users;
  };

  const TargetIcon = getTargetIcon();

  return (
    <div className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <div className={cn("p-2 rounded-lg", message.content_type === 'message' ? 'bg-blue-500/10' : 'bg-purple-500/10')}>
              {message.content_type === 'message' ? (
                <MessageSquare className="h-4 w-4 text-blue-500" />
              ) : (
                <Workflow className="h-4 w-4 text-purple-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">
                {message.name || (message.content_type === 'message' ? 'Mensagem agendada' : message.flow?.name || 'Fluxo agendado')}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TargetIcon className="h-3 w-3" />
                <span>{getTargetLabel()}</span>
              </div>
            </div>
          </div>

          {/* Content preview */}
          {message.content_type === 'message' && message.message_content && (
            <p className="text-sm text-muted-foreground truncate mb-2 pl-11">
              {message.message_content}
            </p>
          )}

          {/* Meta info */}
          <div className="flex items-center gap-4 pl-11">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(message.next_execution_at || message.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
            </div>
            {message.recurrence_type !== 'once' && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Repeat className="h-3 w-3" />
                <span>{recurrenceLabels[message.recurrence_type]}</span>
              </div>
            )}
            {message.execution_count > 0 && (
              <span className="text-xs text-muted-foreground">
                {message.execution_count}x executado
              </span>
            )}
          </div>
        </div>

        {/* Status and actions */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={cn("text-xs", status.color)}>
            <StatusIcon className={cn("h-3 w-3 mr-1", message.status === 'processing' && 'animate-spin')} />
            {status.label}
          </Badge>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {message.status === 'pending' && (
                <DropdownMenuItem onClick={() => onCancel(message.id)}>
                  <Pause className="h-4 w-4 mr-2" />
                  Cancelar
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-destructive"
                onClick={() => onDelete(message.id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Error message */}
      {message.status === 'failed' && message.error_message && (
        <div className="mt-3 p-2 rounded bg-red-500/10 text-red-500 text-xs flex items-center gap-2">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          {message.error_message}
        </div>
      )}
    </div>
  );
}
