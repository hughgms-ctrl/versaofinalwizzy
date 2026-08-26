import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  useScheduledMessages, 
  useCancelScheduledMessage, 
  useDeleteScheduledMessage,
  useSetScheduledMessagePaused,
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
  Play,
  Trash2,
  Ban,
  Pencil,
  Timer,
  CalendarPlus,
  Folder,
  FolderPlus,
  FolderInput,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiWorkspaceSelector } from '@/components/shared/MultiWorkspaceSelector';
import {
  ScheduledMessageFolder,
  useCreateScheduledMessageFolder,
  useDeleteScheduledMessageFolder,
  useMoveScheduledMessageToFolder,
  useScheduledMessageFolders,
  useUpdateScheduledMessageFolder,
} from '@/hooks/useScheduledMessageFolders';
import { confirmDialog } from '@/lib/confirmDialog';
import { cn } from '@/lib/utils';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { EditScheduledMessageDialog } from './EditScheduledMessageDialog';
import { CreateScheduledMessageDialog } from './CreateScheduledMessageDialog';
import { ScheduledMessageDetailDialog } from './ScheduledMessageDetailDialog';

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

const PAGE_SIZE_OPTIONS = [10, 50, 100, 500];

function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter(pageNumber => totalPages <= 7 || pageNumber === 1 || pageNumber === totalPages || Math.abs(pageNumber - page) <= 2);

  return (
    <div className="flex flex-col gap-3 border-t pt-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Exibir</span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map(option => (
              <SelectItem key={option} value={String(option)}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>{start}-{end} de {total}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Anterior
        </Button>
        {pages.map((pageNumber, index) => {
          const previous = pages[index - 1];
          return (
            <span key={pageNumber} className="flex items-center gap-1">
              {previous && pageNumber - previous > 1 && <span className="px-1 text-xs text-muted-foreground">...</span>}
              <Button
                variant={pageNumber === page ? 'default' : 'outline'}
                size="sm"
                className="h-8 min-w-8 px-2"
                onClick={() => onPageChange(pageNumber)}
              >
                {pageNumber}
              </Button>
            </span>
          );
        })}
        <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          Próxima
        </Button>
      </div>
    </div>
  );
}

interface ScheduledMessagesListProps {
  /** Pasta aberta no momento (null = raiz). Controlado pela página para que o
   *  botão "Nova programação" saiba onde criar. */
  openFolderId?: string | null;
  onOpenFolderChange?: (folderId: string | null) => void;
}

