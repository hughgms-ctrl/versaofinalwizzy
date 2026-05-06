import { useState } from 'react';
import { Zap, Loader2, ChevronDown, Play, Folder, FolderOpen, ChevronLeft, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useFlows, Flow } from '@/hooks/useFlows';
import { useFlowFolders, FlowFolder } from '@/hooks/useFlowFolders';
import { useFlowExecution } from '@/hooks/useFlowExecution';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { cn } from '@/lib/utils';

interface FlowTriggerDropdownProps {
  conversationId: string;
}

export function FlowTriggerDropdown({ conversationId }: FlowTriggerDropdownProps) {
  const [open, setOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<FlowFolder | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const { data: flows, isLoading: loadingFlows } = useFlows();
  const { data: folders, isLoading: loadingFolders } = useFlowFolders();
  const executeFlow = useFlowExecution();
  const { selectedWorkspaceId } = useWorkspaceContext();

  const isLoading = loadingFlows || loadingFolders;

  // Filter by workspace: show items global (no workspace assigned) or matching the selected workspace (legacy or multi)
  const matchesWorkspace = (item: { workspace_id?: string | null; workspace_ids?: string[] | null }) => {
    if (!selectedWorkspaceId) return true;
    const ids = item.workspace_ids && item.workspace_ids.length > 0
      ? item.workspace_ids
      : (item.workspace_id ? [item.workspace_id] : []);
    if (ids.length === 0) return true; // global
    return ids.includes(selectedWorkspaceId);
  };

  // Filter only active flows matching workspace and visible in chat, sort by position
  const activeFlows = flows?.filter(f => f.is_active && matchesWorkspace(f.workspace_id) && f.visible_in_chat !== false)
    .sort((a, b) => a.position - b.position) || [];

  const filteredFolders = folders?.filter(f => matchesWorkspace(f.workspace_id) && f.visible_in_chat !== false)
    .sort((a, b) => a.position - b.position) || [];

  // Get root folders that have at least one active flow (directly or in subfolders)
  const getFolderHasActiveFlows = (folderId: string): boolean => {
    const directFlows = activeFlows.filter(f => f.folder_id === folderId);
    if (directFlows.length > 0) return true;

    // Check subfolders recursively
    const subfolders = filteredFolders.filter(f => f.parent_id === folderId);
    return subfolders.some(sf => getFolderHasActiveFlows(sf.id));
  };

  const rootFolders = filteredFolders.filter(f => !f.parent_id && getFolderHasActiveFlows(f.id));

  // Get active flows without folder
  const rootFlows = activeFlows.filter(f => !f.folder_id);

  // Get flows in selected folder
  const getFlowsInFolder = (folderId: string): Flow[] => {
    return activeFlows.filter(f => f.folder_id === folderId);
  };

  // Get subfolders with active flows
  const getSubfoldersWithFlows = (parentId: string): FlowFolder[] => {
    return filteredFolders.filter(f => f.parent_id === parentId && getFolderHasActiveFlows(f.id));
  };

  const handleTriggerFlow = (flowId: string) => {
    setOpen(false);
    setSelectedFolder(null);
    setIsTriggering(true);

    // Reset local loading after 1 second
    setTimeout(() => setIsTriggering(false), 1000);

    executeFlow.mutate({ flowId, conversationId });
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setSelectedFolder(null);
    }
  };

  const handleSelectFolder = (folder: FlowFolder) => {
    setSelectedFolder(folder);
  };

  const handleBack = () => {
    if (selectedFolder?.parent_id) {
      const parentFolder = folders?.find(f => f.id === selectedFolder.parent_id);
      setSelectedFolder(parentFolder || null);
    } else {
      setSelectedFolder(null);
    }
  };

  const renderFolderContent = () => {
    if (!selectedFolder) {
      // Show root level: folders + root flows
      return (
        <>
          {rootFolders.length > 0 && (
            <>
              {rootFolders.map((folder) => (
                <DropdownMenuItem
                  key={folder.id}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelectFolder(folder);
                  }}
                  className="gap-2 cursor-pointer"
                >
                  <Folder className="h-4 w-4 text-primary" />
                  <span className="flex-1 font-medium">{folder.name}</span>
                  <ChevronDown className="h-3 w-3 opacity-50 -rotate-90" />
                </DropdownMenuItem>
              ))}
              {rootFlows.length > 0 && <DropdownMenuSeparator />}
            </>
          )}

          {rootFlows.map((flow) => (
            <DropdownMenuItem
              key={flow.id}
              onClick={() => handleTriggerFlow(flow.id)}
              className="gap-2 cursor-pointer"
            >
              <Play className="h-4 w-4 text-green-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{flow.name}</p>
                {flow.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {flow.description}
                  </p>
                )}
              </div>
            </DropdownMenuItem>
          ))}
        </>
      );
    }

    // Show selected folder content
    const folderFlows = getFlowsInFolder(selectedFolder.id);
    const subfolders = getSubfoldersWithFlows(selectedFolder.id);

    return (
      <>
        {/* Back button */}
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            handleBack();
          }}
          className="gap-2 cursor-pointer text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>Voltar</span>
        </DropdownMenuItem>

        {/* Current folder header */}
        <div className="px-2 py-1.5 flex items-center gap-2 border-b border-border mb-1">
          <FolderOpen className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">{selectedFolder.name}</span>
        </div>

        {/* Subfolders */}
        {subfolders.map((folder) => (
          <DropdownMenuItem
            key={folder.id}
            onClick={(e) => {
              e.preventDefault();
              handleSelectFolder(folder);
            }}
            className="gap-2 cursor-pointer"
          >
            <Folder className="h-4 w-4 text-primary" />
            <span className="flex-1 font-medium">{folder.name}</span>
            <ChevronDown className="h-3 w-3 opacity-50 -rotate-90" />
          </DropdownMenuItem>
        ))}

        {subfolders.length > 0 && folderFlows.length > 0 && <DropdownMenuSeparator />}

        {/* Flows in folder */}
        {folderFlows.map((flow) => (
          <DropdownMenuItem
            key={flow.id}
            onClick={() => handleTriggerFlow(flow.id)}
            className="gap-2 cursor-pointer"
          >
            <Play className="h-4 w-4 text-green-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{flow.name}</p>
              {flow.description && (
                <p className="text-xs text-muted-foreground truncate">
                  {flow.description}
                </p>
              )}
            </div>
          </DropdownMenuItem>
        ))}

        {folderFlows.length === 0 && subfolders.length === 0 && (
          <div className="p-3 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum fluxo ativo nesta pasta
            </p>
          </div>
        )}
      </>
    );
  };

  const hasAnyActiveFlow = activeFlows.length > 0;

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={isTriggering}
        >
          {isTriggering ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          Iniciar Fluxo
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 bg-popover z-50">
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !hasAnyActiveFlow ? (
          <div className="p-4 text-center">
            <Workflow className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Nenhum fluxo ativo disponível
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Crie e ative fluxos na página de Fluxos
            </p>
          </div>
        ) : (
          renderFolderContent()
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
