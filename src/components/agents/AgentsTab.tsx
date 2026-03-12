import { useState } from 'react';
import { useAIAgents, useCreateAIAgent, useUpdateAIAgent } from '@/hooks/useAIAgents';
import { useAgentFunctionRoles, useCreateAgentFunctionRole, useDeleteAgentFunctionRole } from '@/hooks/useAgentFunctionRoles';
import { useAgentFolders, useCreateAgentFolder, useDeleteAgentFolder, useRenameAgentFolder, useMoveAgentToFolder } from '@/hooks/useAgentFolders';
import { AgentListItem } from './AgentListItem';
import { Button } from '@/components/ui/button';
import { Plus, Settings2, X, FolderPlus, Folder, ChevronDown, ChevronRight, MoreHorizontal, Trash2, Pencil, MapPinned } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { AgentFolder } from '@/hooks/useAgentFolders';

export function AgentsTab() {
  const { data: agents = [], isLoading } = useAIAgents();
  const { data: roles = [] } = useAgentFunctionRoles();
  const { data: folders = [] } = useAgentFolders();
  const createAgent = useCreateAIAgent();
  const updateAgent = useUpdateAIAgent();
  const createRole = useCreateAgentFunctionRole();
  const deleteRole = useDeleteAgentFunctionRole();
  const createFolder = useCreateAgentFolder();
  const deleteFolder = useDeleteAgentFolder();
  const renameFolder = useRenameAgentFolder();
  const moveToFolder = useMoveAgentToFolder();
  const { selectedWorkspaceId, availableWorkspaces, isAdmin } = useWorkspaceContext();

  const [open, setOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('recepcao');
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderWorkspaceId, setFolderWorkspaceId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  // Rename/edit folder dialog
  const [editingFolder, setEditingFolder] = useState<AgentFolder | null>(null);
  const [showRenameDialog, setShowRenameDialog] = useState(false);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createAgent.mutate({
      name: newName,
      function_role: newRole,
    }, {
      onSuccess: (data) => {
        if (selectedFolder && data) {
          const folder = folders.find(f => f.id === selectedFolder);
          moveToFolder.mutate({
            agentId: (data as any).id,
            folderId: selectedFolder,
            folderWorkspaceId: folder?.workspace_id,
          });
        }
        setOpen(false);
        setNewName('');
        setNewRole('recepcao');
        setSelectedFolder(null);
      },
    });
  };

  const handleAddRole = () => {
    if (!newRoleLabel.trim()) return;
    const value = newRoleLabel.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    createRole.mutate({ label: newRoleLabel.trim(), value }, { onSuccess: () => setNewRoleLabel('') });
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    createFolder.mutate({ name: newFolderName.trim(), workspaceId: folderWorkspaceId }, {
      onSuccess: () => {
        setNewFolderName('');
        setFolderWorkspaceId(null);
        setFolderDialogOpen(false);
      },
    });
  };

  const handleRenameFolder = () => {
    if (!editingFolder || !newFolderName.trim()) return;
    renameFolder.mutate({
      id: editingFolder.id,
      name: newFolderName.trim(),
      workspaceId: folderWorkspaceId,
    }, {
      onSuccess: () => {
        setShowRenameDialog(false);
        setEditingFolder(null);
        setNewFolderName('');
        setFolderWorkspaceId(null);
      },
    });
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleMoveAgentToFolder = (agentId: string, folderId: string | null) => {
    const folder = folderId ? folders.find(f => f.id === folderId) : null;
    moveToFolder.mutate({
      agentId,
      folderId,
      folderWorkspaceId: folder?.workspace_id ?? null,
    });
  };

  // Filter by workspace
  const filteredFolders = folders.filter(f => {
    if (!selectedWorkspaceId) return true;
    return !f.workspace_id || f.workspace_id === selectedWorkspaceId;
  });

  const agentsInFolder = (folderId: string) => agents.filter(a => (a as any).folder_id === folderId);
  const agentsWithoutFolder = agents.filter(a => {
    const folderId = (a as any).folder_id;
    if (folderId) return false;
    if (!selectedWorkspaceId) return true;
    return !a.workspace_id || a.workspace_id === selectedWorkspaceId;
  });

  const getWorkspaceName = (wsId: string | null) => {
    if (!wsId) return null;
    return availableWorkspaces?.find((w: any) => w.id === wsId)?.name;
  };

  if (isLoading) {
    return <div className="text-muted-foreground text-sm">Carregando agentes...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-muted-foreground">
          {agents.length} agente{agents.length !== 1 ? 's' : ''} configurado{agents.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          {/* Folders button */}
          <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <FolderPlus className="h-4 w-4" /> Nova Pasta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Criar Pasta</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">Nome</label>
                  <Input
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    placeholder="Nome da pasta"
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); }}
                  />
                </div>
                {availableWorkspaces && availableWorkspaces.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-1 block">Workspace (visibilidade)</label>
                    <Select value={folderWorkspaceId || 'all'} onValueChange={v => setFolderWorkspaceId(v === 'all' ? null : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos os workspaces" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os workspaces</SelectItem>
                        {availableWorkspaces.map((ws: any) => (
                          <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">Agentes nesta pasta serão vinculados ao workspace selecionado.</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button size="sm" disabled={!newFolderName.trim() || createFolder.isPending} onClick={handleCreateFolder}>
                  Criar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Departments button */}
          <Dialog open={rolesOpen} onOpenChange={setRolesOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Settings2 className="h-4 w-4" /> Departamentos
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Departamentos</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <div className="flex gap-2">
                  <Input
                    value={newRoleLabel}
                    onChange={e => setNewRoleLabel(e.target.value)}
                    placeholder="Novo departamento (ex.: Recepção)"
                    onKeyDown={e => { if (e.key === 'Enter') handleAddRole(); }}
                  />
                  <Button size="sm" disabled={!newRoleLabel.trim() || createRole.isPending} onClick={handleAddRole}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {roles.map(r => (
                    <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50">
                      <span className="text-sm">{r.label}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => deleteRole.mutate(r.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* New Agent button with gradient */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-gradient-primary hover:opacity-90 text-white border-0">
                <Plus className="h-4 w-4 mr-1" /> Novo Agente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Agente</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">Nome</label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex.: Maria" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Departamento</label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {folders.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-1 block">Pasta (opcional)</label>
                    <Select value={selectedFolder || 'none'} onValueChange={v => setSelectedFolder(v === 'none' ? null : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sem pasta" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem pasta</SelectItem>
                        {folders.map(f => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                            {f.workspace_id && getWorkspaceName(f.workspace_id) ? ` (${getWorkspaceName(f.workspace_id)})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button onClick={handleCreate} disabled={!newName.trim() || createAgent.isPending} className="w-full bg-gradient-primary hover:opacity-90 text-white border-0">
                  Criar Agente
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Rename folder dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Pasta</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome</label>
              <Input
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder="Nome da pasta"
                onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(); }}
              />
            </div>
            {availableWorkspaces && availableWorkspaces.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-1 block">Workspace (visibilidade)</label>
                <Select value={folderWorkspaceId || 'all'} onValueChange={v => setFolderWorkspaceId(v === 'all' ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os workspaces" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os workspaces</SelectItem>
                    {availableWorkspaces.map((ws: any) => (
                      <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Agentes nesta pasta herdarão este workspace.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button size="sm" disabled={!newFolderName.trim() || renameFolder.isPending} onClick={handleRenameFolder}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Folders - collapsed by default */}
      {filteredFolders.map(folder => {
        const folderAgents = agentsInFolder(folder.id);
        const isExpanded = expandedFolders.has(folder.id);
        const wsName = getWorkspaceName(folder.workspace_id);

        return (
          <div key={folder.id} className="mb-4">
            <div className="flex items-center gap-2 mb-2 group/folder">
              <button
                onClick={() => toggleFolder(folder.id)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Folder className="h-4 w-4 text-primary" />
                <span>{folder.name}</span>
                <span className="text-xs text-muted-foreground/60">({folderAgents.length})</span>
              </button>
              {wsName && (
                <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
                  <MapPinned className="h-2.5 w-2.5" />
                  {wsName}
                </Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover/folder:opacity-100 transition-opacity">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={() => {
                      setEditingFolder(folder);
                      setNewFolderName(folder.name);
                      setFolderWorkspaceId(folder.workspace_id);
                      setShowRenameDialog(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Editar pasta
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => deleteFolder.mutate(folder.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir pasta
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {isExpanded && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 pl-6">
                {folderAgents.map(agent => (
                  <AgentListItem key={agent.id} agent={agent} folders={folders} onMoveToFolder={handleMoveAgentToFolder} />
                ))}
                {folderAgents.length === 0 && (
                  <p className="text-xs text-muted-foreground col-span-full py-2">Nenhum agente nesta pasta</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Agents without folder */}
      {agentsWithoutFolder.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {agentsWithoutFolder.map(agent => (
            <AgentListItem key={agent.id} agent={agent} folders={folders} onMoveToFolder={handleMoveAgentToFolder} />
          ))}
        </div>
      )}
    </div>
  );
}
