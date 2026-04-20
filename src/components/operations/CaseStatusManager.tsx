import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, GripVertical, Copy, Check, Lock } from 'lucide-react';
import { useCaseStatuses, useCaseCategories } from '@/hooks/useOperationsCases';
import {
  useCreateCaseStatus,
  useUpdateCaseStatus,
  useDeleteCaseStatus,
  useReorderCaseStatuses,
  useCloneStatusesFromCategory,
} from '@/hooks/useCaseStatusMutations';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

const PRESET_COLORS = [
  '#94a3b8', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#6366f1',
];

export function CaseStatusManager() {
  const { data: categories = [] } = useCaseCategories();
  // 'global' = NULL category (status compartilhado entre todas)
  const [selectedCat, setSelectedCat] = useState<string>('global');
  const catId = selectedCat === 'global' ? null : selectedCat;
  const { data: statuses = [], isLoading } = useCaseStatuses(catId || undefined);

  // Filtra apenas os da categoria atual (sem misturar globais quando uma categoria está selecionada)
  const visibleStatuses = useMemo(
    () =>
      [...statuses]
        .filter((s: any) => (catId ? s.category_id === catId : !s.category_id))
        .sort((a: any, b: any) => a.order - b.order),
    [statuses, catId]
  );

  const create = useCreateCaseStatus();
  const update = useUpdateCaseStatus();
  const del = useDeleteCaseStatus();
  const reorder = useReorderCaseStatuses();
  const clone = useCloneStatusesFromCategory();

  const [newName, setNewName] = useState('');
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneFrom, setCloneFrom] = useState<string>('global');

  const handleCreate = () => {
    if (!newName.trim()) return;
    create.mutate(
      {
        name: newName.trim(),
        category_id: catId,
        order: visibleStatuses.length,
      },
      { onSuccess: () => setNewName('') }
    );
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(visibleStatuses);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    reorder.mutate(items.map((it: any, idx: number) => ({ id: it.id, order: idx })));
  };

  const handleClone = () => {
    const from = cloneFrom === 'global' ? null : cloneFrom;
    if (from === catId) return;
    clone.mutate(
      { from_category_id: from, to_category_id: catId },
      { onSuccess: () => setCloneOpen(false) }
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="flex-1 min-w-[220px]">
            <Label className="text-xs text-muted-foreground">Aplicar colunas a</Label>
            <select
              className="flex h-10 w-full rounded-md border bg-background px-3 text-sm mt-1"
              value={selectedCat}
              onChange={(e) => setSelectedCat(e.target.value)}
            >
              <option value="global">🌐 Global (todas as categorias)</option>
              <optgroup label="Judicial">
                {categories.filter((c: any) => c.kind === 'judicial').map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
              <optgroup label="Administrativo">
                {categories.filter((c: any) => c.kind === 'administrative').map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCloneOpen(true)}>
            <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar de outra categoria
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          {catId
            ? 'Estas colunas aparecerão apenas no operacional quando esta categoria estiver selecionada.'
            : 'Colunas globais aparecem para todos os tipos de caso quando nenhuma categoria específica é filtrada.'}
        </p>

        <div className="flex gap-2 mb-4">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ex: Em análise, Protocolado..."
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <Button onClick={handleCreate} disabled={!newName.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
        ) : visibleStatuses.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-border/60 rounded-lg">
            <p className="text-sm text-muted-foreground">Nenhuma coluna criada para esta categoria.</p>
            <p className="text-xs text-muted-foreground mt-1">Adicione uma acima ou copie de outra.</p>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="statuses">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                  {visibleStatuses.map((s: any, idx: number) => (
                    <Draggable key={s.id} draggableId={s.id} index={idx}>
                      {(p, snap) => (
                        <div
                          ref={p.innerRef}
                          {...p.draggableProps}
                          className={cn(
                            'rounded-lg border bg-card transition-shadow',
                            snap.isDragging && 'shadow-lg'
                          )}
                        >
                          <StatusRow
                            status={s}
                            dragHandleProps={p.dragHandleProps}
                            onUpdate={(patch) => update.mutate({ id: s.id, ...patch })}
                            onDelete={() => del.mutate(s.id)}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </Card>

      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copiar colunas</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              As colunas selecionadas serão copiadas para a categoria atual ({catId ? categories.find((c: any) => c.id === catId)?.name : 'Global'}).
            </p>
            <div>
              <Label>Copiar de</Label>
              <select
                className="flex h-10 w-full rounded-md border bg-background px-3 text-sm mt-1"
                value={cloneFrom}
                onChange={(e) => setCloneFrom(e.target.value)}
              >
                <option value="global">🌐 Global</option>
                {categories.map((c: any) => (
                  <option key={c.id} value={c.id} disabled={c.id === catId}>
                    {c.name} ({c.kind === 'judicial' ? 'Judicial' : 'Adm.'})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneOpen(false)}>Cancelar</Button>
            <Button onClick={handleClone}>Copiar colunas</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusRow({
  status,
  dragHandleProps,
  onUpdate,
  onDelete,
}: {
  status: any;
  dragHandleProps: any;
  onUpdate: (patch: any) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(status.name);
  const [showColors, setShowColors] = useState(false);

  const commitName = () => {
    if (name.trim() && name !== status.name) onUpdate({ name: name.trim() });
  };

  return (
    <div className="flex items-center gap-3 p-3">
      <button {...dragHandleProps} className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Color picker */}
      <div className="relative">
        <button
          onClick={() => setShowColors(!showColors)}
          className="h-7 w-7 rounded-full border-2 border-border shadow-sm hover:scale-110 transition-transform"
          style={{ backgroundColor: status.color }}
          aria-label="Mudar cor"
        />
        {showColors && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowColors(false)} />
            <div className="absolute top-9 left-0 z-20 grid grid-cols-5 gap-1.5 p-2 rounded-lg border bg-popover shadow-md">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    onUpdate({ color: c });
                    setShowColors(false);
                  }}
                  className="h-6 w-6 rounded-full border border-border/50 hover:scale-110 transition-transform relative"
                  style={{ backgroundColor: c }}
                >
                  {status.color === c && <Check className="h-3 w-3 text-white absolute inset-0 m-auto" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="flex-1 h-8 border-transparent hover:border-border focus:border-border bg-transparent"
      />

      <div className="flex items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Switch
            checked={status.is_default}
            onCheckedChange={(v) => onUpdate({ is_default: v })}
          />
          <span className="text-muted-foreground">Padrão</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Switch
            checked={status.is_closed}
            onCheckedChange={(v) => onUpdate({ is_closed: v })}
          />
          <span className="text-muted-foreground inline-flex items-center gap-1">
            <Lock className="h-3 w-3" /> Fecha caso
          </span>
        </label>
      </div>

      <Button size="icon" variant="ghost" onClick={onDelete} className="h-7 w-7 text-muted-foreground hover:text-destructive">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
