import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Search,
  MoreVertical,
  Folder,
  FolderPlus,
  FolderInput,
  Trash2,
  Edit,
  Copy,
  Code,
  Eye,
  MousePointerClick,
  ChevronRight,
  ChevronDown,
  FileCode,
  Pencil,
  Building2,
} from 'lucide-react';
import { 
  useWidgets, 
  useWidgetFolders, 
  useCreateWidget, 
  useDeleteWidget,
  useUpdateWidget,
  useCreateWidgetFolder,
  useDeleteWidgetFolder,
  Widget,
  WidgetFolder,
} from '@/hooks/useWidgets';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { enforceEntryCreationLimit } from '@/lib/entryFlow';

export default function WidgetsPage() {
  const navigate = useNavigate();
  const { data: widgets = [], isLoading } = useWidgets();
  const { data: folders = [] } = useWidgetFolders();
  const createWidget = useCreateWidget();
  const deleteWidget = useDeleteWidget();
  const updateWidget = useUpdateWidget();
  const createFolder = useCreateWidgetFolder();
  const deleteFolder = useDeleteWidgetFolder();
  const { selectedWorkspaceId, availableWorkspaces, isAdmin } = useWorkspaceContext();

  const [search, setSearch] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showNewWidgetDialog, setShowNewWidgetDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newWidgetName, setNewWidgetName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [folderWorkspaceId, setFolderWorkspaceId] = useState<string | null>(null);
  const [widgetWorkspaceId, setWidgetWorkspaceId] = useState<string | null>(null);
  const [widgetToDelete, setWidgetToDelete] = useState<Widget | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<WidgetFolder | null>(null);
  const [widgetToMove, setWidgetToMove] = useState<Widget | null>(null);
  const [moveFolderId, setMoveFolderId] = useState<string>('root');
  const [widgetToChangeWs, setWidgetToChangeWs] = useState<Widget | null>(null);
  const [changeWsId, setChangeWsId] = useState<string>('all');

  // Workspace filtering
  const matchesWorkspace = (wsId: string | null | undefined) => {
    if (!selectedWorkspaceId) return true; // "Todos" shows all
    return !wsId || wsId === selectedWorkspaceId;
  };

  const filteredFolders = folders.filter(f => matchesWorkspace(f.workspace_id));

  // Filter widgets by workspace + search
  const filteredWidgets = widgets.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase());
    const matchesWs = matchesWorkspace(w.workspace_id);
    return matchesSearch && matchesWs;
  });

  // Group by folder
  const rootWidgets = filteredWidgets.filter(w => !w.folder_id);
  const widgetsByFolder = filteredFolders.reduce((acc, folder) => {
    acc[folder.id] = filteredWidgets.filter(w => w.folder_id === folder.id);
    return acc;
  }, {} as Record<string, Widget[]>);

  const toggleFolder = (folderId: string) => {
    const next = new Set(expandedFolders);
    if (next.has(folderId)) {
      next.delete(folderId);
    } else {
      next.add(folderId);
    }
    setExpandedFolders(next);
  };

  const handleCreateWidget = async () => {
    if (!newWidgetName.trim()) return;
    if (!enforceEntryCreationLimit('max_forms', widgets.length, 'forms')) return;
    
    const wsId = isAdmin ? (widgetWorkspaceId === 'all' ? null : widgetWorkspaceId) : selectedWorkspaceId;
    
    const widget = await createWidget.mutateAsync({
      name: newWidgetName.trim(),
      folder_id: selectedFolderId,
      workspace_id: wsId,
    });
    
    setNewWidgetName('');
    setWidgetWorkspaceId(null);
    setShowNewWidgetDialog(false);
    
    if (widget?.id) {
      navigate(`/widgets/${widget.id}`);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const wsId = isAdmin ? (folderWorkspaceId === 'all' ? null : folderWorkspaceId) : selectedWorkspaceId;
    await createFolder.mutateAsync({ name: newFolderName.trim(), workspaceId: wsId });
    setNewFolderName('');
    setFolderWorkspaceId(null);
    setShowNewFolderDialog(false);
  };

  const handleDeleteWidget = async () => {
    if (!widgetToDelete) return;
    await deleteWidget.mutateAsync(widgetToDelete.id);
    setWidgetToDelete(null);
  };

  const handleDeleteFolder = async () => {
    if (!folderToDelete) return;
    await deleteFolder.mutateAsync(folderToDelete.id);
    setFolderToDelete(null);
  };

  const handleMoveToFolder = async () => {
    if (!widgetToMove) return;
    const targetFolderId = moveFolderId === 'root' ? null : moveFolderId;
    const targetFolder = folders.find(f => f.id === targetFolderId);
    const inheritedWsId = targetFolder?.workspace_id || null;
    await updateWidget.mutateAsync({ 
      id: widgetToMove.id, 
      data: { folder_id: targetFolderId, workspace_id: inheritedWsId } 
    });
    setWidgetToMove(null);
  };

  const handleChangeWorkspace = async () => {
    if (!widgetToChangeWs) return;
    const wsId = changeWsId === 'all' ? null : changeWsId;
    await updateWidget.mutateAsync({ id: widgetToChangeWs.id, data: { workspace_id: wsId } });
    setWidgetToChangeWs(null);
  };

  // Reset workspace selectors when opening dialogs
  const openNewWidgetDialog = () => {
    setWidgetWorkspaceId(isAdmin ? 'all' : selectedWorkspaceId);
    setShowNewWidgetDialog(true);
  };

  const openNewFolderDialog = () => {
    setFolderWorkspaceId(isAdmin ? 'all' : selectedWorkspaceId);
    setShowNewFolderDialog(true);
  };

  const renderWidgetCard = (widget: Widget) => (
    <Card 
      key={widget.id} 
      className="group hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => navigate(`/widgets/${widget.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: widget.button_color }}
            >
              <MousePointerClick className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium truncate">{widget.name}</p>
                <Badge variant={widget.is_active ? 'default' : 'secondary'} className="flex-shrink-0">
                  {widget.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Criado em {format(new Date(widget.created_at), "d 'de' MMM, yyyy", { locale: ptBR })}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-popover">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/widgets/${widget.id}`); }}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/widgets/${widget.id}?tab=preview`); }}>
                <Eye className="h-4 w-4 mr-2" />
                Visualizar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/widgets/${widget.id}?tab=code`); }}>
                <Code className="h-4 w-4 mr-2" />
                Código HTML
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { 
                e.stopPropagation(); 
                setMoveFolderId(widget.folder_id || 'root');
                setWidgetToMove(widget); 
              }}>
                <FolderInput className="h-4 w-4 mr-2" />
                Mover para pasta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { 
                e.stopPropagation(); 
                setChangeWsId(widget.workspace_id || 'all');
                setWidgetToChangeWs(widget); 
              }}>
                <Building2 className="h-4 w-4 mr-2" />
                Alterar Workspace
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={(e) => { e.stopPropagation(); setWidgetToDelete(widget); }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Wizzy Forms</h1>
            <p className="text-muted-foreground text-sm">
              Crie formulários embeddables para captar leads em sites externos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openNewFolderDialog}>
              <FolderPlus className="h-4 w-4 mr-2" />
              Nova Pasta
            </Button>
            <Button onClick={openNewWidgetDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Form
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar forms..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filteredWidgets.length === 0 && filteredFolders.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <FileCode className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-1">Nenhum form criado</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Crie seu primeiro form de captação para começar a coletar leads.
              </p>
              <Button onClick={openNewWidgetDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Form
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Folders */}
            {filteredFolders.map(folder => (
              <div key={folder.id} className="space-y-2">
                <div 
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer group"
                  onClick={() => toggleFolder(folder.id)}
                >
                  {expandedFolders.has(folder.id) ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Folder className="h-4 w-4 text-primary" />
                  <span className="font-medium">{folder.name}</span>
                  
                  {folder.workspace_id && (() => {
                    const ws = availableWorkspaces.find(w => w.id === folder.workspace_id);
                    if (!ws) return null;
                    return (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: `${ws.color}20`, color: ws.color }}
                      >
                        {ws.name}
                      </span>
                    );
                  })()}
                  
                  <Badge variant="secondary" className="ml-1">
                    {widgetsByFolder[folder.id]?.length || 0}
                  </Badge>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 ml-auto opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); setFolderToDelete(folder); }}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
                {expandedFolders.has(folder.id) && (
                  <div className="ml-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {widgetsByFolder[folder.id]?.map(renderWidgetCard)}
                  </div>
                )}
              </div>
            ))}

            {/* Root widgets */}
            {rootWidgets.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {rootWidgets.map(renderWidgetCard)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Widget Dialog */}
      <Dialog open={showNewWidgetDialog} onOpenChange={setShowNewWidgetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Form</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome do form</Label>
              <Input 
                placeholder="Ex: Formulário Landing Page"
                value={newWidgetName}
                onChange={(e) => setNewWidgetName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateWidget()}
              />
            </div>
            {isAdmin ? (
              <div className="grid gap-2">
                <Label>Workspace</Label>
                <Select
                  value={widgetWorkspaceId || 'all'}
                  onValueChange={(val) => setWidgetWorkspaceId(val === 'all' ? null : val)}
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
              </div>
            ) : selectedWorkspaceId ? (
              <div className="grid gap-2">
                <Label>Workspace</Label>
                <Input
                  value={availableWorkspaces.find(w => w.id === selectedWorkspaceId)?.name || ''}
                  disabled
                  className="opacity-70"
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewWidgetDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateWidget} disabled={!newWidgetName.trim() || createWidget.isPending}>
              Criar Form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Pasta</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome da pasta</Label>
              <Input 
                placeholder="Ex: Landing Pages"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
            </div>
            {isAdmin ? (
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
                <p className="text-xs text-muted-foreground">Forms movidos para esta pasta herdarão o workspace selecionado.</p>
              </div>
            ) : selectedWorkspaceId ? (
              <div className="grid gap-2">
                <Label>Workspace</Label>
                <Input
                  value={availableWorkspaces.find(w => w.id === selectedWorkspaceId)?.name || ''}
                  disabled
                  className="opacity-70"
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNewFolderDialog(false); setNewFolderName(''); setFolderWorkspaceId(null); }}>
              Cancelar
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || createFolder.isPending}>
              Criar Pasta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Widget Confirmation */}
      <AlertDialog open={!!widgetToDelete} onOpenChange={() => setWidgetToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir form?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O form "{widgetToDelete?.name}" será permanentemente removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteWidget} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Folder Confirmation */}
      <AlertDialog open={!!folderToDelete} onOpenChange={() => setFolderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pasta?</AlertDialogTitle>
            <AlertDialogDescription>
              Os forms dentro desta pasta serão movidos para a raiz. A pasta "{folderToDelete?.name}" será removida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFolder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move to Folder Dialog */}
      <Dialog open={!!widgetToMove} onOpenChange={() => setWidgetToMove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mover para pasta</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Pasta de destino</Label>
              <Select value={moveFolderId} onValueChange={setMoveFolderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">Raiz (sem pasta)</SelectItem>
                  {folders.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      <div className="flex items-center gap-2">
                        <Folder className="h-3.5 w-3.5" />
                        {f.name}
                        {f.workspace_id && (() => {
                          const ws = availableWorkspaces.find(w => w.id === f.workspace_id);
                          return ws ? <span className="text-xs text-muted-foreground">({ws.name})</span> : null;
                        })()}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O form herdará o workspace da pasta selecionada.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWidgetToMove(null)}>Cancelar</Button>
            <Button onClick={handleMoveToFolder} disabled={updateWidget.isPending}>Mover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Workspace Dialog */}
      <Dialog open={!!widgetToChangeWs} onOpenChange={() => setWidgetToChangeWs(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Workspace</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Workspace</Label>
              <Select value={changeWsId} onValueChange={setChangeWsId}>
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
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWidgetToChangeWs(null)}>Cancelar</Button>
            <Button onClick={handleChangeWorkspace} disabled={updateWidget.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
