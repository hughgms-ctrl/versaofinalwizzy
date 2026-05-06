import React, { useState } from 'react';
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
  Pencil,
  MessageSquare,
  MessageSquareOff,
  MapPinned,
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
import { useFlows, useToggleFlowActive, useDeleteFlow, useToggleFlowVisibleInChat, useDuplicateFlow } from '@/hooks/useFlows';
import {
  useFlowFolders,
  useCreateFlowFolder,
  useDeleteFlowFolder,
  useRenameFlowFolder,
  useMoveFlowToFolder,
  useToggleFolderVisibleInChat,
  useDuplicateFlowFolder,
  FlowFolder
} from '@/hooks/useFlowFolders';
import { useSaveFlow } from '@/hooks/useFlows';
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { useUpdateFlowPositions } from '@/hooks/useFlows';
import { useUpdateFolderPositions } from '@/hooks/useFlowFolders';
import { GripVertical } from 'lucide-react';

interface Flow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  triggers_count: number;
  nodes: unknown[];
  updated_at: string;
  folder_id?: string | null;
  position: number;
  visible_in_chat: boolean;
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
  const [folderWorkspaceIds, setFolderWorkspaceIds] = useState<string[]>([]);

  const { data: flows, isLoading: flowsLoading } = useFlows();
  const { data: folders, isLoading: foldersLoading } = useFlowFolders();
  const toggleActive = useToggleFlowActive();
  const deleteFlow = useDeleteFlow();
  const createFolder = useCreateFlowFolder();
  const deleteFolder = useDeleteFlowFolder();
  const renameFolder = useRenameFlowFolder();
  const moveFlow = useMoveFlowToFolder();
  const updateFlowPositions = useUpdateFlowPositions();
  const updateFolderPositions = useUpdateFolderPositions();
  const toggleFlowVisibility = useToggleFlowVisibleInChat();
  const toggleFolderVisibility = useToggleFolderVisibleInChat();
  const saveFlow = useSaveFlow();
  const duplicateFlow = useDuplicateFlow();
  const duplicateFolder = useDuplicateFlowFolder();
  const { selectedWorkspaceId, availableWorkspaces, isAdmin } = useWorkspaceContext();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
        workspaceIds: folderWorkspaceIds,
      });
      setNewFolderName('');
      setFolderWorkspaceId(null);
      setFolderWorkspaceIds([]);
      setShowFolderDialog(false);
    }
  };

  const handleRenameFolder = () => {
    if (editingFolder && newFolderName.trim()) {
      renameFolder.mutate({
        folderId: editingFolder.id,
        name: newFolderName.trim(),
        workspaceIds: folderWorkspaceIds,
      });
      setNewFolderName('');
      setFolderWorkspaceId(null);
      setFolderWorkspaceIds([]);
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
    moveFlow.mutate({
      flowId,
      folderId,
      folderWorkspaceId: folder?.workspace_id || null,
      folderWorkspaceIds: folder?.workspace_ids || null,
    });
  };

  const handleUpdateFlowWorkspaces = (flowId: string, workspaceIds: string[]) => {
    const flow = (flows as any[])?.find(f => f.id === flowId);
    if (flow) {
      saveFlow.mutate({
        id: flowId,
        nodes: flow.nodes || [],
        edges: flow.edges || [],
        workspace_ids: workspaceIds,
        workspace_id: workspaceIds[0] || null,
      });
    }
  };

  // Filter flows and folders by selected workspace (multi-workspace aware)
  const matchesWorkspace = (wsIds?: string[] | null, legacyId?: string | null) => {
    if (!selectedWorkspaceId) return true;
    if (wsIds && wsIds.length > 0) return wsIds.includes(selectedWorkspaceId);
    if (!legacyId) return false; // explicit empty = no workspace assigned -> hide when filtering
    return legacyId === selectedWorkspaceId;
  };

  const filteredFlows = (flows as Flow[] | undefined)?.filter(f => matchesWorkspace((f as any).workspace_ids, (f as any).workspace_id) && (f as any).trigger_type !== 'chat_follow_up') || [];
  const filteredFolders = folders?.filter(f => matchesWorkspace((f as any).workspace_ids, f.workspace_id)) || [];

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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      // Find which list this item belongs to
      let items: any[] = [];

      // Check root
      const rootItems = [...rootFolders, ...rootFlows];
      if (rootItems.some(i => i.id === active.id)) {
        items = rootItems;
      } else {
        // Check folders
        for (const folder of filteredFolders) {
          const folderItems = [...getSubfolders(folder.id), ...getFlowsInFolder(folder.id)];
          if (folderItems.some(i => i.id === active.id)) {
            items = folderItems;
            break;
          }
        }
      }

      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(items, oldIndex, newIndex);

        // Prepare updates
        const flowUpdates: { id: string; position: number }[] = [];
        const folderUpdates: { id: string; position: number }[] = [];

        newOrder.forEach((item, index) => {
          if ('is_active' in item) {
            flowUpdates.push({ id: item.id, position: index });
          } else {
            folderUpdates.push({ id: item.id, position: index });
          }
        });

        if (flowUpdates.length > 0) {
          await updateFlowPositions.mutateAsync(flowUpdates);
        }
        if (folderUpdates.length > 0) {
          await updateFolderPositions.mutateAsync(folderUpdates);
        }
      }
    }
  };

  const SortableRow = ({ id, children }: { id: string; children: React.ReactNode }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 50 : undefined,
      position: 'relative' as const,
    };

    return (
      <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-50 ring-1 ring-[#ff2d85]/30")}>
        {React.Children.map(children, child => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<any>, { dragHandleProps: { ...attributes, ...listeners } });
          }
          return child;
        })}
      </div>
    );
  };

  const FlowRow = ({ flow, nested = false, dragHandleProps }: { flow: Flow, nested?: boolean, dragHandleProps?: any }) => (
    <div className={cn(
      "flex items-center gap-4 px-4 py-4 hover:bg-muted/10 transition-colors border-b border-border/50 last:border-b-0",
      nested && "bg-muted/40"
    )}>
      {/* Drag Handle */}
      <div {...dragHandleProps} className="cursor-grab hover:text-primary transition-colors p-1 -ml-2 text-muted-foreground/30">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Icon */}
      <div className={cn(
        "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
        flow.is_active
          ? "bg-primary"
          : "bg-muted"
      )}>
        <Workflow className={cn(
          "h-5 w-5",
          flow.is_active ? "text-white" : "text-muted-foreground"
        )} />
      </div>

      {/* Name & Description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h3 className="font-medium text-foreground text-sm">{flow.name}</h3>
          {!flow.visible_in_chat && (
            <MessageSquareOff className="h-3.5 w-3.5 text-muted-foreground/50" />
          )}
        </div>
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

      {/* Workspace Tags (for flows) */}
      {(() => {
        const ids: string[] = (flow as any).workspace_ids?.length
          ? (flow as any).workspace_ids
          : ((flow as any).workspace_id ? [(flow as any).workspace_id] : []);
        if (ids.length === 0) return null;
        return (
          <div className="hidden md:flex items-center gap-1 shrink-0 max-w-[180px] overflow-hidden">
            {ids.slice(0, 2).map(id => {
              const ws = availableWorkspaces.find(w => w.id === id);
              if (!ws) return null;
              return (
                <div
                  key={ws.id}
                  className="px-2 py-0.5 rounded-[4px] border shrink-0"
                  style={{ backgroundColor: `${ws.color}15`, borderColor: `${ws.color}30` }}
                >
                  <span className="text-[10px] font-medium" style={{ color: ws.color }}>
                    {ws.name}
                  </span>
                </div>
              );
            })}
            {ids.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{ids.length - 2}</span>
            )}
          </div>
        );
      })()}

      {/* Status Toggle */}
      <div className="flex items-center gap-3 w-40 justify-center">
        <Switch
          checked={flow.is_active}
          onCheckedChange={(checked) => handleToggleActive(flow.id, checked)}
          className="data-[state=checked]:bg-primary"
        />
        <Badge
          className={cn(
            "text-[10px] font-medium px-3 py-1 rounded-full min-w-[70px] justify-center border-none",
            flow.is_active
              ? "bg-primary/10 text-primary"
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
          <DropdownMenuContent align="end" className="w-52 bg-card border-border">
            <DropdownMenuItem onClick={() => handleEditFlow(flow.id)}>
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => toggleFlowVisibility.mutate({ flowId: flow.id, visibleInChat: !flow.visible_in_chat })}
            >
              {flow.visible_in_chat ? (
                <><MessageSquareOff className="h-4 w-4 mr-2" />Ocultar do Chat</>
              ) : (
                <><MessageSquare className="h-4 w-4 mr-2" />Mostrar no Chat</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => duplicateFlow.mutate({ flowId: flow.id })}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </DropdownMenuItem>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="h-4 w-4 mr-2" />
                Mover para pasta
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-card border-border">
                <DropdownMenuItem onClick={() => handleMoveToFolder(flow.id, null)}>
                  <Folder className="h-4 w-4 mr-2" />
                  Raiz (sem pasta)
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-muted" />
                {folders?.filter(folder => {
                  // Show folders whose workspaces overlap with the flow's workspaces (or both global)
                  const flowIds: string[] = (flow as any).workspace_ids?.length ? (flow as any).workspace_ids : ((flow as any).workspace_id ? [(flow as any).workspace_id] : []);
                  const folderIds: string[] = (folder as any).workspace_ids?.length ? (folder as any).workspace_ids : (folder.workspace_id ? [folder.workspace_id] : []);
                  if (folderIds.length === 0 || flowIds.length === 0) return true;
                  return folderIds.some(id => flowIds.includes(id));
                }).map(folder => (
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

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <MapPinned className="h-4 w-4 mr-2" />
                Workspaces
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-card border-border w-56">
                <DropdownMenuItem onClick={(e) => { e.preventDefault(); handleUpdateFlowWorkspaces(flow.id, []); }}>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground shrink-0" />
                    Todos os workspaces
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-muted" />
                {availableWorkspaces.map(ws => {
                  const currentIds: string[] = (flow as any).workspace_ids?.length ? (flow as any).workspace_ids : ((flow as any).workspace_id ? [(flow as any).workspace_id] : []);
                  const isSel = currentIds.includes(ws.id);
                  return (
                    <DropdownMenuItem
                      key={ws.id}
                      onClick={(e) => {
                        e.preventDefault();
                        const next = isSel
                          ? currentIds.filter(id => id !== ws.id)
                          : [...currentIds, ws.id];
                        handleUpdateFlowWorkspaces(flow.id, next);
                      }}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <div className="w-3 flex justify-center">
                          {isSel && <span className="text-primary text-xs">✓</span>}
                        </div>
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: ws.color }} />
                        <span className="flex-1 truncate">{ws.name}</span>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator className="bg-muted" />
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

  const FolderSection = ({ folder, depth = 0, dragHandleProps }: { folder: FlowFolder; depth?: number; dragHandleProps?: any }) => {
    const isExpanded = expandedFolders.has(folder.id);
    const folderFlows = getFlowsInFolder(folder.id);
    const subfolders = getSubfolders(folder.id);
    const itemCount = folderFlows.length + subfolders.length;

    // Combined items for sorting within a folder
    const innerItems = [...subfolders, ...folderFlows].sort((a, b) => (a.position - b.position));

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
          {/* Drag Handle */}
          <div
            {...dragHandleProps}
            className="cursor-grab hover:text-primary transition-colors p-1 -ml-2 text-muted-foreground/30"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </div>

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
            {!folder.visible_in_chat && (
              <MessageSquareOff className="h-3.5 w-3.5 text-muted-foreground/50 ml-1" />
            )}
          </div>

          <div className="flex items-center gap-4 shrink-0 pr-2">
            {folder.workspace_id && (() => {
              const ws = availableWorkspaces.find(w => w.id === folder.workspace_id);
              if (!ws) return null;
              return (
                <div
                  className="px-2 py-0.5 rounded-[4px] border"
                  style={{
                    backgroundColor: `${ws.color}15`,
                    borderColor: `${ws.color}30`
                  }}
                >
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: ws.color }}
                  >
                    {ws.name}
                  </span>
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
              <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  setEditingFolder(folder);
                  setNewFolderName(folder.name);
                  setFolderWorkspaceId(folder.workspace_id || null);
                  setShowRenameDialog(true);
                }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
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
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  toggleFolderVisibility.mutate({ folderId: folder.id, visibleInChat: !folder.visible_in_chat });
                }}>
                  {folder.visible_in_chat ? (
                    <><MessageSquareOff className="h-4 w-4 mr-2" />Ocultar do Chat</>
                  ) : (
                    <><MessageSquare className="h-4 w-4 mr-2" />Mostrar no Chat</>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-muted" />
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  duplicateFolder.mutate({ folderId: folder.id, newParentId: folder.parent_id });
                }}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicar pasta
                </DropdownMenuItem>

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
          <div className="bg-card">
            <SortableContext items={innerItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {innerItems.map(item => (
                <SortableRow key={item.id} id={item.id}>
                  {'is_active' in item ? (
                    <FlowRow flow={item as Flow} nested={true} />
                  ) : (
                    <FolderSection folder={item as FlowFolder} depth={depth + 1} />
                  )}
                </SortableRow>
              ))}
            </SortableContext>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <MainLayout title="Fluxos" subtitle="Gerencie suas automações de atendimento">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
        <DialogContent className="bg-card border-border max-w-md p-6 rounded-2xl">
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
                className="bg-muted border-border focus:ring-0 focus:border-border h-11 rounded-lg"
              />
            </div>
            {isAdmin && (
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Workspace</Label>
                <Select
                  value={folderWorkspaceId || 'all'}
                  onValueChange={(val) => setFolderWorkspaceId(val === 'all' ? null : val)}
                >
                  <SelectTrigger className="bg-muted border-border h-11 rounded-lg">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
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
              className="bg-gradient-to-r from-primary to-[hsl(20_90%_60%)] hover:opacity-90 font-bold px-8 rounded-lg"
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename/Edit Folder Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="bg-card border-border max-w-md p-6 rounded-2xl">
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
                className="bg-muted border-border focus:ring-0 focus:border-border h-11 rounded-lg"
              />
            </div>
            {isAdmin && (
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Workspace</Label>
                <Select
                  value={folderWorkspaceId || 'all'}
                  onValueChange={(val) => setFolderWorkspaceId(val === 'all' ? null : val)}
                >
                  <SelectTrigger className="bg-muted border-border h-11 rounded-lg">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
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
              className="bg-gradient-to-r from-primary to-[hsl(20_90%_60%)] hover:opacity-90 font-bold px-8 rounded-lg"
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
            className="bg-gradient-to-r from-primary to-[hsl(20_90%_60%)] font-bold px-8 h-12 rounded-xl"
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
              className="bg-card border-border hover:bg-muted font-bold text-xs px-4"
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

          <div className="bg-card rounded-xl border border-border overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-4 px-4 py-3 bg-muted border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]">
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

            <div className="bg-card">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis]}
              >
                <SortableContext
                  items={[...rootFolders, ...rootFlows].map(i => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {[...rootFolders, ...rootFlows].sort((a, b) => (a as any).position - (b as any).position).map(item => (
                    <SortableRow key={item.id} id={item.id}>
                      {'is_active' in item ? (
                        <FlowRow flow={item as Flow} />
                      ) : (
                        <FolderSection folder={item as FlowFolder} />
                      )}
                    </SortableRow>
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default FlowsPage;
