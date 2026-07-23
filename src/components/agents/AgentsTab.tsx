import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAIAgents, useCreateAIAgent, useUpdateAIAgent, AGENT_FUNCTION_ROLES } from '@/hooks/useAIAgents';
import { useAgentInstances } from '@/hooks/useAgentInstances';
import { useAgentFolders, useCreateAgentFolder, useDeleteAgentFolder, useRenameAgentFolder, useMoveAgentToFolder } from '@/hooks/useAgentFolders';
import { AgentListItem } from './AgentListItem';
import { ApplyTemplateWizard } from './ApplyTemplateWizard';
import { ImportFlowDialog } from './ImportFlowDialog';
import { AgentPersonalityFields, EMPTY_PERSONALITY, type AgentPersonalityValue } from './AgentPersonalityFields';
import { Button } from '@/components/ui/button';
import { Plus, FolderPlus, Folder, ChevronDown, ChevronRight, MoreHorizontal, Trash2, Pencil, MapPinned, Bot, Workflow, Import } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { AgentFolder } from '@/hooks/useAgentFolders';
import { enforceEntryCreationLimit } from '@/lib/entryFlow';

export function AgentsTab() {
  const queryClient = useQueryClient();
  const { data: agents = [], isLoading } = useAIAgents();
  const { data: folders = [] } = useAgentFolders();
  const { data: agentInstances = [] } = useAgentInstances();
  const instanceIdByAgentId = new Map(agentInstances.map((i) => [i.ai_agent_id, i.id]));
  const createAgent = useCreateAIAgent();
  const updateAgent = useUpdateAIAgent();
  const createFolder = useCreateAgentFolder();
  const deleteFolder = useDeleteAgentFolder();
  const renameFolder = useRenameAgentFolder();
  const moveToFolder = useMoveAgentToFolder();
  const { selectedWorkspaceId, availableWorkspaces, isAdmin } = useWorkspaceContext();

  const [open, setOpen] = useState(false);
  const [orchestrationWizardOpen, setOrchestrationWizardOpen] = useState(false);
  const [importFlowOpen, setImportFlowOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState(AGENT_FUNCTION_ROLES[0]?.value || 'recepcao');
  const [newPersonality, setNewPersonality] = useState<AgentPersonalityValue>(EMPTY_PERSONALITY);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderWorkspaceId, setFolderWorkspaceId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  // Rename/edit folder dialog
  const [editingFolder, setEditingFolder] = useState<AgentFolder | null>(null);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  // Separar "Agentes" (só prompt/persona, sem fluxo próprio) de "Orquestrações"
  // (têm agent_instances -- fluxo+campanha por trás) -- ver conversa com o
  // usuário. Em abas, não pastas: é uma distinção automática/estrutural (dá
  // pra saber sozinho pelo instanceId), pastas continuam livres pro usuário
  // organizar do jeito que quiser DENTRO de cada aba.
  const [kindFilter, setKindFilter] = useState<'all' | 'agent' | 'orchestration'>('all');

  const handleCreate = () => {
    if (!newName.trim()) return;
    if (!enforceEntryCreationLimit('max_ai_agents', agents.length, 'agentes de IA')) return;
    createAgent.mutate({
      name: newName,
      function_role: newRole,
      behavior_style: newPersonality.behaviorStyle,
      response_length: newPersonality.responseLength,
      tone_style: newPersonality.toneStyle,
      emoji_usage: newPersonality.emojiUsage,
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
        setNewPersonality(EMPTY_PERSONALITY);
        setSelectedFolder(null);
      },
    });
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

  const kindFilteredAgents = agents.filter((a) => {
    if (kindFilter === 'all') return true;
    const isOrchestration = instanceIdByAgentId.has(a.id);
    return kindFilter === 'orchestration' ? isOrchestration : !isOrchestration;
  });
  const agentsInFolder = (folderId: string) => kindFilteredAgents.filter(a => (a as any).folder_id === folderId);
  const agentsWithoutFolder = kindFilteredAgents.filter(a => {
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

          {/* New Agent: escolher entre agente simples (só prompt/persona) ou
              orquestração (fluxo+campanha) -- unifica os dois pontos de entrada
              que antes viviam em abas separadas (ver conversa com o usuário). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="bg-gradient-primary hover:opacity-90 text-white border-0">
                <Plus className="h-4 w-4 mr-1" /> Novo Agente
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setOpen(true)}>
                <Bot className="h-3.5 w-3.5 mr-2" /> Agente simples
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOrchestrationWizardOpen(true)}>
                <Workflow className="h-3.5 w-3.5 mr-2" /> Orquestração
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportFlowOpen(true)}>
                <Import className="h-3.5 w-3.5 mr-2" /> Importar fluxo existente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Agente Simples</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">Nome</label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex.: Maria" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Função</label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGENT_FUNCTION_ROLES.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Personalidade</label>
                  <AgentPersonalityFields value={newPersonality} onChange={(patch) => setNewPersonality((prev) => ({ ...prev, ...patch }))} />
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

      <div className="flex gap-1.5 mb-4">
        {([
          { value: 'all', label: 'Todos' },
          { value: 'agent', label: 'Agentes' },
          { value: 'orchestration', label: 'Orquestrações' },
        ] as const).map((opt) => (
          <button
            key={opt.value}
            onClick={() => setKindFilter(opt.value)}
            className={cn(
              'text-xs px-3 py-1 rounded-md transition-colors',
              kindFilter === opt.value ? 'bg-primary/10 text-primary font-medium' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {opt.label}
          </button>
        ))}
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
                  <AgentListItem key={agent.id} agent={agent} folders={folders} onMoveToFolder={handleMoveAgentToFolder} instanceId={instanceIdByAgentId.get(agent.id)} onEdit={setEditingInstanceId} />
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
            <AgentListItem key={agent.id} agent={agent} folders={folders} onMoveToFolder={handleMoveAgentToFolder} instanceId={instanceIdByAgentId.get(agent.id)} onEdit={setEditingInstanceId} />
          ))}
        </div>
      )}

      <ApplyTemplateWizard
        open={!!editingInstanceId || orchestrationWizardOpen}
        onOpenChange={(isOpen) => { if (!isOpen) { setEditingInstanceId(null); setOrchestrationWizardOpen(false); } }}
        template={null}
        editInstanceId={editingInstanceId}
        onApplied={() => {
          queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
          queryClient.invalidateQueries({ queryKey: ['agent-instances'] });
          queryClient.invalidateQueries({ queryKey: ['campaigns'] });
          setOrchestrationWizardOpen(false);
        }}
      />

      <ImportFlowDialog
        open={importFlowOpen}
        onOpenChange={setImportFlowOpen}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
          queryClient.invalidateQueries({ queryKey: ['agent-instances'] });
        }}
      />
    </div>
  );
}
