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
    return !wsId || wsId === selectedWorkspaceId; // null = all workspaces, or matches
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

  const FlowRow = ({ flow }: { flow: Flow }) => (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0">
      {/* Icon */}
      <div className={cn(
        "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
        flow.is_active 
          ? "bg-gradient-to-br from-primary to-purple-500" 
          : "bg-muted"
      )}>
        <Workflow className={cn(
          "h-4 w-4",
          flow.is_active ? "text-white" : "text-muted-foreground"
        )} />
      </div>
      
      {/* Name & Description */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-foreground truncate">{flow.name}</h3>
        <p className="text-xs text-muted-foreground truncate">
          {flow.description || 'Sem descrição'}
        </p>
      </div>
      
      {/* Stats */}
      <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5 w-20">
          <Zap className="h-3.5 w-3.5" />
          <span>{flow.triggers_count}</span>
        </div>
        <div className="flex items-center gap-1.5 w-16">
          <GitBranch className="h-3.5 w-3.5" />
          <span>{(flow.nodes as unknown[])?.length || 0}</span>
        </div>
        <div className="flex items-center gap-1.5 w-28 text-xs">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatDistanceToNow(new Date(flow.updated_at), { addSuffix: true, locale: ptBR })}</span>
        </div>
      </div>
      
      {/* Status Toggle */}
      <div className="flex items-center gap-2">
        <Switch 
          checked={flow.is_active}
          onCheckedChange={(checked) => handleToggleActive(flow.id, checked)}
        />
        <Badge variant={flow.is_active ? "default" : "secondary"} className="text-[10px] w-16 justify-center">
          {flow.is_active ? (
            <>
              <Play className="h-2.5 w-2.5 mr-1" />
              Ativo
            </>
          ) : (
            <>
              <Pause className="h-2.5 w-2.5 mr-1" />
              Pausado
            </>
          )}
        </Badge>
      </div>
      
      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => handleEditFlow(flow.id)}
        >
          <Edit className="h-4 w-4 mr-1.5" />
          Editar
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEditFlow(flow.id)}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </DropdownMenuItem>
            
            {/* Move to folder submenu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="h-4 w-4 mr-2" />
                Mover para pasta
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => handleMoveToFolder(flow.id, null)}>
                  <Folder className="h-4 w-4 mr-2" />
                  Raiz (sem pasta)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
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
            
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-destructive"
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
      <div>
        {/* Folder Header */}
        <div 
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer border-b border-border",
            depth > 0 && "pl-8"
          )}
          onClick={() => toggleFolderExpand(folder.id)}
        >
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
          
          {isExpanded ? (
            <FolderOpen className="h-5 w-5 text-primary shrink-0" />
          ) : (
            <Folder className="h-5 w-5 text-muted-foreground shrink-0" />
          )}
          
          <span className="font-medium text-foreground flex-1">{folder.name}</span>
          
          {folder.workspace_id && (() => {
            const ws = availableWorkspaces.find(w => w.id === folder.workspace_id);
            if (!ws) return null;
            return (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded mr-1"
                style={{ backgroundColor: `${ws.color}20`, color: ws.color }}
              >
                {ws.name}
              </span>
            );
          })()}
          
          <span className="text-xs text-muted-foreground mr-2">
            {itemCount} {itemCount === 1 ? 'item' : 'itens'}
          </span>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
                setShowFolderDialog(true);
              }}>
                <FolderPlus className="h-4 w-4 mr-2" />
                Nova subpasta
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-destructive"
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
        
        {/* Folder Contents */}
        {isExpanded && (
          <div className={cn("bg-muted/20", depth > 0 && "ml-4")}>
            {/* Subfolders */}
            {subfolders.map(subfolder => (
              <FolderSection key={subfolder.id} folder={subfolder} depth={depth + 1} />
            ))}
            
            {/* Flows in folder */}
            {folderFlows.map(flow => (
              <div key={flow.id} className="pl-8">
                <FlowRow flow={flow} />
              </div>
            ))}
            
            {itemCount === 0 && (
              <div className="pl-12 py-3 text-sm text-muted-foreground">
                Pasta vazia
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <MainLayout title="Fluxos" subtitle="Gerencie suas automações de atendimento">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Pasta</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Nome da pasta</Label>
              <Input
                placeholder="Nome da pasta"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
            </div>
            {isAdmin && (
              <div className="grid gap-2">
                <Label>Workspace</Label>
                <Select
                  value={folderWorkspaceId || 'all'}
                  onValueChange={(val) => setFolderWorkspaceId(val === 'all' ? null : val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
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
                <p className="text-xs text-muted-foreground">Fluxos movidos para esta pasta herdarão o workspace selecionado.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowFolderDialog(false);
              setNewFolderName('');
              setCurrentFolderId(null);
              setFolderWorkspaceId(null);
            }}>
              Cancelar
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Rename Folder Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Pasta</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Nome da pasta</Label>
              <Input
                placeholder="Nome da pasta"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRenameFolder()}
              />
            </div>
            {isAdmin && (
              <div className="grid gap-2">
                <Label>Workspace</Label>
                <Select
                  value={folderWorkspaceId || 'all'}
                  onValueChange={(val) => setFolderWorkspaceId(val === 'all' ? null : val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
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
                <p className="text-xs text-muted-foreground">Fluxos movidos para esta pasta herdarão o workspace selecionado.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowRenameDialog(false);
              setNewFolderName('');
              setFolderWorkspaceId(null);
              setEditingFolder(null);
            }}>
              Cancelar
            </Button>
            <Button onClick={handleRenameFolder} disabled={!newFolderName.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(!flows || flows.length === 0) && (!folders || folders.length === 0) ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Workflow className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Nenhum fluxo criado</h3>
          <p className="text-muted-foreground mb-4">Crie seu primeiro fluxo de automação</p>
          <Button onClick={() => navigate('/flow-builder')}>
            <Play className="h-4 w-4 mr-2" />
            Criar Fluxo
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setCurrentFolderId(null);
                setShowFolderDialog(true);
              }}
            >
              <FolderPlus className="h-4 w-4 mr-2" />
              Nova Pasta
            </Button>
          </div>
          
          {/* List Container */}
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <div className="w-9" /> {/* Icon space */}
              <div className="flex-1">Nome</div>
              <div className="hidden md:flex items-center gap-6">
                <div className="w-20">Disparos</div>
                <div className="w-16">Blocos</div>
                <div className="w-28">Atualizado</div>
              </div>
              <div className="w-24">Status</div>
              <div className="w-28">Ações</div>
            </div>
            
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
      )}
    </MainLayout>
  );
};

export default FlowsPage;
