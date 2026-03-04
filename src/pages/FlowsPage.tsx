import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Workflow,
  Play,
  Pause,
  Edit,
  Copy,
  Trash2,
  MoreVertical,
  Clock,
  Zap,
  GitBranch,
  Loader2,
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  FolderInput,
  Pencil
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import { useFlows, useToggleFlowActive, useDeleteFlow } from '@/hooks/useFlows';
import {
  useFlowFolders,
  useCreateFlowFolder,
  useDeleteFlowFolder,
  useRenameFlowFolder,
  useMoveFlowToFolder,
  FlowFolder
} from '@/hooks/useFlowFolders';
import { CreateFlowDialog } from '@/components/flows/CreateFlowDialog';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Flow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  triggers_count: number;
  nodes: unknown[];
  updated_at: string;
  folder_id?: string | null;
}

const FlowsPage = () => {
  const navigate = useNavigate();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<FlowFolder | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderWorkspaceId, setFolderWorkspaceId] = useState<string | null>(null);

  const { data: flows, isLoading: flowsLoading } = useFlows();
  const { data: folders, isLoading: foldersLoading } = useFlowFolders();
  const toggleActive = useToggleFlowActive();
  const deleteFlow = useDeleteFlow();
  const createFolder = useCreateFlowFolder();
  const deleteFolder = useDeleteFlowFolder();
  const renameFolder = useRenameFlowFolder();
  const moveFlow = useMoveFlowToFolder();
  const { selectedWorkspaceId, availableWorkspaces, isAdmin } = useWorkspaceContext();

  const isLoading = flowsLoading || foldersLoading;

  const handleToggleActive = (flowId: string, isActive: boolean) => {
    toggleActive.mutate({ flowId, isActive });
  };

  const handleEditFlow = (flowId: string) => {
    navigate(`/flow-builder?id=${flowId}`);
  };

  const handleDeleteFlow = (flowId: string) => {
    if (confirm('Tem certeza que deseja excluir este fluxo?')) {
      deleteFlow.mutate(flowId);
    }
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder.mutate({
        name: newFolderName.trim(),
        parentId: currentFolderId,
        workspaceId: folderWorkspaceId,
      });
      setNewFolderName('');
      setFolderWorkspaceId(null);
      setShowFolderDialog(false);
    }
  };

  const handleRenameFolder = () => {
    if (editingFolder && newFolderName.trim()) {
      renameFolder.mutate({
        folderId: editingFolder.id,
        name: newFolderName.trim(),
        workspaceId: folderWorkspaceId,
      });
      setNewFolderName('');
      setFolderWorkspaceId(null);
      setEditingFolder(null);
      setShowRenameDialog(false);
    }
  };

  const handleDeleteFolder = (folderId: string) => {
    if (confirm('Tem certeza que deseja excluir esta pasta? Os fluxos dentro dela ficarão sem pasta.')) {
      deleteFolder.mutate(folderId);
    }
  };

  const toggleFolderExpand = (folderId: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const handleMoveToFolder = (flowId: string, folderId: string | null) => {
    const folder = folders?.find(f => f.id === folderId);
    moveFlow.mutate({ flowId, folderId, folderWorkspaceId: folder?.workspace_id || null });
  };

  // Filter flows and folders by selected workspace
  const matchesWorkspace = (wsId: string | null | undefined) => {
    if (!selectedWorkspaceId) return true; // "Todos" - show all
    return wsId === selectedWorkspaceId; // Strict: only show if matches selected
  };

  const filteredFlows = (flows as Flow[] | undefined)?.filter(f => matchesWorkspace((f as any).workspace_id)) || [];
  const filteredFolders = folders?.filter(f => matchesWorkspace(f.workspace_id)) || [];

  // Get flows without folder (root level)
  const rootFlows = filteredFlows.filter(f => !f.folder_id);

  // Get flows for a specific folder
  const getFlowsInFolder = (folderId: string) =>
    filteredFlows.filter(f => f.folder_id === folderId);

  // Get root folders (no parent)
  const rootFolders = filteredFolders.filter(f => !f.parent_id);

  // Get subfolders
  const getSubfolders = (parentId: string) =>
    filteredFolders.filter(f => f.parent_id === parentId);


  const FlowRow = ({ flow, nested = false }: { flow: Flow, nested?: boolean }) => (
    <div className={cn(
      "flex items-center gap-4 px-4 py-4 hover:bg-muted/10 transition-colors border-b border-border/50 last:border-b-0",
      nested && "bg-[#111114]"
    )}>
      {/* Icon */}
      <div className={cn(
        "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
        flow.is_active
          ? "bg-[#ff2d85]"
          : "bg-[#2a2a2e]"
      )}>
        <Workflow className={cn(
          "h-5 w-5",
          flow.is_active ? "text-white" : "text-muted-foreground"
        )} />
      </div>

      {/* Name & Description */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-foreground text-sm">{flow.name}</h3>
        <p className="text-[11px] text-muted-foreground">
          {flow.description || 'Sem descrição'}
        </p>
      </div>

      {/* Stats */}
      <div className="hidden md:flex items-center gap-10 text-muted-foreground">
        <div className="flex items-center gap-1.5 w-10">
          <Zap className="h-4 w-4" />
          <span className="text-sm">{flow.triggers_count}</span>
        </div>
        <div className="flex items-center gap-1.5 w-10">
          <GitBranch className="h-4 w-4" />
          <span className="text-sm">{(flow.nodes as unknown[])?.length || 0}</span>
        </div>
        <div className="flex items-center gap-2 w-36 text-[11px]">
          <Clock className="h-4 w-4" />
          <span>há {formatDistanceToNow(new Date(flow.updated_at), { locale: ptBR })}</span>
        </div>
      </div>

      {/* Status Toggle */}
      <div className="flex items-center gap-3 w-40 justify-center">
        <Switch
          checked={flow.is_active}
          onCheckedChange={(checked) => handleToggleActive(flow.id, checked)}
          className="data-[state=checked]:bg-[#ff2d85]"
        />
        <Badge
          className={cn(
            "text-[10px] font-medium px-3 py-1 rounded-full min-w-[70px] justify-center border-none",
            flow.is_active
              ? "bg-[#ff2d85]/10 text-[#ff2d85]"
              : "bg-muted text-muted-foreground"
          )}
        >
          {flow.is_active ? (
            <>
              <Play className="h-2.5 w-2.5 mr-1 fill-current" />
              Ativo
            </>
          ) : (
            <>
              Pausado
            </>
          )}
        </Badge>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0 pr-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-foreground hover:bg-muted/20 font-bold text-sm h-9 px-3"
          onClick={() => handleEditFlow(flow.id)}
        >
          <Edit className="h-4 w-4 mr-1.5" />
          Editar
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 bg-[#0f0f12] border-[#2a2a2e]">
            <DropdownMenuItem onClick={() => handleEditFlow(flow.id)}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </DropdownMenuItem>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="h-4 w-4 mr-2" />
                Mover para pasta
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-[#0f0f12] border-[#2a2a2e]">
                <DropdownMenuItem onClick={() => handleMoveToFolder(flow.id, null)}>
                  <Folder className="h-4 w-4 mr-2" />
                  Raiz (sem pasta)
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#2a2a2e]" />
                {folders?.map(folder => (
                  <DropdownMenuItem
                    key={folder.id}
                    onClick={() => handleMoveToFolder(flow.id, folder.id)}
                  >
                    <Folder className="h-4 w-4 mr-2" />
                    {folder.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator className="bg-[#2a2a2e]" />
            <DropdownMenuItem
              className="text-red-500 hover:text-red-400"
              onClick={() => handleDeleteFlow(flow.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  const FolderSection = ({ folder, depth = 0 }: { folder: FlowFolder; depth?: number }) => {
    const isExpanded = expandedFolders.has(folder.id);
    const folderFlows = getFlowsInFolder(folder.id);
    const subfolders = getSubfolders(folder.id);
    const itemCount = folderFlows.length + subfolders.length;

    return (
      <div className="border-b border-border/50 last:border-b-0">
        {/* Folder Header */}
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-4 hover:bg-muted/10 transition-colors cursor-pointer group",
            depth > 0 && "pl-12"
          )}
          onClick={() => toggleFolderExpand(folder.id)}
        >
          <div className="flex items-center gap-1 flex-1">
            {isExpanded ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground mr-2" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground mr-2" />
            )}

            <Folder className={cn(
              "h-5 w-5 mr-3 transition-colors",
              isExpanded ? "text-muted-foreground" : "text-muted-foreground"
            )} />

            <span className="font-semibold text-foreground text-sm">{folder.name}</span>
          </div>

          <div className="flex items-center gap-4 shrink-0 pr-2">
            {folder.workspace_id && (() => {
              const ws = availableWorkspaces.find(w => w.id === folder.workspace_id);
              if (!ws) return null;
              return (
                <div
                  className="px-2 py-0.5 rounded-[4px] bg-[#2e1f18] border border-[#4a2e21]"
                >
                  <span className="text-[10px] font-medium text-[#b36b39]">{ws.name}</span>
                </div>
              );
            })()}

            <span className="text-[11px] text-muted-foreground min-w-[50px] text-right">
              {itemCount} {itemCount === 1 ? 'item' : 'itens'}
            </span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-[#0f0f12] border-[#2a2a2e]">
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  setEditingFolder(folder);
                  setNewFolderName(folder.name);
                  setFolderWorkspaceId(folder.workspace_id || null);
                  setShowRenameDialog(true);
                }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Renomear
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  setCurrentFolderId(folder.id);
                  setFolderWorkspaceId(folder.workspace_id || null);
                  setShowFolderDialog(true);
                }}>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Nova subpasta
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#2a2a2e]" />
                <DropdownMenuItem
                  className="text-red-500 hover:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFolder(folder.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir pasta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Folder Contents */}
        {isExpanded && (
          <div className="bg-[#0a0a0c]">
            {/* Subfolders */}
            {subfolders.map(subfolder => (
              <FolderSection key={subfolder.id} folder={subfolder} depth={depth + 1} />
            ))}

            {/* Flows in folder */}
            {folderFlows.map(flow => (
              <FlowRow key={flow.id} flow={flow} nested={true} />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <MainLayout title="Fluxos" subtitle="Gerencie suas automações de atendimento">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-[#ff2d85]" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title="Fluxos"
      subtitle="Gerencie suas automações de atendimento"
      showSearch={true}
      showNewButton={true}
      newButtonLabel="Novo Fluxo"
      onNewClick={() => setShowCreateDialog(true)}
    >
      <CreateFlowDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      {/* Create Folder Dialog */}
      <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <DialogContent className="bg-[#0f0f12] border-white/10 max-w-md p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Nova Pasta</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Nome da pasta</Label>
              <Input
                placeholder="Ex: Auxílio Reclusão"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                className="bg-[#1a1a1e] border-[#2a2a2e] focus:ring-0 focus:border-white/20 h-11 rounded-lg"
              />
            </div>
            {isAdmin && (
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Workspace</Label>
                <Select
                  value={folderWorkspaceId || 'all'}
                  onValueChange={(val) => setFolderWorkspaceId(val === 'all' ? null : val)}
                >
                  <SelectTrigger className="bg-[#1a1a1e] border-[#2a2a2e] h-11 rounded-lg">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f0f12] border-[#2a2a2e]">
                    <SelectItem value="all">Todos os Workspaces</SelectItem>
                    {availableWorkspaces.map(ws => (
                      <SelectItem key={ws.id} value={ws.id}>
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: ws.color }} />
                          {ws.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground/80 mt-1">Fluxos movidos para esta pasta herdarão o workspace selecionado.</p>
              </div>
            )}
          </div>
          <DialogFooter className="flex items-center justify-end gap-3 mt-2">
            <Button variant="ghost" onClick={() => {
              setShowFolderDialog(false);
              setNewFolderName('');
              setCurrentFolderId(null);
              setFolderWorkspaceId(null);
            }} className="text-foreground hover:bg-muted/20 px-6 font-bold">
              Cancelar
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              className="bg-gradient-to-r from-[#ff2d85] to-[#ff7b54] hover:opacity-90 font-bold px-8 rounded-lg"
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename/Edit Folder Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="bg-[#0f0f12] border-white/10 max-w-md p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Editar Pasta</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Nome da pasta</Label>
              <Input
                placeholder="Nome da pasta"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRenameFolder()}
                className="bg-[#1a1a1e] border-[#2a2a2e] focus:ring-0 focus:border-white/20 h-11 rounded-lg"
              />
            </div>
            {isAdmin && (
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Workspace</Label>
                <Select
                  value={folderWorkspaceId || 'all'}
                  onValueChange={(val) => setFolderWorkspaceId(val === 'all' ? null : val)}
                >
                  <SelectTrigger className="bg-[#1a1a1e] border-[#2a2a2e] h-11 rounded-lg">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f0f12] border-[#2a2a2e]">
                    <SelectItem value="all">Todos os Workspaces</SelectItem>
                    {availableWorkspaces.map(ws => (
                      <SelectItem key={ws.id} value={ws.id}>
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: ws.color }} />
                          {ws.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground/80 mt-1">Fluxos movidos para esta pasta herdarão o workspace selecionado.</p>
              </div>
            )}
          </div>
          <DialogFooter className="flex items-center justify-end gap-3 mt-2">
            <Button variant="ghost" onClick={() => {
              setShowRenameDialog(false);
              setNewFolderName('');
              setFolderWorkspaceId(null);
              setEditingFolder(null);
            }} className="text-foreground hover:bg-muted/20 px-6 font-bold">
              Cancelar
            </Button>
            <Button
              onClick={handleRenameFolder}
              disabled={!newFolderName.trim()}
              className="bg-gradient-to-r from-[#ff2d85] to-[#ff7b54] hover:opacity-90 font-bold px-8 rounded-lg"
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(!flows || flows.length === 0) && (!folders || folders.length === 0) ? (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Workflow className="h-16 w-16 text-muted-foreground/30 mb-6" />
          <h3 className="text-xl font-bold mb-2">Nenhum fluxo encontrado</h3>
          <p className="text-muted-foreground mb-8 text-sm">Crie pastas ou fluxos para começar.</p>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-gradient-to-r from-[#ff2d85] to-[#ff7b54] font-bold px-8 h-12 rounded-xl"
          >
            Começar Agora
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              className="bg-[#0a0a0c] border-[#2a2a2e] hover:bg-[#1a1a1e] font-bold h-10 px-4 rounded-lg flex items-center gap-2"
              onClick={() => {
                setCurrentFolderId(null);
                setFolderWorkspaceId(selectedWorkspaceId);
                setShowFolderDialog(true);
              }}
            >
              <FolderPlus className="h-4 w-4" />
              Nova Pasta
            </Button>
          </div>

          <div className="bg-[#0f0f12] rounded-xl border border-[#2a2a2e] overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-4 px-4 py-3 bg-[#1a1a1e] border-b border-[#2a2a2e] text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]">
              <div className="w-9" /> {/* Icon space */}
              <div className="flex-1">Nome</div>
              <div className="hidden md:flex items-center gap-12 text-center">
                <div className="w-12">Disparos</div>
                <div className="w-12">Blocos</div>
                <div className="w-32 text-right">Atualizado</div>
              </div>
              <div className="w-32 text-center">Status</div>
              <div className="w-28 text-right pr-2">Ações</div>
            </div>

            <div className="bg-[#0a0a0c]">
              {/* Folders */}
              {rootFolders.map(folder => (
                <FolderSection key={folder.id} folder={folder} />
              ))}

              {/* Root level flows (without folder) */}
              {rootFlows.map(flow => (
                <FlowRow key={flow.id} flow={flow} />
              ))}
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default FlowsPage;
