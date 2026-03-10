import { useState } from 'react';
import { 
  MoreHorizontal, 
  Archive, 
  CheckCircle, 
  Trash2,
  Kanban,
  Star,
  ExternalLink,
  Loader2,
  MailWarning,
  EyeOff,
  ArrowRightLeft,
  UserPlus
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { DbConversation } from '@/hooks/useConversations';
import { usePipelines, usePipelineColumns, useMoveConversation, useTransferConversation } from '@/hooks/usePipelines';
import { useNavigate } from 'react-router-dom';
import { ShareConversationDialog } from './ShareConversationDialog';

interface ConversationCardActionsProps {
  conversation: DbConversation;
  variant?: 'icon' | 'minimal';
  onOpenChat?: () => void;
  onSpyView?: () => void;
}

export function ConversationCardActions({ 
  conversation, 
  variant = 'icon',
  onOpenChat,
  onSpyView
}: ConversationCardActionsProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: pipelines } = usePipelines();
  const moveConversation = useMoveConversation();
  const transferConversation = useTransferConversation();

  const handleStatusChange = async (status: 'open' | 'pending' | 'resolved' | 'archived', e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ status })
        .eq('id', conversation.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-positions'] });
      
      const statusLabels: Record<string, string> = {
        open: 'aberta',
        resolved: 'resolvida',
        archived: 'arquivada',
      };
      
      toast({
        title: 'Status atualizado',
        description: `Conversa marcada como ${statusLabels[status]}`,
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o status',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveFromPipeline = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsUpdating(true);
    try {
      // Remove from all pipeline positions
      const { error } = await supabase
        .from('conversation_pipeline_positions')
        .delete()
        .eq('conversation_id', conversation.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['conversation-positions'] });
      
      toast({
        title: 'Removido do pipeline',
        description: 'A conversa foi removida de todas as colunas',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível remover do pipeline',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMoveToColumn = async (pipelineId: string, columnId: string) => {
    console.log('handleMoveToColumn called:', { pipelineId, columnId, conversationId: conversation.id });
    setIsUpdating(true);
    try {
      await moveConversation.mutateAsync({
        conversationId: conversation.id,
        pipelineId,
        columnId,
      });
      console.log('Move successful');
      toast({
        title: 'Conversa movida',
        description: 'A conversa foi movida para a nova coluna',
      });
    } catch (error) {
      console.error('Error moving conversation:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível mover a conversa',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOpenInConversations = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/conversations?id=${conversation.id}`);
  };

  const handleOpenClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenChat) {
      onOpenChat();
    } else {
      navigate(`/conversations?id=${conversation.id}`);
    }
  };

  const handleMarkUnread = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ unread_count: 1 })
        .eq('id', conversation.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: 'Marcada como não lida',
        description: 'A conversa será destacada para os atendentes.',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível marcar como não lida',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSpyView = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSpyView) {
      onSpyView();
    } else {
      navigate(`/conversations?id=${conversation.id}&spy=true`);
    }
  };

  const handleTransfer = async (targetPipelineId: string) => {
    setIsUpdating(true);
    try {
      await transferConversation.mutateAsync({
        conversationId: conversation.id,
        targetPipelineId,
      });
      toast({
        title: 'Conversa transferida',
        description: 'A conversa foi transferida para o novo departamento',
      });
    } catch (error) {
      // toast already handled by hook
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button 
          variant="ghost" 
          size="icon" 
          className={variant === 'minimal' ? 'h-6 w-6' : 'h-7 w-7'}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MoreHorizontal className="h-3.5 w-3.5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        {/* Open */}
        <DropdownMenuItem onClick={handleOpenClick}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Abrir conversa
        </DropdownMenuItem>

        <DropdownMenuItem onClick={(e) => handleMarkUnread(e)}>
          <MailWarning className="h-4 w-4 mr-2 text-amber-500" />
          Marcar como não lida
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSpyView}>
          <EyeOff className="h-4 w-4 mr-2 text-blue-500" />
          Modo espião
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShowShareDialog(true); }}>
          <UserPlus className="h-4 w-4 mr-2 text-blue-500" />
          Compartilhar com membro
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={(e) => handleStatusChange('resolved', e)}>
          <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
          Marcar resolvida
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => handleStatusChange('pending', e)}>
          <Star className="h-4 w-4 mr-2 text-amber-500" />
          Marcar pendente
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => handleStatusChange('archived', e)}>
          <Archive className="h-4 w-4 mr-2" />
          Arquivar
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />

        {/* Transfer between pipelines */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Transferir para...
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            {!pipelines || pipelines.length <= 1 ? (
              <DropdownMenuItem disabled>Nenhum outro pipeline</DropdownMenuItem>
            ) : (
              pipelines.map(pipeline => (
                <DropdownMenuItem
                  key={pipeline.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTransfer(pipeline.id);
                  }}
                >
                  {pipeline.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Kanban className="h-4 w-4 mr-2" />
            Mover para
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            {!pipelines || pipelines.length === 0 ? (
              <DropdownMenuItem disabled>Nenhum pipeline</DropdownMenuItem>
            ) : (
              pipelines.map(pipeline => (
                <PipelineColumnSubmenu 
                  key={pipeline.id}
                  pipeline={pipeline}
                  onSelectColumn={(columnId) => handleMoveToColumn(pipeline.id, columnId)}
                />
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem 
          onClick={(e) => handleRemoveFromPipeline(e)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Remover do pipeline
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Submenu for pipeline columns
function PipelineColumnSubmenu({ 
  pipeline, 
  onSelectColumn 
}: { 
  pipeline: { id: string; name: string }; 
  onSelectColumn: (columnId: string) => Promise<void>;
}) {
  const { data: columns } = usePipelineColumns(pipeline.id);
  
  const handleColumnClick = async (columnId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await onSelectColumn(columnId);
  };
  
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
        {pipeline.name}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent onClick={(e) => e.stopPropagation()}>
        {!columns || columns.length === 0 ? (
          <DropdownMenuItem disabled>Sem colunas</DropdownMenuItem>
        ) : (
          columns.map(column => (
            <DropdownMenuItem 
              key={column.id}
              onSelect={(e) => {
                e.preventDefault();
              }}
              onClick={(e) => handleColumnClick(column.id, e)}
            >
              <div 
                className="h-2 w-2 rounded-full mr-2" 
                style={{ backgroundColor: column.color || '#888' }} 
              />
              {column.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
