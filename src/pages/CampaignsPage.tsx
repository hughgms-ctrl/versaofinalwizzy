import React, { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Loader2,
    Megaphone,
    Edit,
    Trash2,
    MoreVertical,
    Folder,
    FolderPlus,
    FolderInput,
    ChevronRight,
    Pencil,
    Copy,
    GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { CampaignDialog } from "@/components/campaigns/CampaignDialog";
import {
    useCampaigns,
    useUpdateCampaign,
    useDeleteCampaign,
    useUpdateCampaignPositions,
    Campaign,
} from "@/hooks/useCampaigns";
import {
    useCampaignFolders,
    useCreateCampaignFolder,
    useRenameCampaignFolder,
    useDeleteCampaignFolder,
    useMoveCampaignToFolder,
    useUpdateCampaignFolderPositions,
    CampaignFolder,
} from "@/hooks/useCampaignFolders";
import { MultiWorkspaceSelector } from "@/components/shared/MultiWorkspaceSelector";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

const triggerLabel = (campaign: Campaign) => {
    if (["exact", "contains", "starts_with"].includes(campaign.match_type)) {
        return {
            value: campaign.trigger_keyword,
            sub:
                campaign.match_type === "exact"
                    ? "Mensagem Exata"
                    : campaign.match_type === "contains"
                        ? "Contém Palavra"
                        : "Começa com",
            isKeyword: true,
        };
    }
    return {
        value:
            campaign.match_type === "new_conversation"
                ? "Nova Conversa"
                : campaign.match_type === "webhook"
                    ? "Webhook"
                    : campaign.match_type === "tag_added"
                        ? "Tag Adicionada"
                        : campaign.match_type === "manual"
                            ? "Manual"
                            : "Desconhecido",
        sub: "Gatilho de Sistema",
        isKeyword: false,
    };
};

const CampaignsPage = () => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

    const [showFolderDialog, setShowFolderDialog] = useState(false);
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [editingFolder, setEditingFolder] = useState<CampaignFolder | null>(null);
    const [openFolderId, setOpenFolderId] = useState<string | null>(null);
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [folderWorkspaceIds, setFolderWorkspaceIds] = useState<string[]>([]);

    const { data: campaigns, isLoading: campaignsLoading } = useCampaigns();
    const { data: folders, isLoading: foldersLoading } = useCampaignFolders();
    const updateCampaign = useUpdateCampaign();
    const deleteCampaign = useDeleteCampaign();
    const updateCampaignPositions = useUpdateCampaignPositions();
    const createFolder = useCreateCampaignFolder();
    const renameFolder = useRenameCampaignFolder();
    const deleteFolder = useDeleteCampaignFolder();
    const moveCampaign = useMoveCampaignToFolder();
    const updateFolderPositions = useUpdateCampaignFolderPositions();
    const { selectedWorkspaceId, availableWorkspaces, isAdmin } = useWorkspaceContext();

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const isLoading = campaignsLoading || foldersLoading;

    const handleEdit = (campaign: Campaign) => {
        setEditingCampaign(campaign);
        setIsDialogOpen(true);
    };

    const handleCreate = () => {
        setEditingCampaign(null);
        setIsDialogOpen(true);
    };

    const handleToggleActive = (id: string, isActive: boolean) => {
        updateCampaign.mutate({ id, is_active: isActive });
    };

    const handleDelete = (id: string) => {
        if (confirm("Tem certeza que deseja excluir esta campanha?")) {
            deleteCampaign.mutate(id);
        }
    };

    const handleCreateFolder = () => {
        if (newFolderName.trim()) {
            createFolder.mutate({
                name: newFolderName.trim(),
                parentId: currentFolderId,
                workspaceIds: folderWorkspaceIds,
            });
            setNewFolderName("");
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
            setNewFolderName("");
            setFolderWorkspaceIds([]);
            setEditingFolder(null);
            setShowRenameDialog(false);
        }
    };

    const handleDeleteFolder = (folderId: string) => {
        if (confirm("Tem certeza que deseja excluir esta pasta? As campanhas dentro dela ficarão sem pasta.")) {
            deleteFolder.mutate(folderId);
        }
    };

    const handleMoveToFolder = (campaignId: string, folderId: string | null) => {
        const folder = folders?.find(f => f.id === folderId);
        moveCampaign.mutate({
            campaignId,
            folderId,
            folderWorkspaceId: folder?.workspace_id || null,
            folderWorkspaceIds: folder?.workspace_ids || null,
        });
    };

    // Filter folders by selected workspace (campaigns are already workspace-filtered server-side)
    const matchesWorkspace = (wsIds?: string[] | null, legacyId?: string | null) => {
        if (!selectedWorkspaceId) return true;
        if (selectedWorkspaceId === "unassigned") {
            const hasWs = (wsIds && wsIds.length > 0) || !!legacyId;
            return !hasWs;
        }
        if (wsIds && wsIds.length > 0) return wsIds.includes(selectedWorkspaceId);
        if (!legacyId) return false;
        return legacyId === selectedWorkspaceId;
    };

    const filteredCampaigns = campaigns || [];
    const filteredFolders = folders?.filter(f => matchesWorkspace(f.workspace_ids, f.workspace_id)) || [];

    const rootCampaigns = filteredCampaigns.filter(c => !c.folder_id);
    const getCampaignsInFolder = (folderId: string) => filteredCampaigns.filter(c => c.folder_id === folderId);
    const rootFolders = filteredFolders.filter(f => !f.parent_id);
    const getSubfolders = (parentId: string) => filteredFolders.filter(f => f.parent_id === parentId);

    // --- Folder navigation (drill-in) ---
    const openFolder = openFolderId ? folders?.find(f => f.id === openFolderId) ?? null : null;

    useEffect(() => {
        if (openFolderId && folders && !folders.some(f => f.id === openFolderId)) {
            setOpenFolderId(null);
        }
    }, [openFolderId, folders]);

    // Breadcrumb chain: root → ... → open folder
    const breadcrumb: CampaignFolder[] = [];
    {
        const seen = new Set<string>();
        let cursor: CampaignFolder | null = openFolder;
        while (cursor && !seen.has(cursor.id)) {
            seen.add(cursor.id);
            breadcrumb.unshift(cursor);
            cursor = folders?.find(f => f.id === cursor!.parent_id) ?? null;
        }
    }

    const currentFolders = openFolderId ? getSubfolders(openFolderId) : rootFolders;
    const currentCampaigns = openFolderId ? getCampaignsInFolder(openFolderId) : rootCampaigns;
    const currentItems = [...currentFolders, ...currentCampaigns].sort(
        (a, b) => ((a as any).position || 0) - ((b as any).position || 0)
    );

    const openFolderWorkspaceIds: string[] = openFolder
        ? (openFolder.workspace_ids?.length
            ? openFolder.workspace_ids
            : (openFolder.workspace_id ? [openFolder.workspace_id] : []))
        : [];

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        let items: any[] = [];
        const rootItems = [...rootFolders, ...rootCampaigns];
        if (rootItems.some(i => i.id === active.id)) {
            items = rootItems;
        } else {
            for (const folder of filteredFolders) {
                const folderItems = [...getSubfolders(folder.id), ...getCampaignsInFolder(folder.id)];
                if (folderItems.some(i => i.id === active.id)) {
                    items = folderItems;
                    break;
                }
            }
        }

        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const newOrder = arrayMove(items, oldIndex, newIndex);
        const campaignUpdates: { id: string; position: number }[] = [];
        const folderUpdates: { id: string; position: number }[] = [];

        newOrder.forEach((item, index) => {
            // Campaigns have `is_active`; folders do not.
            if ("is_active" in item) {
                campaignUpdates.push({ id: item.id, position: index });
            } else {
                folderUpdates.push({ id: item.id, position: index });
            }
        });

        if (campaignUpdates.length > 0) await updateCampaignPositions.mutateAsync(campaignUpdates);
        if (folderUpdates.length > 0) await updateFolderPositions.mutateAsync(folderUpdates);
    };

    const SortableRow = ({ id, children }: { id: string; children: React.ReactNode }) => {
        const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
        const style = {
            transform: CSS.Transform.toString(transform),
            transition,
            zIndex: isDragging ? 50 : undefined,
            position: "relative" as const,
        };
        return (
            <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-50 ring-1 ring-primary/30")}>
                {React.Children.map(children, child => {
                    if (React.isValidElement(child)) {
                        return React.cloneElement(child as React.ReactElement<any>, { dragHandleProps: { ...attributes, ...listeners } });
                    }
                    return child;
                })}
            </div>
        );
    };

    const CampaignRow = ({ campaign, dragHandleProps }: { campaign: Campaign; dragHandleProps?: any }) => {
        const trig = triggerLabel(campaign);
        return (
            <div className="flex items-center gap-4 px-4 py-4 hover:bg-muted/10 transition-colors border-b border-border/50 last:border-b-0">
                {/* Drag Handle */}
                <div {...dragHandleProps} className="cursor-grab hover:text-primary transition-colors p-1 -ml-2 text-muted-foreground/30">
                    <GripVertical className="h-4 w-4" />
                </div>

                {/* Icon */}
                <div className={cn(
                    "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                    campaign.is_active ? "bg-primary" : "bg-muted"
                )}>
                    <Megaphone className={cn("h-5 w-5", campaign.is_active ? "text-white" : "text-muted-foreground")} />
                </div>

                {/* Name + trigger */}
                <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground text-sm truncate">{campaign.name}</h3>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className={cn("font-semibold", trig.isKeyword ? "text-primary" : "text-foreground")}>{trig.value}</span>
                        <span className="uppercase tracking-wider text-[10px] text-muted-foreground/70">· {trig.sub}</span>
                    </div>
                </div>

                {/* Flow */}
                <div className="hidden md:flex items-center w-40 shrink-0">
                    {campaign.flow ? (
                        <Badge variant="outline" className="text-xs truncate max-w-full">{campaign.flow.name}</Badge>
                    ) : (
                        <span className="text-muted-foreground text-xs">Fluxo não encontrado</span>
                    )}
                </div>

                {/* Counts */}
                <div className="hidden md:flex items-center gap-8 text-muted-foreground shrink-0">
                    <div className="w-12 text-center text-sm font-medium text-foreground">{campaign.trigger_count || 0}</div>
                    <div className="w-12 text-center text-sm font-medium text-amber-500">{campaign.pending_count || 0}</div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2 w-28 justify-center shrink-0">
                    <Switch
                        checked={campaign.is_active}
                        onCheckedChange={(checked) => handleToggleActive(campaign.id, checked)}
                        className="data-[state=checked]:bg-primary"
                    />
                    <span className="text-xs text-muted-foreground w-12 text-left">
                        {campaign.is_active ? "Ativo" : "Inativo"}
                    </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 pr-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(campaign)}>
                        <Edit className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground">
                                <MoreVertical className="h-5 w-5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 bg-card border-border">
                            <DropdownMenuItem onClick={() => handleEdit(campaign)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                            </DropdownMenuItem>

                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <FolderInput className="h-4 w-4 mr-2" />
                                    Mover para pasta
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="bg-card border-border">
                                    <DropdownMenuItem onClick={() => handleMoveToFolder(campaign.id, null)}>
                                        <Folder className="h-4 w-4 mr-2" />
                                        Raiz (sem pasta)
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-muted" />
                                    {folders?.map(folder => (
                                        <DropdownMenuItem
                                            key={folder.id}
                                            onClick={() => handleMoveToFolder(campaign.id, folder.id)}
                                        >
                                            <Folder className="h-4 w-4 mr-2" />
                                            {folder.name}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>

                            <DropdownMenuSeparator className="bg-muted" />
                            <DropdownMenuItem
                                className="text-red-500 hover:text-red-400"
                                onClick={() => handleDelete(campaign.id)}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        );
    };

    const FolderRow = ({ folder, dragHandleProps }: { folder: CampaignFolder; dragHandleProps?: any }) => {
        const folderCampaigns = getCampaignsInFolder(folder.id);
        const subfolders = getSubfolders(folder.id);
        const itemCount = folderCampaigns.length + subfolders.length;

        return (
            <div className="border-b border-border/50 last:border-b-0">
                <div
                    className="flex items-center gap-3 px-4 py-4 hover:bg-muted/10 transition-colors cursor-pointer group"
                    onClick={() => setOpenFolderId(folder.id)}
                >
                    <div
                        {...dragHandleProps}
                        className="cursor-grab hover:text-primary transition-colors p-1 -ml-2 text-muted-foreground/30"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <GripVertical className="h-4 w-4" />
                    </div>

                    <div className="flex items-center gap-1 flex-1">
                        <Folder className="h-5 w-5 mr-3 text-muted-foreground" />
                        <span className="font-semibold text-foreground text-sm">{folder.name}</span>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 pr-2">
                        {(() => {
                            const ids = folder.workspace_ids?.length ? folder.workspace_ids : (folder.workspace_id ? [folder.workspace_id] : []);
                            if (ids.length === 0) return null;
                            return (
                                <div className="hidden md:flex items-center gap-1 max-w-[180px] overflow-hidden">
                                    {ids.slice(0, 2).map(id => {
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
                                    {ids.length > 2 && <span className="text-[10px] text-muted-foreground">+{ids.length - 2}</span>}
                                </div>
                            );
                        })()}

                        <span className="text-[11px] text-muted-foreground min-w-[50px] text-right">
                            {itemCount} {itemCount === 1 ? "item" : "itens"}
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
                                    setFolderWorkspaceIds(folder.workspace_ids?.length ? folder.workspace_ids : (folder.workspace_id ? [folder.workspace_id] : []));
                                    setShowRenameDialog(true);
                                }}>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentFolderId(folder.id);
                                    setFolderWorkspaceIds(folder.workspace_ids?.length ? folder.workspace_ids : (folder.workspace_id ? [folder.workspace_id] : []));
                                    setShowFolderDialog(true);
                                }}>
                                    <FolderPlus className="h-4 w-4 mr-2" />
                                    Nova subpasta
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-muted" />
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

                        <ChevronRight className="h-5 w-5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                    </div>
                </div>
            </div>
        );
    };

    if (isLoading) {
        return (
            <MainLayout title="Campanhas" subtitle="Gerencie gatilhos para seus fluxos de atendimento">
                <div className="flex h-[50vh] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </MainLayout>
        );
    }

    const isEmpty = (!campaigns || campaigns.length === 0) && (!folders || folders.length === 0);

    return (
        <MainLayout
            title="Campanhas"
            subtitle="Gerencie gatilhos para seus fluxos de atendimento"
            showNewButton
            newButtonLabel="Nova Campanha"
            onNewClick={handleCreate}
        >
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
                                placeholder="Ex: Black Friday"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                                className="bg-muted border-border focus:ring-0 focus:border-border h-11 rounded-lg"
                            />
                        </div>
                        {isAdmin && (
                            <div className="grid gap-2">
                                <Label className="text-sm font-medium">Workspaces</Label>
                                <MultiWorkspaceSelector
                                    workspaces={availableWorkspaces}
                                    value={folderWorkspaceIds}
                                    onChange={setFolderWorkspaceIds}
                                />
                                <p className="text-[11px] text-muted-foreground/80 mt-1">Selecione um ou mais workspaces. Vazio = aparece em todos. Campanhas movidas para esta pasta herdarão a seleção.</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="flex items-center justify-end gap-3 mt-2">
                        <Button variant="ghost" onClick={() => {
                            setShowFolderDialog(false);
                            setNewFolderName("");
                            setCurrentFolderId(null);
                            setFolderWorkspaceIds([]);
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
                                onKeyDown={(e) => e.key === "Enter" && handleRenameFolder()}
                                className="bg-muted border-border focus:ring-0 focus:border-border h-11 rounded-lg"
                            />
                        </div>
                        {isAdmin && (
                            <div className="grid gap-2">
                                <Label className="text-sm font-medium">Workspaces</Label>
                                <MultiWorkspaceSelector
                                    workspaces={availableWorkspaces}
                                    value={folderWorkspaceIds}
                                    onChange={setFolderWorkspaceIds}
                                />
                                <p className="text-[11px] text-muted-foreground/80 mt-1">Selecione um ou mais workspaces. Vazio = aparece em todos. Campanhas movidas para esta pasta herdarão a seleção.</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="flex items-center justify-end gap-3 mt-2">
                        <Button variant="ghost" onClick={() => {
                            setShowRenameDialog(false);
                            setNewFolderName("");
                            setFolderWorkspaceIds([]);
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

            {isEmpty ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Megaphone className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">Nenhuma campanha criada</h3>
                    <p className="text-muted-foreground mb-4">
                        Crie pastas ou campanhas para disparar fluxos automaticamente.
                    </p>
                    <Button onClick={handleCreate}>Criar Campanha</Button>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
                        <button
                            onClick={() => setOpenFolderId(null)}
                            className={cn("hover:text-foreground transition-colors font-medium", !openFolderId && "text-foreground")}
                        >
                            Campanhas
                        </button>
                        {breadcrumb.map((f, i) => (
                            <span key={f.id} className="flex items-center gap-1">
                                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                                <button
                                    onClick={() => setOpenFolderId(f.id)}
                                    className={cn("hover:text-foreground transition-colors font-medium", i === breadcrumb.length - 1 && "text-foreground")}
                                >
                                    {f.name}
                                </button>
                            </span>
                        ))}
                    </div>

                    {/* Toolbar */}
                    <div className="flex items-center justify-between">
                        <Button
                            variant="outline"
                            size="sm"
                            className="bg-card border-border hover:bg-muted font-bold text-xs px-4"
                            onClick={() => {
                                setCurrentFolderId(openFolderId);
                                const inheritIds = openFolderId
                                    ? openFolderWorkspaceIds
                                    : (selectedWorkspaceId && selectedWorkspaceId !== "unassigned" ? [selectedWorkspaceId] : []);
                                setFolderWorkspaceIds(inheritIds);
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
                            <div className="w-9" />
                            <div className="flex-1">Nome / Gatilho</div>
                            <div className="hidden md:block w-40">Fluxo</div>
                            <div className="hidden md:flex items-center gap-8">
                                <div className="w-12 text-center">Disparos</div>
                                <div className="w-12 text-center">Em espera</div>
                            </div>
                            <div className="w-28 text-center">Status</div>
                            <div className="w-24 text-right pr-2">Ações</div>
                        </div>

                        <div className="bg-card">
                            {currentItems.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <Megaphone className="h-10 w-10 text-muted-foreground/30 mb-4" />
                                    <p className="text-sm text-muted-foreground mb-1">
                                        {openFolderId ? "Esta pasta está vazia" : "Nenhum item aqui ainda"}
                                    </p>
                                    <p className="text-xs text-muted-foreground/70">
                                        Use "Nova Campanha" para criar uma campanha {openFolderId ? "nesta pasta" : "aqui"}.
                                    </p>
                                </div>
                            ) : (
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleDragEnd}
                                    modifiers={[restrictToVerticalAxis]}
                                >
                                    <SortableContext items={currentItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                                        {currentItems.map(item => (
                                            <SortableRow key={item.id} id={item.id}>
                                                {"is_active" in item ? (
                                                    <CampaignRow campaign={item as Campaign} />
                                                ) : (
                                                    <FolderRow folder={item as CampaignFolder} />
                                                )}
                                            </SortableRow>
                                        ))}
                                    </SortableContext>
                                </DndContext>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isDialogOpen && (
                <CampaignDialog
                    open={isDialogOpen}
                    onOpenChange={setIsDialogOpen}
                    campaignToEdit={editingCampaign}
                    folderId={editingCampaign ? null : openFolderId}
                />
            )}
        </MainLayout>
    );
};

export default CampaignsPage;