export function ScheduledMessagesList({
  openFolderId = null,
  onOpenFolderChange,
}: ScheduledMessagesListProps = {}) {
  const { data: scheduledMessages = [], isLoading } = useScheduledMessages();
  const cancelMutation = useCancelScheduledMessage();
  const deleteMutation = useDeleteScheduledMessage();
  const pauseMutation = useSetScheduledMessagePaused();
  const { data: folders = [], isLoading: foldersLoading, error: foldersError } = useScheduledMessageFolders();
  const createFolder = useCreateScheduledMessageFolder();
  const updateFolder = useUpdateScheduledMessageFolder();
  const deleteFolder = useDeleteScheduledMessageFolder();
  const moveToFolder = useMoveScheduledMessageToFolder();
  const { selectedWorkspaceId, availableWorkspaces, isAdmin } = useWorkspaceContext();

  const [folderDialog, setFolderDialog] = useState<
    | { mode: 'create'; parentId: string | null; workspaceIds: string[] }
    | { mode: 'edit'; folder: ScheduledMessageFolder }
    | null
  >(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<ScheduledMessage | null>(null);
  const [rescheduleMessage, setRescheduleMessage] = useState<ScheduledMessage | null>(null);
  const [detailMessage, setDetailMessage] = useState<ScheduledMessage | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [pendingPage, setPendingPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  const filteredMessages = useMemo(() => {
    if (!selectedWorkspaceId) return scheduledMessages;
    return scheduledMessages.filter(m => !m.workspace_id || m.workspace_id === selectedWorkspaceId);
  }, [scheduledMessages, selectedWorkspaceId]);

  // Pasta sem workspace aparece em todos (mesma regra das pastas de campanha).
  const visibleFolders = useMemo(() => {
    return folders.filter(folder => {
      const wsIds = folder.workspace_ids?.length
        ? folder.workspace_ids
        : (folder.workspace_id ? [folder.workspace_id] : []);
      if (wsIds.length === 0) return true;
      if (!selectedWorkspaceId) return true;
      if (selectedWorkspaceId === 'unassigned') return false;
      return wsIds.includes(selectedWorkspaceId);
    });
  }, [folders, selectedWorkspaceId]);

  const visibleFolderIds = useMemo(() => new Set(visibleFolders.map(f => f.id)), [visibleFolders]);

  // Programação cuja pasta não aparece neste workspace cai na raiz em vez de
  // sumir da tela.
  const folderOf = (message: ScheduledMessage) => {
    const folderId = (message as any).folder_id as string | null | undefined;
    return folderId && visibleFolderIds.has(folderId) ? folderId : null;
  };

  const messagesHere = useMemo(
    () => filteredMessages.filter(m => folderOf(m) === openFolderId),
    [filteredMessages, visibleFolderIds, openFolderId],
  );

  const currentFolders = useMemo(
    () => visibleFolders.filter(f => (f.parent_id ?? null) === openFolderId),
    [visibleFolders, openFolderId],
  );

  const countInFolder = (folderId: string) =>
    filteredMessages.filter(m => folderOf(m) === folderId).length +
    visibleFolders.filter(f => f.parent_id === folderId).length;

  // Trilha raiz -> ... -> pasta aberta (usa a lista completa: uma pasta pai
  // filtrada por workspace ainda precisa aparecer no caminho de volta).
  const breadcrumb = useMemo(() => {
    const chain: ScheduledMessageFolder[] = [];
    const seen = new Set<string>();
    let cursor = openFolderId ? folders.find(f => f.id === openFolderId) : undefined;
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      chain.unshift(cursor);
      cursor = cursor.parent_id ? folders.find(f => f.id === cursor!.parent_id) : undefined;
    }
    return chain;
  }, [folders, openFolderId]);

  // Rótulo com o caminho completo ("Vendas / Black Friday") no menu "Mover para".
  const folderOptions = useMemo(() => {
    const byId = new Map(visibleFolders.map(f => [f.id, f]));
    return visibleFolders
      .map(folder => {
        const parts: string[] = [];
        const seen = new Set<string>();
        let cursor: ScheduledMessageFolder | undefined = folder;
        while (cursor && !seen.has(cursor.id)) {
          seen.add(cursor.id);
          parts.unshift(cursor.name);
          cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
        }
        return { id: folder.id, label: parts.join(' / ') };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [visibleFolders]);

  useEffect(() => {
    setPendingPage(1);
    setHistoryPage(1);
  }, [openFolderId]);

  // Pasta apagada (ou trocou o workspace) enquanto estava aberta: volta à raiz.
  useEffect(() => {
    if (openFolderId && !foldersLoading && !folders.some(f => f.id === openFolderId)) {
      onOpenFolderChange?.(null);
    }
  }, [openFolderId, folders, foldersLoading, onOpenFolderChange]);

  const handleCancel = (id: string) => {
    cancelMutation.mutate(id);
  };

  const handleTogglePause = (message: ScheduledMessage) => {
    pauseMutation.mutate({ id: message.id, paused: !message.paused_at });
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
      setDeleteId(null);
    }
  };

  const handleSubmitFolder = (name: string, workspaceIds: string[]) => {
    if (!folderDialog) return;
    if (folderDialog.mode === 'create') {
      createFolder.mutate({ name, parentId: folderDialog.parentId, workspaceIds });
    } else {
      updateFolder.mutate({ folderId: folderDialog.folder.id, name, workspaceIds });
    }
    setFolderDialog(null);
  };

  const handleDeleteFolder = async (folder: ScheduledMessageFolder) => {
    const confirmed = await confirmDialog(
      `Excluir a pasta "${folder.name}"? As programações e subpastas dentro dela voltam para a raiz.`,
      { title: 'Excluir pasta', confirmLabel: 'Excluir', variant: 'destructive' },
    );
    if (confirmed) deleteFolder.mutate(folder.id);
  };

  const handleMoveToFolder = (messageId: string, folderId: string | null) => {
    moveToFolder.mutate({ messageId, folderId });
  };

  const openCreateFolder = (parentId: string | null) => {
    const parent = parentId ? folders.find(f => f.id === parentId) : null;
    const inherited = parent
      ? (parent.workspace_ids?.length ? parent.workspace_ids : (parent.workspace_id ? [parent.workspace_id] : []))
      : (selectedWorkspaceId && selectedWorkspaceId !== 'unassigned' ? [selectedWorkspaceId] : []);
    setFolderDialog({ mode: 'create', parentId, workspaceIds: inherited });
  };

  if (isLoading || foldersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Com erro nas pastas não caímos no estado vazio — ele esconderia o aviso.
  if (filteredMessages.length === 0 && visibleFolders.length === 0 && !foldersError) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Calendar className="h-16 w-16 mb-4 opacity-30" />
          <p className="text-lg font-medium">Nenhum agendamento</p>
          <p className="text-sm text-center mt-2">
            Crie uma nova programação para enviar mensagens, mídias ou fluxos automaticamente.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => openCreateFolder(null)}>
            <FolderPlus className="h-4 w-4 mr-2" />
            Nova pasta
          </Button>
        </div>

        <FolderFormDialog
          state={folderDialog}
          onClose={() => setFolderDialog(null)}
          onSubmit={handleSubmitFolder}
          isAdmin={isAdmin}
          workspaces={availableWorkspaces}
        />
      </>
    );
  }

  // 'processing' = disparo em andamento (lote sendo processado pelo cron). Fica
  // junto das pendentes para o card NÃO sumir da tela enquanto está enviando.
  const pendingMessages = messagesHere.filter(m => ['pending', 'processing'].includes(m.status));
  const completedMessages = messagesHere.filter(m => ['sent', 'failed', 'cancelled'].includes(m.status));
  const pendingTotalPages = Math.max(1, Math.ceil(pendingMessages.length / pageSize));
  const historyTotalPages = Math.max(1, Math.ceil(completedMessages.length / pageSize));
  const safePendingPage = Math.min(pendingPage, pendingTotalPages);
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);
  const visiblePendingMessages = pendingMessages.slice((safePendingPage - 1) * pageSize, safePendingPage * pageSize);
  const visibleCompletedMessages = completedMessages.slice((safeHistoryPage - 1) * pageSize, safeHistoryPage * pageSize);

  const handlePageSizeChange = (nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPendingPage(1);
    setHistoryPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Trilha de pastas + criar pasta */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
          <button
            onClick={() => onOpenFolderChange?.(null)}
            className={cn('hover:text-foreground transition-colors font-medium', !openFolderId && 'text-foreground')}
          >
            Programados
          </button>
          {breadcrumb.map((folder, index) => (
            <span key={folder.id} className="flex items-center gap-1">
              <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
              <button
                onClick={() => onOpenFolderChange?.(folder.id)}
                className={cn(
                  'hover:text-foreground transition-colors font-medium',
                  index === breadcrumb.length - 1 && 'text-foreground',
                )}
              >
                {folder.name}
              </button>
            </span>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={() => openCreateFolder(openFolderId)}>
          <FolderPlus className="h-4 w-4 mr-2" />
          Nova pasta
        </Button>
      </div>

      {/* Sem isto a tela mostraria "nenhuma pasta" como se o banco estivesse vazio. */}
      {foldersError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          Não foi possível carregar as pastas: {(foldersError as any)?.message || 'erro desconhecido'}
          {(foldersError as any)?.code ? ` (${(foldersError as any).code})` : ''}
        </div>
      )}

      {currentFolders.length > 0 && (
        <div className="space-y-3">
          {currentFolders.map(folder => {
            const itemCount = countInFolder(folder.id);
            const wsIds = folder.workspace_ids?.length
              ? folder.workspace_ids
              : (folder.workspace_id ? [folder.workspace_id] : []);
            return (
              <div
                key={folder.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenFolderChange?.(folder.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenFolderChange?.(folder.id);
                  }
                }}
                className="group flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Folder className="h-4 w-4 text-amber-500" />
                </div>
                <span className="flex-1 min-w-0 font-medium text-foreground truncate">{folder.name}</span>

                {wsIds.length > 0 && (
                  <div className="hidden md:flex items-center gap-1 max-w-[180px] overflow-hidden">
                    {wsIds.slice(0, 2).map(id => {
                      const ws = availableWorkspaces.find(w => w.id === id);
                      if (!ws) return null;
                      return (
                        <div
                          key={ws.id}
                          className="px-2 py-0.5 rounded-[4px] border shrink-0"
                          style={{ backgroundColor: `${ws.color}15`, borderColor: `${ws.color}30` }}
                        >
                          <span className="text-[10px] font-medium" style={{ color: ws.color }}>{ws.name}</span>
                        </div>
                      );
                    })}
                    {wsIds.length > 2 && <span className="text-[10px] text-muted-foreground">+{wsIds.length - 2}</span>}
                  </div>
                )}

                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                </span>

                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setFolderDialog({ mode: 'edit', folder })}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openCreateFolder(folder.id)}>
                        <FolderPlus className="h-4 w-4 mr-2" />
                        Nova subpasta
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteFolder(folder)}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir pasta
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
              </div>
            );
          })}
        </div>
      )}

      {pendingMessages.length === 0 && completedMessages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Calendar className="h-10 w-10 mb-4 opacity-30" />
          <p className="text-sm">
            {openFolderId ? 'Nenhuma programação nesta pasta' : 'Nenhuma programação fora das pastas'}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Use "Nova programação" para criar {openFolderId ? 'uma aqui dentro' : 'uma agora'}.
          </p>
        </div>
      )}

      {pendingMessages.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            Programações pendentes ({pendingMessages.length})
          </h2>
          <div className="space-y-3">
            {visiblePendingMessages.map(message => (
              <ScheduledMessageCard
                key={message.id}
                message={message}
                onCancel={handleCancel}
                onTogglePause={handleTogglePause}
                onDelete={setDeleteId}
                onEdit={setEditMessage}
                onReschedule={setRescheduleMessage}
                onOpenDetail={setDetailMessage}
                folderOptions={folderOptions}
                currentFolderId={folderOf(message)}
                onMoveToFolder={handleMoveToFolder}
              />
            ))}
          </div>
          <PaginationControls
            page={safePendingPage}
            pageSize={pageSize}
            total={pendingMessages.length}
            onPageChange={setPendingPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      )}

      {completedMessages.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-muted-foreground" />
            Histórico ({completedMessages.length})
          </h2>
          <div className="space-y-3">
            {visibleCompletedMessages.map(message => (
              <ScheduledMessageCard
                key={message.id}
                message={message}
                onCancel={handleCancel}
                onTogglePause={handleTogglePause}
                onDelete={setDeleteId}
                onEdit={setEditMessage}
                onReschedule={setRescheduleMessage}
                onOpenDetail={setDetailMessage}
                folderOptions={folderOptions}
                currentFolderId={folderOf(message)}
                onMoveToFolder={handleMoveToFolder}
              />
            ))}
          </div>
          <PaginationControls
            page={safeHistoryPage}
            pageSize={pageSize}
            total={completedMessages.length}
            onPageChange={setHistoryPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      )}

      <FolderFormDialog
        state={folderDialog}
        onClose={() => setFolderDialog(null)}
        onSubmit={handleSubmitFolder}
        isAdmin={isAdmin}
        workspaces={availableWorkspaces}
      />

      {/* Painel do disparo: progresso, fila e não entregues (clique no card) */}
      <ScheduledMessageDetailDialog
        open={!!detailMessage}
        onOpenChange={(open) => !open && setDetailMessage(null)}
        message={detailMessage}
      />

      {/* Edit dialog */}
      <EditScheduledMessageDialog
        open={!!editMessage}
        onOpenChange={(open) => !open && setEditMessage(null)}
        message={editMessage}
      />

      {/* Reschedule / reuse dialog — cria uma nova programação a partir de uma existente */}
      <CreateScheduledMessageDialog
        open={!!rescheduleMessage}
        onOpenChange={(open) => !open && setRescheduleMessage(null)}
        initialValues={rescheduleMessage}
        folderId={rescheduleMessage?.folder_id ?? openFolderId}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
          <AlertDialogTitle>Excluir programação?</AlertDialogTitle>
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
  onTogglePause,
  onDelete,
  onEdit,
  onReschedule,
  onOpenDetail,
  folderOptions,
  currentFolderId,
  onMoveToFolder,
}: {
  message: ScheduledMessage;
  onCancel: (id: string) => void;
  onTogglePause: (message: ScheduledMessage) => void;
  onDelete: (id: string) => void;
  onEdit: (message: ScheduledMessage) => void;
  onReschedule: (message: ScheduledMessage) => void;
  onOpenDetail: (message: ScheduledMessage) => void;
  folderOptions: { id: string; label: string }[];
  currentFolderId: string | null;
  onMoveToFolder: (messageId: string, folderId: string | null) => void;
}) {
  // Um disparo ativo pode estar pausado à mão (paused_at). Nesse caso o badge
  // mostra a pausa, que é a informação que importa — 'pending' apareceria como
  // "Pendente" e daria a entender que ainda vai sair sozinho.
  const isActive = message.status === 'pending' || message.status === 'processing';
  const isPaused = isActive && !!message.paused_at;
  const status = isPaused
    ? {
        // 'processing' + pausa = o motor ainda está terminando a fatia atual.
        label: message.status === 'processing' ? 'Pausando...' : 'Pausado',
        icon: Pause,
        color: 'bg-amber-500/10 text-amber-600',
      }
    : statusConfig[message.status];
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
  const delay = (message as any).delay_between_contacts;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(message)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetail(message);
        }
      }}
      className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
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

          {message.content_type === 'message' && message.message_content && (
            <p className="text-sm text-muted-foreground truncate mb-2 pl-11">
              {message.message_content}
            </p>
          )}

          <div className="flex items-center gap-4 pl-11 flex-wrap">
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
            {delay && delay > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Timer className="h-3 w-3" />
                <span>{delay}s entre contatos</span>
              </div>
            )}
            {message.execution_count > 0 && (
              <span className="text-xs text-muted-foreground">
                {message.execution_count}x executado
              </span>
            )}
          </div>
        </div>

        {/* Ações do card: impedem o clique de borbulhar e abrir o painel. */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Badge variant="secondary" className={cn("text-xs", status.color)}>
            <StatusIcon className={cn("h-3 w-3 mr-1", message.status === 'processing' && !isPaused && 'animate-spin')} />
            {status.label}
          </Badge>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isActive && (
                <DropdownMenuItem onClick={() => onTogglePause(message)}>
                  {isPaused ? (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Retomar
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pausar
                    </>
                  )}
                </DropdownMenuItem>
              )}
              {message.status === 'pending' && (
                <>
                  <DropdownMenuItem onClick={() => onEdit(message)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCancel(message.id)}>
                    <Ban className="h-4 w-4 mr-2" />
                    Cancelar
                  </DropdownMenuItem>
                </>
              )}
              {isActive && <DropdownMenuSeparator />}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInput className="h-4 w-4 mr-2" />
                  Mover para pasta
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                  <DropdownMenuItem
                    disabled={currentFolderId === null}
                    onClick={() => onMoveToFolder(message.id, null)}
                  >
                    <Folder className="h-4 w-4 mr-2" />
                    Raiz (sem pasta)
                  </DropdownMenuItem>
                  {folderOptions.length > 0 && <DropdownMenuSeparator />}
                  {folderOptions.map(option => (
                    <DropdownMenuItem
                      key={option.id}
                      disabled={currentFolderId === option.id}
                      onClick={() => onMoveToFolder(message.id, option.id)}
                    >
                      <Folder className="h-4 w-4 mr-2" />
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onReschedule(message)}>
                <CalendarPlus className="h-4 w-4 mr-2" />
                Reagendar
              </DropdownMenuItem>
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

      {message.status === 'failed' && message.error_message && (
        <div className="mt-3 p-2 rounded bg-red-500/10 text-red-500 text-xs flex items-center gap-2">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          {message.error_message}
        </div>
      )}

      {/* Envio parcial: status "enviado" mas com falhas em parte dos contatos. */}
      {message.status === 'sent' && message.error_message && (
        <div className="mt-3 p-2 rounded bg-amber-500/10 text-amber-600 text-xs flex items-center gap-2">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          {message.error_message}
        </div>
      )}
    </div>
  );
}

