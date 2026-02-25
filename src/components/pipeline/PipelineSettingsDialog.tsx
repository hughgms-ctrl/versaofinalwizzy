import { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
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
  Pipeline, 
  PipelineColumn,
  usePipelineColumns, 
  useUpdatePipeline, 
  useCreateColumn, 
  useUpdateColumn,
  useDeleteColumn 
} from '@/hooks/usePipelines';

interface PipelineSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline;
}

const DEFAULT_COLORS = [
  '#3b82f6', '#f59e0b', '#22c55e', '#8b5cf6', '#ef4444', '#64748b',
];

// Componente para input de coluna com estado local
function ColumnInput({ 
  column, 
  onUpdate, 
  onDelete, 
  canDelete,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragging,
}: { 
  column: PipelineColumn; 
  onUpdate: (field: 'name' | 'color', value: string) => void;
  onDelete: () => void;
  canDelete: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
  isDragging: boolean;
}) {
  const [localName, setLocalName] = useState(column.name);

  useEffect(() => {
    setLocalName(column.name);
  }, [column.name]);

  const handleBlur = () => {
    const trimmedName = localName.trim();
    const finalName = trimmedName || `Coluna ${column.order + 1}`;
    if (finalName !== column.name) {
      onUpdate('name', finalName);
    }
    setLocalName(finalName);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div 
      className={`flex items-center gap-2 rounded-md transition-opacity ${isDragging ? 'opacity-40' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing" />
      <input
        type="color"
        value={column.color}
        onChange={(e) => onUpdate('color', e.target.value)}
        className="h-8 w-8 rounded cursor-pointer shrink-0"
      />
      <Input
        value={localName}
        onChange={(e) => setLocalName(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Nome da coluna..."
        className="flex-1"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onDelete}
        disabled={!canDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function PipelineSettingsDialog({ open, onOpenChange, pipeline }: PipelineSettingsDialogProps) {
  const [name, setName] = useState(pipeline.name);
  const [description, setDescription] = useState(pipeline.description || '');
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>(pipeline.workspace_ids || []);
  const [deleteColumnId, setDeleteColumnId] = useState<string | null>(null);

  const { data: columns = [] } = usePipelineColumns(pipeline.id);
  const updatePipeline = useUpdatePipeline();
  const createColumn = useCreateColumn();
  const updateColumn = useUpdateColumn();
  const deleteColumn = useDeleteColumn();
  const { availableWorkspaces, isAdmin } = useWorkspaceContext();

  useEffect(() => {
    setName(pipeline.name);
    setDescription(pipeline.description || '');
    setSelectedWorkspaceIds(pipeline.workspace_ids || []);
  }, [pipeline]);

  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const toggleWorkspace = (wsId: string) => {
    setSelectedWorkspaceIds(prev =>
      prev.includes(wsId) ? prev.filter(id => id !== wsId) : [...prev, wsId]
    );
  };

  const hasChanges = () => {
    const wsChanged = JSON.stringify([...(selectedWorkspaceIds || [])].sort()) !== JSON.stringify([...(pipeline.workspace_ids || [])].sort());
    return name !== pipeline.name || description !== (pipeline.description || '') || wsChanged;
  };

  const handleSave = async () => {
    if (hasChanges()) {
      await updatePipeline.mutateAsync({ 
        id: pipeline.id, 
        name, 
        description,
        workspace_ids: selectedWorkspaceIds,
      });
    }
    onOpenChange(false);
  };

  const handleAddColumn = async () => {
    const nextColor = DEFAULT_COLORS[columns.length % DEFAULT_COLORS.length];
    const maxOrder = Math.max(0, ...columns.map(c => c.order));
    await createColumn.mutateAsync({
      pipelineId: pipeline.id,
      name: '',
      color: nextColor,
      order: maxOrder + 1,
    });
  };

  const handleUpdateColumn = async (column: PipelineColumn, field: 'name' | 'color', value: string) => {
    await updateColumn.mutateAsync({
      id: column.id,
      pipelineId: pipeline.id,
      [field]: value,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteColumnId) return;
    await deleteColumn.mutateAsync({ id: deleteColumnId, pipelineId: pipeline.id });
    setDeleteColumnId(null);
  };

  const handleColumnDrop = async (targetColumn: PipelineColumn) => {
    if (!draggedColumnId || draggedColumnId === targetColumn.id) return;
    const draggedCol = columns.find(c => c.id === draggedColumnId);
    if (!draggedCol) return;

    // Swap orders
    await updateColumn.mutateAsync({
      id: draggedCol.id,
      pipelineId: pipeline.id,
      order: targetColumn.order,
    });
    await updateColumn.mutateAsync({
      id: targetColumn.id,
      pipelineId: pipeline.id,
      order: draggedCol.order,
    });
    setDraggedColumnId(null);
    setDragOverColumnId(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurar Pipeline</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome do Pipeline</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Workspaces</Label>
              <p className="text-xs text-muted-foreground">
                Selecione os workspaces onde este pipeline será visível. Sem seleção = visível em todos.
              </p>
              {isAdmin ? (
                <div className="space-y-2 p-3 border rounded-lg bg-muted/30 max-h-[150px] overflow-y-auto">
                  {availableWorkspaces.length === 0 ? (
                    <span className="text-sm text-muted-foreground">Nenhum workspace disponível</span>
                  ) : (
                    availableWorkspaces.map(ws => (
                      <div key={ws.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`ws-edit-${ws.id}`}
                          checked={selectedWorkspaceIds.includes(ws.id)}
                          onCheckedChange={() => toggleWorkspace(ws.id)}
                        />
                        <Label htmlFor={`ws-edit-${ws.id}`} className="cursor-pointer flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: ws.color }} />
                          {ws.name}
                        </Label>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 px-3 py-2 rounded-md border border-input bg-muted/50 text-sm">
                  {selectedWorkspaceIds.length === 0 ? (
                    <span className="text-muted-foreground">Todos os Workspaces</span>
                  ) : (
                    selectedWorkspaceIds.map(wsId => {
                      const ws = availableWorkspaces.find(w => w.id === wsId);
                      if (!ws) return null;
                      return (
                        <span key={ws.id} className="flex items-center gap-1.5">
                          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: ws.color }} />
                          {ws.name}
                        </span>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Colunas</Label>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleAddColumn}
                  disabled={createColumn.isPending}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              </div>

              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {columns.map((column) => (
                  <ColumnInput
                    key={column.id}
                    column={column}
                    onUpdate={(field, value) => handleUpdateColumn(column, field, value)}
                    onDelete={() => setDeleteColumnId(column.id)}
                    canDelete={columns.length > 1}
                    onDragStart={() => setDraggedColumnId(column.id)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverColumnId(column.id); }}
                    onDragEnd={() => { setDraggedColumnId(null); setDragOverColumnId(null); }}
                    onDrop={(e) => { e.preventDefault(); handleColumnDrop(column); }}
                    isDragging={draggedColumnId === column.id}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={updatePipeline.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteColumnId} onOpenChange={() => setDeleteColumnId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir coluna?</AlertDialogTitle>
            <AlertDialogDescription>
              As conversas nesta coluna ficarão sem posição definida neste pipeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
