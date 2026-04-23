import { useState } from 'react';
import {
  MoreVertical,
  Archive,
  CheckCircle,
  Ban,
  Tag,
  Kanban,
  Star,
  Image,
  Link,
  FileDown,
  RefreshCw,
  Loader2,
  RotateCcw,
  Trash2,
  MailWarning,
  Bot,
  UserCheck,
  UserPlus,
  CircleSlash,
  CheckCheck
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { DbConversation } from '@/hooks/useConversations';
import { useTags, useContactTags, useAddTagToContact, useRemoveTagFromContact } from '@/hooks/useTags';
import { usePipelines, usePipelineColumns, useMoveConversation } from '@/hooks/usePipelines';
import { cn } from '@/lib/utils';
import { ShareConversationDialog } from './ShareConversationDialog';

interface ConversationActionsMenuProps {
  conversation: DbConversation;
  onShowMediaGallery?: () => void;
}

export function ConversationActionsMenu({ conversation, onShowMediaGallery }: ConversationActionsMenuProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const queryClient = useQueryClient();
  const isArchived = conversation.status === 'archived';
  const isClosed = (conversation as any).status === 'closed' || !!(conversation as any).closed_at;

  const cancelPendingChatFollowUps = async (reason: string) => {
    const patch = {
      status: 'completed',
      timeout_at: null,
      completed_at: new Date().toISOString(),
      error_message: reason,
    } as any;
    const base = () =>
      supabase
        .from('flow_executions')
        .update(patch)
        .eq('conversation_id', conversation.id)
        .in('status', ['waiting_input', 'running']);
    // 1) Follow-ups iniciados pelo chat (current_node_id = 'chat-follow-up')
    await base().eq('current_node_id', 'chat-follow-up');
    // 2) Qualquer execução em remarketing avançada (remarketing_step > 0)
    await base().gt('remarketing_step', 0);
    // 3) Execuções marcadas por variables.source = 'chat_follow_up'
    await base().eq('variables->>source', 'chat_follow_up');
  };

  const { data: tags } = useTags();
  const { data: contactTags } = useContactTags(conversation.contact?.id || null);
  const { data: pipelines } = usePipelines();

  const addTagMutation = useAddTagToContact();
  const removeTagMutation = useRemoveTagFromContact();
  const moveConversation = useMoveConversation();

  // Fetch all columns for all pipelines
  const [allColumns, setAllColumns] = useState<Record<string, any[]>>({});

  // Load columns when pipelines are available
  const loadColumnsForPipeline = async (pipelineId: string) => {
    if (allColumns[pipelineId]) return allColumns[pipelineId];

    const { data } = await (supabase as any)
      .from('pipeline_columns')
      .select('*')
      .eq('pipeline_id', pipelineId)
      .order('order');

    if (data) {
      setAllColumns(prev => ({ ...prev, [pipelineId]: data }));
    }
    return data || [];
  };

  const handleStatusChange = async (status: 'open' | 'pending' | 'resolved' | 'closed' | 'archived') => {
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
      const labels: Record<string, string> = {
        open: 'aberta',
        closed: 'encerrada',
        archived: 'arquivada',
        resolved: 'resolvida',
        pending: 'pendente',
      };
      toast({
        title: 'Status atualizado',
        description: `Conversa marcada como ${labels[status] || status}`,
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

  const handleTogglePriority = async () => {
    setIsUpdating(true);
    try {
      // Get current metadata safely
      const { data: currentConv } = await supabase
        .from('conversations')
        .select('metadata')
        .eq('id', conversation.id)
        .single();

      const currentMetadata = (currentConv?.metadata as Record<string, unknown>) || {};
      const currentPriority = currentMetadata?.priority || false;

      const { error } = await supabase
        .from('conversations')
        .update({
          metadata: {
            ...currentMetadata,
            priority: !currentPriority
          }
        })
        .eq('id', conversation.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: currentPriority ? 'Prioridade removida' : 'Marcado como prioritário',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar prioridade',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleBlockContact = async () => {
    if (!conversation.contact?.id) return;

    setIsUpdating(true);
    try {
      const { data: currentContact } = await supabase
        .from('contacts')
        .select('metadata')
        .eq('id', conversation.contact.id)
        .single();

      const currentMetadata = (currentContact?.metadata as Record<string, unknown>) || {};

      const { error } = await supabase
        .from('contacts')
        .update({
          metadata: {
            ...currentMetadata,
            blocked: true
          }
        })
        .eq('id', conversation.contact.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: 'Contato bloqueado',
        description: 'Este contato não poderá mais enviar mensagens',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível bloquear o contato',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleTagToggle = async (tagId: string) => {
    if (!conversation.contact?.id) return;

    const isTagged = contactTags?.some(ct => ct.tag_id === tagId);
    if (isTagged) {
      await removeTagMutation.mutateAsync({ contactId: conversation.contact.id, tagId });
    } else {
      await addTagMutation.mutateAsync({ contactId: conversation.contact.id, tagId, addedByType: 'manual' });
    }
  };

  const handleMoveToColumn = async (pipelineId: string, columnId: string) => {
    await moveConversation.mutateAsync({
      conversationId: conversation.id,
      pipelineId,
      columnId,
    });
  };

  const handleExport = async (format: 'txt' | 'json') => {
    setIsUpdating(true);
    try {
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (!messages) throw new Error('Sem mensagens');

      let content: string;
      let filename: string;
      let mimeType: string;

      if (format === 'txt') {
        content = messages.map(m => {
          const time = new Date(m.created_at).toLocaleString('pt-BR');
          const sender = m.direction === 'inbound' ? 'Cliente' : (m.is_from_bot ? 'IA' : 'Atendente');
          return `[${time}] ${sender}: ${m.content || `[${m.type}]`}`;
        }).join('\n');
        filename = `conversa-${conversation.contact?.phone || conversation.id}.txt`;
        mimeType = 'text/plain';
      } else {
        content = JSON.stringify({ conversation, messages }, null, 2);
        filename = `conversa-${conversation.contact?.phone || conversation.id}.json`;
        mimeType = 'application/json';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Conversa exportada' });
    } catch (error) {
      toast({
        title: 'Erro ao exportar',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/conversations?id=${conversation.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copiado!' });
  };

  const handleReload = () => {
    queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
    toast({ title: 'Recarregando histórico...' });
  };

  const handleMarkUnread = async () => {
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

  const handleRestoreConversation = async () => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ status: 'open' })
        .eq('id', conversation.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: 'Conversa restaurada',
        description: 'A conversa foi movida de volta para abertas',
      });
    } catch (error) {
      toast({
        title: 'Erro ao restaurar',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeletePermanently = async () => {
    setIsUpdating(true);
    try {
      // Delete messages first
      await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', conversation.id);

      // Delete pipeline positions
      await supabase
        .from('conversation_pipeline_positions')
        .delete()
        .eq('conversation_id', conversation.id);

      // Delete conversation
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversation.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setShowDeleteDialog(false);
      toast({
        title: 'Conversa excluída',
        description: 'A conversa foi removida permanentemente',
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir a conversa',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={isUpdating}>
          {isUpdating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreVertical className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Service Mode Toggle */}
        {(() => {
          const currentMode = (conversation as any).service_mode || 'pendente';
          const isIA = currentMode === 'ia';
          return (
            <>
              {currentMode === 'pendente' && (
                <DropdownMenuItem onClick={async () => {
                  setIsUpdating(true);
                  try {
                    const { error } = await supabase.from('conversations').update({ service_mode: 'ativo' } as any).eq('id', conversation.id);
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ['conversations'] });
                    toast({ title: 'Atendimento assumido', description: 'Você agora está responsável por esta conversa.' });
                  } catch { toast({ title: 'Erro ao assumir', variant: 'destructive' }); } finally { setIsUpdating(false); }
                }}>
                  <UserCheck className="h-4 w-4 mr-2 text-green-500" />
                  Assumir Atendimento
                </DropdownMenuItem>
              )}
              {currentMode === 'ativo' && (
                <DropdownMenuItem onClick={async () => {
                  setIsUpdating(true);
                  try {
                    const { error } = await supabase.from('conversations').update({ service_mode: 'pendente' } as any).eq('id', conversation.id);
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ['conversations'] });
                    toast({ title: 'Devolvido para fila', description: 'A conversa está aguardando atendimento.' });
                  } catch { toast({ title: 'Erro ao devolver', variant: 'destructive' }); } finally { setIsUpdating(false); }
                }}>
                  <RotateCcw className="h-4 w-4 mr-2 text-yellow-500" />
                  Devolver para Fila
                </DropdownMenuItem>
              )}
              {currentMode !== 'ia' ? (
                <DropdownMenuItem onClick={async () => {
                  setIsUpdating(true);
                  try {
                    const { error } = await supabase.from('conversations').update({ service_mode: 'ia' } as any).eq('id', conversation.id);
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ['conversations'] });
                    toast({ title: 'IA ativada', description: 'O agente master foi ativado para esta conversa.' });
                  } catch { toast({ title: 'Erro ao ativar IA', variant: 'destructive' }); } finally { setIsUpdating(false); }
                }}>
                  <Bot className="h-4 w-4 mr-2 text-purple-500" />
                  Ativar IA (agente master)
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={async () => {
                  setIsUpdating(true);
                  try {
                    const { data: currentConv } = await supabase
                      .from('conversations')
                      .select('metadata')
                      .eq('id', conversation.id)
                      .single();

                    const currentMetadata = (currentConv?.metadata as Record<string, unknown>) || {};

                    const { error } = await supabase
                      .from('conversations')
                      .update({
                        service_mode: 'ativo',
                        metadata: { ...currentMetadata, ai_paused_until: 'permanent' }
                      } as any)
                      .eq('id', conversation.id);
                    if (error) throw error;

                    await cancelPendingChatFollowUps('Cancelled: AI deactivated by human agent');

                    queryClient.invalidateQueries({ queryKey: ['conversations'] });
                    queryClient.invalidateQueries({ queryKey: ['follow-up-status'] });
                    toast({ title: 'IA desativada', description: 'Você assumiu o atendimento desta conversa.' });
                  } catch { toast({ title: 'Erro ao desativar', variant: 'destructive' }); } finally { setIsUpdating(false); }
                }}>
                  <UserCheck className="h-4 w-4 mr-2 text-green-500" />
                  Assumir Atendimento (Desativar IA)
                </DropdownMenuItem>
              )}
            </>
          );
        })()}

        <DropdownMenuSeparator />

        {/* Status Actions: close / reopen / archive / unarchive */}
        {!isArchived && !isClosed && (
          <DropdownMenuItem onClick={() => handleStatusChange('closed' as any)}>
            <CheckCheck className="h-4 w-4 mr-2 text-emerald-500" />
            Encerrar atendimento
          </DropdownMenuItem>
        )}
        {isClosed && !isArchived && (
          <DropdownMenuItem onClick={() => handleStatusChange('open')}>
            <RefreshCw className="h-4 w-4 mr-2 text-blue-500" />
            Reabrir atendimento
          </DropdownMenuItem>
        )}
        {conversation.status === 'archived' ? (
          <DropdownMenuItem onClick={() => handleStatusChange('open')}>
            <RefreshCw className="h-4 w-4 mr-2 text-blue-500" />
            Desarquivar conversa
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => handleStatusChange('archived')}>
            <Archive className="h-4 w-4 mr-2" />
            Arquivar conversa
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleTogglePriority}>
          <Star className="h-4 w-4 mr-2" />
          Marcar como prioritária
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleMarkUnread}>
          <MailWarning className="h-4 w-4 mr-2 text-amber-500" />
          Marcar como não lida
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setShowShareDialog(true)}>
          <UserPlus className="h-4 w-4 mr-2 text-blue-500" />
          Compartilhar com membro
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Tags Submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Tag className="h-4 w-4 mr-2" />
            Tags
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            {!tags || tags.length === 0 ? (
              <DropdownMenuItem disabled>Nenhuma tag criada</DropdownMenuItem>
            ) : (
              tags.map(tag => {
                const isTagged = contactTags?.some(ct => ct.tag_id === tag.id);
                return (
                  <DropdownMenuItem
                    key={tag.id}
                    onClick={() => handleTagToggle(tag.id)}
                  >
                    <div
                      className="h-3 w-3 rounded-full mr-2"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1">{tag.name}</span>
                    {isTagged && <CheckCircle className="h-3 w-3 text-primary" />}
                  </DropdownMenuItem>
                );
              })
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Pipeline Submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Kanban className="h-4 w-4 mr-2" />
            Mover para Pipeline
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            {!pipelines || pipelines.length === 0 ? (
              <DropdownMenuItem disabled>Nenhum pipeline criado</DropdownMenuItem>
            ) : (
              pipelines.map(pipeline => (
                <PipelineSubmenu
                  key={pipeline.id}
                  pipeline={pipeline}
                  onSelectColumn={(columnId) => handleMoveToColumn(pipeline.id, columnId)}
                />
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {/* Media & Export */}
        {onShowMediaGallery && (
          <DropdownMenuItem onClick={onShowMediaGallery}>
            <Image className="h-4 w-4 mr-2" />
            Ver mídia compartilhada
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleCopyLink}>
          <Link className="h-4 w-4 mr-2" />
          Copiar link da conversa
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FileDown className="h-4 w-4 mr-2" />
            Exportar conversa
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => handleExport('txt')}>
              Texto (.txt)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('json')}>
              JSON (.json)
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem onClick={handleReload}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Recarregar histórico
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Archived actions */}
        {isArchived && (
          <DropdownMenuItem onClick={handleRestoreConversation}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Restaurar conversa
          </DropdownMenuItem>
        )}

        {/* Delete - always available */}
        <DropdownMenuItem
          onClick={() => setShowDeleteDialog(true)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Excluir conversa
        </DropdownMenuItem>

        {/* Danger Zone */}
        <DropdownMenuItem
          onClick={handleBlockContact}
          className="text-destructive focus:text-destructive"
        >
          <Ban className="h-4 w-4 mr-2" />
          Bloquear contato
        </DropdownMenuItem>
      </DropdownMenuContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todas as mensagens, arquivos e histórico
              desta conversa serão removidos permanentemente do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePermanently}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ShareConversationDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        conversationId={conversation.id}
        contactName={conversation.contact?.name || undefined}
      />
    </DropdownMenu>
  );
}

// Submenu for pipeline columns (loaded on demand)
function PipelineSubmenu({
  pipeline,
  onSelectColumn
}: {
  pipeline: { id: string; name: string };
  onSelectColumn: (columnId: string) => void;
}) {
  const { data: columns } = usePipelineColumns(pipeline.id);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{pipeline.name}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {!columns || columns.length === 0 ? (
          <DropdownMenuItem disabled>Sem colunas</DropdownMenuItem>
        ) : (
          columns.map(column => (
            <DropdownMenuItem
              key={column.id}
              onClick={() => onSelectColumn(column.id)}
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
