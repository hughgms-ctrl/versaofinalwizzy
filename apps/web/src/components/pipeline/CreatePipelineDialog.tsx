import { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useCreatePipeline } from '@/hooks/usePipelines';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

interface CreatePipelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_COLORS = [
  '#3b82f6', '#f59e0b', '#22c55e', '#8b5cf6', '#ef4444', '#64748b',
];

export function CreatePipelineDialog({ open, onOpenChange }: CreatePipelineDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [columns, setColumns] = useState([
    { name: 'Novo', color: '#3b82f6' },
    { name: 'Em andamento', color: '#f59e0b' },
    { name: 'Concluído', color: '#22c55e' },
  ]);

  const createPipeline = useCreatePipeline();
  const { selectedWorkspaceId, availableWorkspaces, isAdmin } = useWorkspaceContext();

  useEffect(() => {
    if (open) {
      if (!isAdmin && selectedWorkspaceId) {
        setSelectedWorkspaceIds([selectedWorkspaceId]);
      } else if (isAdmin && selectedWorkspaceId) {
        setSelectedWorkspaceIds([selectedWorkspaceId]);
      } else {
        setSelectedWorkspaceIds([]);
      }
    }
  }, [open, isAdmin, selectedWorkspaceId]);

  const toggleWorkspace = (wsId: string) => {
    setSelectedWorkspaceIds(prev =>
      prev.includes(wsId) ? prev.filter(id => id !== wsId) : [...prev, wsId]
    );
  };

  const handleAddColumn = () => {
    const nextColor = DEFAULT_COLORS[columns.length % DEFAULT_COLORS.length];
    setColumns([...columns, { name: '', color: nextColor }]);
  };

  const handleRemoveColumn = (index: number) => {
    setColumns(columns.filter((_, i) => i !== index));
  };

  const handleColumnChange = (index: number, field: 'name' | 'color', value: string) => {
    const updated = [...columns];
    updated[index] = { ...updated[index], [field]: value };
    setColumns(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (columns.length === 0) return;
    if (columns.some(c => !c.name.trim())) return;

    await createPipeline.mutateAsync({ 
      name, 
      description, 
      columns,
      workspace_ids: selectedWorkspaceIds,
    });
    
    setName('');
    setDescription('');
    setSelectedWorkspaceIds([]);
    setColumns([
      { name: 'Novo', color: '#3b82f6' },
      { name: 'Em andamento', color: '#f59e0b' },
      { name: 'Concluído', color: '#22c55e' },
    ]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Criar Pipeline</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Pipeline</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Vendas, Suporte, Leads..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o propósito deste pipeline..."
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
                        id={`ws-create-${ws.id}`}
                        checked={selectedWorkspaceIds.includes(ws.id)}
                        onCheckedChange={() => toggleWorkspace(ws.id)}
                      />
                      <Label htmlFor={`ws-create-${ws.id}`} className="cursor-pointer flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: ws.color }} />
                        {ws.name}
                      </Label>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-muted/50 text-sm">
                {(() => {
                  const ws = availableWorkspaces.find(w => selectedWorkspaceIds.includes(w.id));
                  if (ws) {
                    return (
                      <>
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: ws.color }} />
                        {ws.name}
                      </>
                    );
                  }
                  return <span className="text-muted-foreground">Workspace atual</span>;
                })()}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Colunas</Label>
              <Button type="button" variant="ghost" size="sm" onClick={handleAddColumn}>
                <Plus className="h-4 w-4 mr-1" />
                Adicionar
              </Button>
            </div>

            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {columns.map((column, index) => (
                <div 
                  key={index} 
                  className={`flex items-center gap-2 transition-opacity ${draggedIndex === index ? 'opacity-40' : ''}`}
                  draggable
                  onDragStart={() => setDraggedIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedIndex === null || draggedIndex === index) return;
                    const updated = [...columns];
                    const [moved] = updated.splice(draggedIndex, 1);
                    updated.splice(index, 0, moved);
                    setColumns(updated);
                    setDraggedIndex(null);
                  }}
                  onDragEnd={() => setDraggedIndex(null)}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing" />
                  <input
                    type="color"
                    value={column.color}
                    onChange={(e) => handleColumnChange(index, 'color', e.target.value)}
                    className="h-8 w-8 rounded cursor-pointer shrink-0"
                  />
                  <Input
                    value={column.name}
                    onChange={(e) => handleColumnChange(index, 'name', e.target.value)}
                    placeholder={`Coluna ${index + 1}`}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => handleRemoveColumn(index)}
                    disabled={columns.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={createPipeline.isPending || !name.trim() || columns.some(c => !c.name.trim())}
            >
              {createPipeline.isPending ? 'Criando...' : 'Criar Pipeline'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
