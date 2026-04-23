import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Loader2, Plus, Save, Sparkles, Pencil, Trash2, Copy, FolderInput, ArrowRight,
} from 'lucide-react';
import {
  WorkspaceTemplate,
  useWorkspaceTemplates, useDeleteWorkspaceTemplate, useActivateWorkspaceTemplate,
} from '@/hooks/useWorkspaceTemplates';
import { ExportWorkspaceDialog } from './ExportWorkspaceDialog';
import { CloneFromCatalogDialog } from './CloneFromCatalogDialog';
import { TemplateEditorDialog } from './TemplateEditorDialog';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

export function MyTemplatesTab() {
  const { selectedWorkspaceId, availableWorkspaces } = useWorkspaceContext();
  const { data: templates = [], isLoading } = useWorkspaceTemplates(selectedWorkspaceId || undefined);

  const [exportOpen, setExportOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<WorkspaceTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WorkspaceTemplate | null>(null);
  const [activating, setActivating] = useState<{ tpl: WorkspaceTemplate; workspaceId: string } | null>(null);

  const del = useDeleteWorkspaceTemplate();
  const activate = useActivateWorkspaceTemplate();

  const sourceLabel = useMemo(() => ({
    scratch: 'Do zero',
    workspace_export: 'Exportado',
    cloned_from_package: 'Clonado',
  } as Record<string, string>), []);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => { setEditing(null); setEditorOpen(true); }} disabled={!selectedWorkspaceId}>
          <Plus className="h-4 w-4 mr-2" />Criar do zero
        </Button>
        <Button variant="outline" onClick={() => setExportOpen(true)} disabled={!selectedWorkspaceId}>
          <Save className="h-4 w-4 mr-2" />Salvar workspace atual como template
        </Button>
        <Button variant="outline" onClick={() => setCloneOpen(true)} disabled={!selectedWorkspaceId}>
          <Copy className="h-4 w-4 mr-2" />Duplicar do catálogo
        </Button>
      </div>

      {!selectedWorkspaceId && (
        <p className="text-sm text-muted-foreground">Selecione um workspace para ver e gerenciar seus templates.</p>
      )}

      {selectedWorkspaceId && (
        isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : templates.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum template ainda. Use os botões acima para criar.
          </CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tpl) => (
              <Card key={tpl.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-2xl">{tpl.icon || '📦'}</div>
                    <Badge variant="outline" className="text-[10px]">{sourceLabel[tpl.source] || tpl.source}</Badge>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{tpl.name}</h3>
                    {tpl.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{tpl.description}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    <Badge variant="outline">{(tpl.agents_template?.length || 0)} agentes</Badge>
                    <Badge variant="outline">{(tpl.flows_template?.length || 0)} fluxos</Badge>
                    <Badge variant="outline">{(tpl.tags_template?.length || 0)} tags</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm" className="flex-1"
                      onClick={() => setActivating({ tpl, workspaceId: tpl.workspace_id })}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />Ativar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(tpl); setEditorOpen(true); }} title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(tpl)} title="Excluir">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}

      <ExportWorkspaceDialog open={exportOpen} onOpenChange={setExportOpen} />
      <CloneFromCatalogDialog open={cloneOpen} onOpenChange={setCloneOpen} />
      <TemplateEditorDialog open={editorOpen} onOpenChange={setEditorOpen} template={editing} />

      {/* Activate dialog: choose target workspace */}
      <Dialog open={!!activating} onOpenChange={(o) => !o && setActivating(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FolderInput className="h-5 w-5" />Ativar template</DialogTitle>
          </DialogHeader>
          {activating && (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>{activating.tpl.name}</strong> — escolha o workspace destino:
              </p>
              <Label>Workspace destino</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                value={activating.workspaceId}
                onChange={(e) => setActivating({ ...activating, workspaceId: e.target.value })}
              >
                {availableWorkspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivating(null)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!activating) return;
                await activate.mutateAsync({ template_id: activating.tpl.id, workspace_id: activating.workspaceId });
                setActivating(null);
              }}
              disabled={activate.isPending}
            >
              {activate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
              Ativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.name}" será removido. Recursos já ativados anteriormente são preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (confirmDelete) await del.mutateAsync(confirmDelete.id);
              setConfirmDelete(null);
            }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