type FolderDialogState =
  | { mode: 'create'; parentId: string | null; workspaceIds: string[] }
  | { mode: 'edit'; folder: ScheduledMessageFolder }
  | null;

function FolderFormDialog({
  state,
  onClose,
  onSubmit,
  isAdmin,
  workspaces,
}: {
  state: FolderDialogState;
  onClose: () => void;
  onSubmit: (name: string, workspaceIds: string[]) => void;
  isAdmin: boolean;
  workspaces: { id: string; name: string; color: string }[];
}) {
  const [name, setName] = useState('');
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);

  // Reabrir o diálogo para outra pasta precisa recarregar os campos.
  useEffect(() => {
    if (!state) return;
    if (state.mode === 'edit') {
      setName(state.folder.name);
      setWorkspaceIds(
        state.folder.workspace_ids?.length
          ? state.folder.workspace_ids
          : (state.folder.workspace_id ? [state.folder.workspace_id] : []),
      );
    } else {
      setName('');
      setWorkspaceIds(state.workspaceIds);
    }
  }, [state]);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit(name.trim(), workspaceIds);
  };

  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {state?.mode === 'edit'
              ? 'Editar pasta'
              : state?.parentId
                ? 'Nova subpasta'
                : 'Nova pasta'}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Nome da pasta</Label>
            <Input
              autoFocus
              placeholder="Ex: Black Friday"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          {isAdmin && (
            <div className="grid gap-2">
              <Label>Workspaces</Label>
              <MultiWorkspaceSelector
                workspaces={workspaces as any}
                value={workspaceIds}
                onChange={setWorkspaceIds}
              />
              <p className="text-[11px] text-muted-foreground/80">
                Vazio = a pasta aparece em todos os workspaces. As programações mantêm o workspace
                delas ao serem movidas — mover não muda por qual número o disparo sai.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!name.trim()}>
            {state?.mode === 'edit' ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
