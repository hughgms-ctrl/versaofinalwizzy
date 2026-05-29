import { useState } from 'react';
import { FileText, Plus, Upload, Edit, Trash2, Copy, MoreHorizontal, Search, FileDown, Link2, Folder, FolderPlus, ChevronRight, ChevronDown, Pencil, FolderInput, MapPinned } from 'lucide-react';
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
import { useDocumentTemplates, useDeleteDocumentTemplate, useCreateDocumentTemplate, DocumentTemplate } from '@/hooks/useDocumentTemplates';
import {
  useDocumentFolders,
  useCreateDocumentFolder,
  useDeleteDocumentFolder,
  useRenameDocumentFolder,
  useMoveDocumentToFolder,
  useUpdateDocumentWorkspace,
  DocumentFolder,
} from '@/hooks/useDocumentFolders';
import { UploadTemplateDialog } from './UploadTemplateDialog';
import { TemplateEditor } from './TemplateEditor';
import { TemplateFillForm } from './TemplateFillForm';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { cn } from '@/lib/utils';

export function TemplatesList({ onGeneratedForSignature }: { onGeneratedForSignature?: (docId: string) => void } = {}) {
  const { data: templates, isLoading } = useDocumentTemplates();
  const { data: folders = [] } = useDocumentFolders('template');
  const deleteTemplate = useDeleteDocumentTemplate();
  const createTemplate = useCreateDocumentTemplate();
  const createFolder = useCreateDocumentFolder();
  const deleteFolder = useDeleteDocumentFolder();
  const renameFolder = useRenameDocumentFolder();
  const moveToFolder = useMoveDocumentToFolder();
  const updateWorkspace = useUpdateDocumentWorkspace();
  const { toast } = useToast();
  const { selectedWorkspaceId, availableWorkspaces, isAdmin } = useWorkspaceContext();

  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
  const [fillingTemplate, setFillingTemplate] = useState<DocumentTemplate | null>(null);
  const [showNewEditor, setShowNewEditor] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderWorkspaceId, setFolderWorkspaceId] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<DocumentFolder | null>(null);

  const handleCopyLink = (template: DocumentTemplate) => {
    const url = `${window.location.origin}/form?id=${template.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copiado!', description: 'O link do formulário foi copiado para a área de transferência.' });
  };

  const matchesWorkspace = (wsId: string | null | undefined) => {
    if (!selectedWorkspaceId) return true;
    return wsId === selectedWorkspaceId;
  };

  const filtered = templates?.filter(t => {
    if (!matchesWorkspace(t.workspace_id)) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.category?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }) || [];

  const filteredFolders = folders.filter(f => matchesWorkspace(f.workspace_id));

  const rootTemplates = filtered.filter(t => !(t as any).folder_id);
  const getTemplatesInFolder = (folderId: string) => filtered.filter(t => (t as any).folder_id === folderId);

  const handleDuplicate = (template: DocumentTemplate) => {
    createTemplate.mutate({
      name: `${template.name} (cópia)`,
      description: template.description || undefined,
      category: template.category || undefined,
      content: template.content,
      fields: template.fields,
    });
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder.mutate({ name: newFolderName.trim(), workspaceId: folderWorkspaceId, kind: 'template' });
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
    if (confirm('Tem certeza que deseja excluir esta pasta? Os templates dentro dela ficarão sem pasta.')) {
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

  const handleMoveToFolder = (templateId: string, folderId: string | null) => {
    const folder = folders.find(f => f.id === folderId);
    moveToFolder.mutate({ type: 'template', itemId: templateId, folderId, folderWorkspaceId: folder?.workspace_id || null });
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

  if (editingTemplate) return <TemplateEditor template={editingTemplate} onBack={() => setEditingTemplate(null)} />;
  if (fillingTemplate) return <TemplateFillForm template={fillingTemplate} onBack={() => setFillingTemplate(null)} onGeneratedForSignature={onGeneratedForSignature} />;
  if (showNewEditor) return <TemplateEditor template={null} onBack={() => setShowNewEditor(false)} />;

  const TemplateRow = ({ template, nested = false }: { template: DocumentTemplate; nested?: boolean }) => (
    <div className={cn(
      "flex items-center gap-4 px-4 py-3 hover:bg-muted/10 transition-colors border-b border-border/50 last:border-b-0 group",
      nested && "bg-card/50"
    )}>
      <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <FileText className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setEditingTemplate(template)}>
        <h3 className="font-medium text-foreground text-sm">{template.name}</h3>
        <p className="text-[11px] text-muted-foreground">{template.description || template.category || 'Sem descrição'}</p>
      </div>
      <div className="hidden md:flex items-center gap-2 text-muted-foreground text-xs">
        <span>{template.fields?.length || 0} campos</span>
        <span>•</span>
        <span>{format(new Date(template.created_at), "dd MMM yyyy", { locale: ptBR })}</span>
      </div>
      <WorkspaceBadge workspaceId={template.workspace_id} />

      {/* Primary actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => setEditingTemplate(template)}>
          Gerenciar
        </Button>
        <Button size="sm" className="text-xs h-8 gap-1.5" onClick={() => handleCopyLink(template)}>
          <Link2 className="h-3.5 w-3.5" /> Enviar documento
        </Button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-60 group-hover:opacity-100">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setFillingTemplate(template)}>
            <FileDown className="h-4 w-4 mr-2" /> Preencher internamente
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleCopyLink(template)}>
            <Link2 className="h-4 w-4 mr-2" /> Copiar link público
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditingTemplate(template)}>
            <Edit className="h-4 w-4 mr-2" /> Editar modelo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleDuplicate(template)}>
            <Copy className="h-4 w-4 mr-2" /> Duplicar
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput className="h-4 w-4 mr-2" /> Mover para pasta
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => handleMoveToFolder(template.id, null)}>
                <Folder className="h-4 w-4 mr-2" /> Raiz (sem pasta)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {folders.filter(f => f.workspace_id === template.workspace_id).map(f => (
                <DropdownMenuItem key={f.id} onClick={() => handleMoveToFolder(template.id, f.id)}>
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
                <DropdownMenuItem onClick={() => updateWorkspace.mutate({ type: 'template', itemId: template.id, workspaceId: null })}>
                  Nenhum (Todos)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {availableWorkspaces.map(ws => (
                  <DropdownMenuItem key={ws.id} onClick={() => updateWorkspace.mutate({ type: 'template', itemId: template.id, workspaceId: ws.id })}>
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
          <DropdownMenuItem className="text-destructive" onClick={() => deleteTemplate.mutate(template.id)}>
            <Trash2 className="h-4 w-4 mr-2" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const FolderSection = ({ folder }: { folder: DocumentFolder }) => {
    const isExpanded = expandedFolders.has(folder.id);
    const folderTemplates = getTemplatesInFolder(folder.id);

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
            {folderTemplates.length} {folderTemplates.length === 1 ? 'item' : 'itens'}
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
              <DropdownMenuItem className="text-destructive" onClick={e => { e.stopPropagation(); handleDeleteFolder(folder.id); }}>
                <Trash2 className="h-4 w-4 mr-2" /> Excluir pasta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isExpanded && (
          <div className="bg-card/30">
            {folderTemplates.length === 0 ? (
              <p className="text-xs text-muted-foreground px-12 py-3">Pasta vazia</p>
            ) : (
              folderTemplates.map(t => <TemplateRow key={t.id} template={t} nested />)
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
            <Input placeholder="Buscar templates..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowUpload(true)}>
            <Upload className="h-4 w-4 mr-2" /> Upload modelo
          </Button>
          <Button onClick={() => setShowNewEditor(true)}>
            <Plus className="h-4 w-4 mr-2" /> Criar manualmente
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Card key={i} className="p-4 animate-pulse"><div className="h-5 bg-muted rounded w-3/4" /></Card>)}
        </div>
      ) : (filteredFolders.length === 0 && rootTemplates.length === 0 && filtered.length === 0) ? (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhum template ainda</h3>
          <p className="text-sm text-muted-foreground mb-4">Faça upload de um modelo ou crie um template manualmente.</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => setShowUpload(true)}><Upload className="h-4 w-4 mr-2" /> Upload modelo</Button>
            <Button onClick={() => setShowNewEditor(true)}><Plus className="h-4 w-4 mr-2" /> Criar manualmente</Button>
          </div>
        </Card>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-3 bg-muted/30 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]">
            <div className="flex-1">Nome</div>
            <div className="hidden md:block w-40 text-right">Detalhes</div>
            <div className="w-24 text-center">Workspace</div>
            <div className="w-10" />
          </div>
          {filteredFolders.map(f => <FolderSection key={f.id} folder={f} />)}
          {rootTemplates.map(t => <TemplateRow key={t.id} template={t} />)}
        </div>
      )}

      <UploadTemplateDialog open={showUpload} onOpenChange={setShowUpload} />

      {/* Create Folder Dialog */}
      <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova Pasta</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome da pasta</Label>
              <Input placeholder="Ex: Contratos" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateFolder()} />
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
                <p className="text-[11px] text-muted-foreground">Templates movidos para esta pasta herdarão o workspace.</p>
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
