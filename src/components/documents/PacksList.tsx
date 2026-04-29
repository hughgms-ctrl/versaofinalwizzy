import { useState } from 'react';
import { Package, Plus, Edit, Trash2, MoreHorizontal, Search, FileText, ClipboardList, Link2, Copy, Check, Folder, FolderPlus, ChevronRight, ChevronDown, Pencil, FolderInput, MapPinned } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useDocumentPacks, useDeleteDocumentPack, useGeneratePackToken, DocumentPack } from '@/hooks/useDocumentPacks';
import { useDocumentTemplates } from '@/hooks/useDocumentTemplates';
import {
  useDocumentFolders,
  useCreateDocumentFolder,
  useDeleteDocumentFolder,
  useRenameDocumentFolder,
  useMoveDocumentToFolder,
  useUpdateDocumentWorkspace,
  DocumentFolder,
} from '@/hooks/useDocumentFolders';
import { PackEditor } from './PackEditor';
import { PackFillForm } from './PackFillForm';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { cn } from '@/lib/utils';

export function PacksList({ onGeneratedForSignature }: { onGeneratedForSignature?: (docId: string) => void } = {}) {
  const { data: packs, isLoading } = useDocumentPacks();
  const { data: templates } = useDocumentTemplates();
  const { data: folders = [] } = useDocumentFolders('pack');
  const deletePack = useDeleteDocumentPack();
  const generateToken = useGeneratePackToken();
  const createFolder = useCreateDocumentFolder();
  const deleteFolder = useDeleteDocumentFolder();
  const renameFolder = useRenameDocumentFolder();
  const moveToFolder = useMoveDocumentToFolder();
  const updateWorkspace = useUpdateDocumentWorkspace();
  const { selectedWorkspaceId, availableWorkspaces, isAdmin } = useWorkspaceContext();

  const [search, setSearch] = useState('');
  const [editingPack, setEditingPack] = useState<DocumentPack | null>(null);
  const [fillingPack, setFillingPack] = useState<DocumentPack | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderWorkspaceId, setFolderWorkspaceId] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<DocumentFolder | null>(null);

  const matchesWorkspace = (wsId: string | null | undefined) => {
    if (!selectedWorkspaceId) return true;
    return wsId === selectedWorkspaceId;
  };

  const filtered = packs?.filter(p => {
    if (!matchesWorkspace(p.workspace_id)) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }) || [];

  const filteredFolders = folders.filter(f => matchesWorkspace(f.workspace_id));
  const rootPacks = filtered.filter(p => !(p as any).folder_id);
  const getPacksInFolder = (folderId: string) => filtered.filter(p => (p as any).folder_id === folderId);

  const getTemplateNames = (ids: string[]) => ids.map(id => templates?.find(t => t.id === id)?.name || 'Template removido');

  const handleCopyLink = async (pack: DocumentPack) => {
    let token = pack.public_token;
    if (!token) {
      try {
        const result = await generateToken.mutateAsync(pack.id);
        token = result.public_token;
      } catch { return; }
    }
    const isPreview = window.location.hostname.includes('preview') || window.location.hostname.includes('lovableproject.com');
    const origin = isPreview ? 'https://wizzyai.lovable.app' : window.location.origin;
    const url = `${origin}/pack-form?token=${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(pack.id);
    toast.success('Link copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder.mutate({ name: newFolderName.trim(), workspaceId: folderWorkspaceId, kind: 'pack' });
      setNewFolderName('');
      setFolderWorkspaceId(null);
      setShowFolderDialog(false);
    }
  };

  const handleRenameFolder = () => {
    if (editingFolder && newFolderName.trim()) {
      renameFolder.mutate({ folderId: editingFolder.id, name: newFolderName.trim(), workspaceId: folderWorkspaceId });
      setNewFolderName('');
      setFolderWorkspaceId(null);
      setEditingFolder(null);
      setShowRenameDialog(false);
    }
  };

  const handleDeleteFolder = (folderId: string) => {
    if (confirm('Tem certeza que deseja excluir esta pasta? Os packs dentro dela ficarão sem pasta.')) {
      deleteFolder.mutate(folderId);
    }
  };

  const toggleFolderExpand = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleMoveToFolder = (packId: string, folderId: string | null) => {
    const folder = folders.find(f => f.id === folderId);
    moveToFolder.mutate({ type: 'pack', itemId: packId, folderId, folderWorkspaceId: folder?.workspace_id || null });
  };

  const WorkspaceBadge = ({ workspaceId }: { workspaceId: string | null }) => {
    if (!workspaceId) return null;
    const ws = availableWorkspaces.find(w => w.id === workspaceId);
    if (!ws) return null;
    return (
      <div className="px-2 py-0.5 rounded-[4px] border shrink-0" style={{ backgroundColor: `${ws.color}15`, borderColor: `${ws.color}30` }}>
        <span className="text-[10px] font-medium" style={{ color: ws.color }}>{ws.name}</span>
      </div>
    );
  };

  if (fillingPack) return <PackFillForm pack={fillingPack} onBack={() => setFillingPack(null)} onGeneratedForSignature={onGeneratedForSignature} />;
  if (editingPack || showNew) return <PackEditor pack={editingPack} onBack={() => { setEditingPack(null); setShowNew(false); }} />;

  const PackRow = ({ pack, nested = false }: { pack: DocumentPack; nested?: boolean }) => (
    <div className={cn(
      "flex items-center gap-4 px-4 py-3 hover:bg-muted/10 transition-colors border-b border-border/50 last:border-b-0 group",
      nested && "bg-card/50"
    )}>
      <div className="h-9 w-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
        <Package className="h-5 w-5 text-accent-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-foreground text-sm">{pack.name}</h3>
        <p className="text-[11px] text-muted-foreground">{pack.template_ids.length} templates</p>
      </div>
      <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
        <span>{format(new Date(pack.created_at), "dd MMM yyyy", { locale: ptBR })}</span>
        {pack.public_token && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-primary border-primary/30">
            <Link2 className="h-2.5 w-2.5 mr-0.5" /> Link ativo
          </Badge>
        )}
      </div>
      <WorkspaceBadge workspaceId={pack.workspace_id} />
      <Button size="sm" variant="outline" onClick={() => setFillingPack(pack)} className="shrink-0">
        <ClipboardList className="h-3.5 w-3.5 mr-1.5" /> Preencher
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setFillingPack(pack)}>
            <ClipboardList className="h-4 w-4 mr-2" /> Preencher
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleCopyLink(pack)}>
            {copiedId === pack.id ? <Check className="h-4 w-4 mr-2 text-primary" /> : <Link2 className="h-4 w-4 mr-2" />}
            Copiar link público
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setEditingPack(pack)}>
            <Edit className="h-4 w-4 mr-2" /> Editar
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput className="h-4 w-4 mr-2" /> Mover para pasta
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => handleMoveToFolder(pack.id, null)}>
                <Folder className="h-4 w-4 mr-2" /> Raiz (sem pasta)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {folders.filter(f => f.workspace_id === pack.workspace_id).map(f => (
                <DropdownMenuItem key={f.id} onClick={() => handleMoveToFolder(pack.id, f.id)}>
                  <Folder className="h-4 w-4 mr-2" /> {f.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {isAdmin && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <MapPinned className="h-4 w-4 mr-2" /> Workspace
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => updateWorkspace.mutate({ type: 'pack', itemId: pack.id, workspaceId: null })}>
                  Nenhum (Todos)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {availableWorkspaces.map(ws => (
                  <DropdownMenuItem key={ws.id} onClick={() => updateWorkspace.mutate({ type: 'pack', itemId: pack.id, workspaceId: ws.id })}>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: ws.color }} />
                      {ws.name}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={() => deletePack.mutate(pack.id)}>
            <Trash2 className="h-4 w-4 mr-2" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const FolderSection = ({ folder }: { folder: DocumentFolder }) => {
    const isExpanded = expandedFolders.has(folder.id);
    const folderPacks = getPacksInFolder(folder.id);

    return (
      <div className="border-b border-border/50 last:border-b-0">
        <div
          className="flex items-center gap-3 px-4 py-3 hover:bg-muted/10 transition-colors cursor-pointer group"
          onClick={() => toggleFolderExpand(folder.id)}
        >
          {isExpanded ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
          <Folder className="h-5 w-5 text-muted-foreground" />
          <span className="font-semibold text-foreground text-sm flex-1">{folder.name}</span>

          <WorkspaceBadge workspaceId={folder.workspace_id} />

          <span className="text-[11px] text-muted-foreground min-w-[50px] text-right">
            {folderPacks.length} {folderPacks.length === 1 ? 'item' : 'itens'}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={e => {
                e.stopPropagation();
                setEditingFolder(folder);
                setNewFolderName(folder.name);
                setFolderWorkspaceId(folder.workspace_id);
                setShowRenameDialog(true);
              }}>
                <Pencil className="h-4 w-4 mr-2" /> Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem className="text-destructive" onSelect={e => e.preventDefault()} onClick={e => e.stopPropagation()}>
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir pasta e packs
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir pasta e todos os packs?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso excluirá a pasta e {folderPacks.length} pack(s) permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        folderPacks.forEach(p => deletePack.mutate(p.id));
                        deleteFolder.mutate(folder.id);
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Excluir tudo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <DropdownMenuItem className="text-destructive" onClick={e => { e.stopPropagation(); handleDeleteFolder(folder.id); }}>
                <Trash2 className="h-4 w-4 mr-2" /> Excluir só a pasta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isExpanded && (
          <div className="bg-card/30">
            {folderPacks.length === 0 ? (
              <p className="text-xs text-muted-foreground px-12 py-3">Pasta vazia</p>
            ) : (
              folderPacks.map(p => <PackRow key={p.id} pack={p} nested />)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFolderWorkspaceId(selectedWorkspaceId);
              setShowFolderDialog(true);
            }}
          >
            <FolderPlus className="h-4 w-4 mr-1" /> Nova Pasta
          </Button>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar packs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Pack
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <Card key={i} className="p-4 animate-pulse"><div className="h-5 bg-muted rounded w-3/4" /></Card>)}
        </div>
      ) : (filteredFolders.length === 0 && rootPacks.length === 0 && filtered.length === 0) ? (
        <Card className="p-12 text-center">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhum pack ainda</h3>
          <p className="text-sm text-muted-foreground mb-4">Agrupe templates para gerar múltiplos documentos de uma vez.</p>
          <Button onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-2" /> Criar pack</Button>
        </Card>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-3 bg-muted/30 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]">
            <div className="flex-1">Nome</div>
            <div className="hidden md:block w-40 text-right">Detalhes</div>
            <div className="w-24 text-center">Workspace</div>
            <div className="w-32" />
            <div className="w-10" />
          </div>
          {filteredFolders.map(f => <FolderSection key={f.id} folder={f} />)}
          {rootPacks.map(p => <PackRow key={p.id} pack={p} />)}
        </div>
      )}

      {/* Create Folder Dialog */}
      <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova Pasta</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome da pasta</Label>
              <Input placeholder="Ex: Seguros" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateFolder()} />
            </div>
            {isAdmin && (
              <div className="grid gap-2">
                <Label>Workspace</Label>
                <Select value={folderWorkspaceId || 'all'} onValueChange={val => setFolderWorkspaceId(val === 'all' ? null : val)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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
                <p className="text-[11px] text-muted-foreground">Packs movidos para esta pasta herdarão o workspace.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowFolderDialog(false); setNewFolderName(''); setFolderWorkspaceId(null); }}>Cancelar</Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Pasta</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome da pasta</Label>
              <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRenameFolder()} />
            </div>
            {isAdmin && (
              <div className="grid gap-2">
                <Label>Workspace</Label>
                <Select value={folderWorkspaceId || 'all'} onValueChange={val => setFolderWorkspaceId(val === 'all' ? null : val)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowRenameDialog(false); setNewFolderName(''); setFolderWorkspaceId(null); setEditingFolder(null); }}>Cancelar</Button>
            <Button onClick={handleRenameFolder} disabled={!newFolderName.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
