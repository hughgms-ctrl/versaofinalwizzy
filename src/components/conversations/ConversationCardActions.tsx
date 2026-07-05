import { useMemo, useState } from 'react';
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
  UserPlus,
  CheckCheck,
  RefreshCw,
  Tag,
  Plus
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { DbConversation } from '@/hooks/useConversations';
import { usePipelines, usePipelineColumns, useMoveConversation, useTransferConversationToWorkspace, Pipeline } from '@/hooks/usePipelines';
import { Workspace } from '@/hooks/useWorkspaces';
import { useTags, useContactTags, useAddTagToContact, useRemoveTagFromContact, useCreateTag } from '@/hooks/useTags';
import { useNavigate } from 'react-router-dom';
import { ShareConversationDialog } from './ShareConversationDialog';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

const TAG_PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6b7280', // gray
];

interface ConversationCardActionsProps {
  conversation: DbConversation;
  variant?: 'icon' | 'minimal';
  onOpenChat?: () => void;
  onSpyView?: () => void;
  workspaceId?: string | null;
}

export function ConversationCardActions({ 
  conversation, 
  variant = 'icon',
  onOpenChat,
  onSpyView,
  workspaceId
}: ConversationCardActionsProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showCreateTagDialog, setShowCreateTagDialog] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_PRESET_COLORS[0]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: pipelines } = usePipelines();
  const { selectedWorkspaceId, selectedOrganizationId, allAvailableWorkspaces } = useWorkspaceContext();
  const moveConversation = useMoveConversation();
  const transferToWorkspace = useTransferConversationToWorkspace();
  const activeWorkspaceId = workspaceId ?? selectedWorkspaceId;

  const contactId = conversation.contact?.id || null;
  const { data: tags } = useTags();
  const { data: contactTags } = useContactTags(contactId);
  const addTag = useAddTagToContact();
  const removeTag = useRemoveTagFromContact();
  const createTag = useCreateTag();

  const handleTagToggle = async (tagId: string) => {
    if (!contactId) return;
    const isTagged = contactTags?.some(ct => ct.tag_id === tagId);
    try {
      if (isTagged) {
        await removeTag.mutateAsync({ contactId, tagId });
      } else {
        await addTag.mutateAsync({ contactId, tagId, addedByType: 'manual' });
      }
      // Refresh the tag chips rendered on the pipeline cards (['all-contact-tags'])
      queryClient.invalidateQueries({ queryKey: ['all-contact-tags'] });
    } catch (error) {
      // errors are surfaced via the mutation's own toast
    }
  };

  const handleCreateTag = async () => {
    if (!contactId || !newTagName.trim()) return;
    try {
      const tag = await createTag.mutateAsync({
        name: newTagName.trim(),
        color: newTagColor,
        workspace_id: activeWorkspaceId,
      });
      await addTag.mutateAsync({ contactId, tagId: tag.id, addedByType: 'manual' });
      queryClient.invalidateQueries({ queryKey: ['all-contact-tags'] });
      setShowCreateTagDialog(false);
      setNewTagName('');
      setNewTagColor(TAG_PRESET_COLORS[0]);
    } catch (error) {
      // errors are surfaced via the mutation's own toast
    }
  };
  const visiblePipelines = useMemo(() => {
    if (!pipelines) return [];
    if (!activeWorkspaceId) return pipelines.filter(pipeline => Array.isArray(pipeline.workspace_ids) && pipeline.workspace_ids.length > 0);
    return pipelines.filter(pipeline => pipeline.workspace_ids?.includes(activeWorkspaceId));
  }, [pipelines, activeWorkspaceId]);

  // Workspaces the user can transfer this card to: only workspaces they have access
  // to, within the same organization as the current board/conversation.
  const transferWorkspaces = useMemo(() => {
    if (!selectedOrganizationId) return [];
    return allAvailableWorkspaces.filter(ws => ws.organization_id === selectedOrganizationId);
  }, [allAvailableWorkspaces, selectedOrganizationId]);

  const isClosed = (conversation as any).status === 'closed' || !!(conversation as any).closed_at;

  const handleStatusChange = async (status: 'open' | 'pending' | 'resolved' | 'closed' | 'archived', e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsUpdating(true);
    try {
      const patch: any = { status };
      if (status === 'closed') patch.closed_at = new Date().toISOString();
      if (status === 'open') patch.closed_at = null;

      const { error } = await supabase
        .from('conversations')
        .update(patch)
        .eq('id', conversation.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-positions'] });
      
      const statusLabels: Record<string, string> = {
        open: 'aberta',
        closed: 'encerrada',
        resolved: 'resolvida',
        archived: 'arquivada',
      };
      
      toast({
        title: 'Status atualizado',
        description: `Conversa marcada como ${statusLabels[status] || status}`,
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
        skipAutoTransition: true,
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

  const handleTransferToWorkspace = async (
    targetWorkspaceId: string,
    targetPipelineId: string,
    targetColumnId: string,
  ) => {
    setIsUpdating(true);
    try {
      await transferToWorkspace.mutateAsync({
        conversationId: conversation.id,
        contactId,
        targetWorkspaceId,
        targetPipelineId,
        targetColumnId,
      });
      toast({
        title: 'Conversa transferida',
        description: 'A conversa foi movida para o workspace de destino',
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

        {/* Tags */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Tag className="h-4 w-4 mr-2 text-blue-500" />
            Adicionar tags
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            {!contactId ? (
              <DropdownMenuItem disabled>Contato indisponível</DropdownMenuItem>
            ) : (
              <>
                {(!tags || tags.length === 0) ? (
                  <DropdownMenuItem disabled>Nenhuma tag criada</DropdownMenuItem>
                ) : (
                  tags.map(tag => {
                    const isTagged = contactTags?.some(ct => ct.tag_id === tag.id);
                    return (
                      <DropdownMenuItem
                        key={tag.id}
                        onClick={(e) => { e.stopPropagation(); handleTagToggle(tag.id); }}
                      >
                        <div
                          className="h-3 w-3 rounded-full mr-2 shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="flex-1 truncate">{tag.name}</span>
                        {isTagged && <CheckCircle className="h-3 w-3 text-primary ml-2 shrink-0" />}
                      </DropdownMenuItem>
                    );
                  })
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); setShowCreateTagDialog(true); }}
                >
                  <Plus className="h-4 w-4 mr-2 text-emerald-500" />
                  Criar nova tag
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        {!isClosed && conversation.status !== 'archived' && (
          <DropdownMenuItem onClick={(e) => handleStatusChange('closed' as any, e)}>
            <CheckCheck className="h-4 w-4 mr-2 text-emerald-500" />
            Encerrar atendimento
          </DropdownMenuItem>
        )}
        {isClosed && conversation.status !== 'archived' && (
          <DropdownMenuItem onClick={(e) => handleStatusChange('open', e)}>
            <RefreshCw className="h-4 w-4 mr-2 text-blue-500" />
            Reabrir atendimento
          </DropdownMenuItem>
        )}
        {conversation.status === 'archived' ? (
          <DropdownMenuItem onClick={(e) => handleStatusChange('open', e)}>
            <CheckCircle className="h-4 w-4 mr-2 text-blue-500" />
            Desarquivar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={(e) => handleStatusChange('archived', e)}>
            <Archive className="h-4 w-4 mr-2" />
            Arquivar
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />

        {/* Transfer to a pipeline/column in another workspace */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Transferir para...
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            {transferWorkspaces.length === 0 ? (
              <DropdownMenuItem disabled>Nenhum workspace disponível</DropdownMenuItem>
            ) : (
              transferWorkspaces.map(ws => (
                <TransferWorkspaceSubmenu
                  key={ws.id}
                  workspace={ws}
                  pipelines={(pipelines || []).filter(p => p.workspace_ids?.includes(ws.id))}
                  onSelectColumn={(pipelineId, columnId) => handleTransferToWorkspace(ws.id, pipelineId, columnId)}
                />
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
            {visiblePipelines.length === 0 ? (
              <DropdownMenuItem disabled>Nenhum pipeline</DropdownMenuItem>
            ) : (
              visiblePipelines.map(pipeline => (
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

      <ShareConversationDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        conversationId={conversation.id}
        contactName={conversation.contact?.name || undefined}
      />

      <Dialog open={showCreateTagDialog} onOpenChange={setShowCreateTagDialog}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Criar nova tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome</label>
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Ex: Cliente VIP"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateTag();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cor</label>
              <div className="flex flex-wrap gap-2">
                {TAG_PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="h-7 w-7 rounded-full flex items-center justify-center ring-offset-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: color }}
                    onClick={() => setNewTagColor(color)}
                  >
                    {newTagColor === color && <CheckCircle className="h-4 w-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
            <div
              className="inline-flex items-center rounded px-2 py-1 text-xs font-semibold"
              style={{
                backgroundColor: `${newTagColor}20`,
                color: newTagColor,
              }}
            >
              {newTagName.trim() || 'Prévia da tag'}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTagDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateTag}
              disabled={!newTagName.trim() || createTag.isPending || addTag.isPending}
            >
              {(createTag.isPending || addTag.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar e adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
              onClick={(e) => {
                e.stopPropagation();
                onSelectColumn(column.id);
              }}
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

// Submenu for transferring a card into another workspace:
// workspace -> pipeline -> column
function TransferWorkspaceSubmenu({
  workspace,
  pipelines,
  onSelectColumn,
}: {
  workspace: Workspace;
  pipelines: Pipeline[];
  onSelectColumn: (pipelineId: string, columnId: string) => Promise<void>;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
        <div
          className="h-2 w-2 rounded-full mr-2 shrink-0"
          style={{ backgroundColor: workspace.color || '#888' }}
        />
        <span className="flex-1 truncate">{workspace.name}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent onClick={(e) => e.stopPropagation()} className="w-48">
        {pipelines.length === 0 ? (
          <DropdownMenuItem disabled>Nenhum pipeline</DropdownMenuItem>
        ) : (
          pipelines.map(pipeline => (
            <PipelineColumnSubmenu
              key={pipeline.id}
              pipeline={pipeline}
              onSelectColumn={(columnId) => onSelectColumn(pipeline.id, columnId)}
            />
          ))
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
