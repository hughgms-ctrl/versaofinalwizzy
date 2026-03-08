import { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  usePipelines,
  usePipelineColumns, 
  useUpdatePipeline, 
  useCreateColumn, 
  useUpdateColumn,
  useDeleteColumn 
} from '@/hooks/usePipelines';
import { useStageNotifications, useUpsertStageNotification } from '@/hooks/useStageHistory';
import { useProfiles } from '@/hooks/useConversations';
import { useAuth } from '@/hooks/useAuth';

interface PipelineSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline;
}

const DEFAULT_COLORS = [
  '#3b82f6', '#f59e0b', '#22c55e', '#8b5cf6', '#ef4444', '#64748b',
];

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
  const [nextPipelineId, setNextPipelineId] = useState<string>(pipeline.next_pipeline_id || 'none');
  const [nextPipelineColumnId, setNextPipelineColumnId] = useState<string>(pipeline.next_pipeline_column_id || 'first');
  const [deleteColumnId, setDeleteColumnId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'general' | 'notifications'>('general');

  const { data: columns = [] } = usePipelineColumns(pipeline.id);
  const { data: allPipelines = [] } = usePipelines();
  const { data: notifications = [] } = useStageNotifications(pipeline.id);
  const { data: profiles = [] } = useProfiles();
  const { profile } = useAuth();
  const updatePipeline = useUpdatePipeline();
  const createColumn = useCreateColumn();
  const updateColumn = useUpdateColumn();
  const deleteColumn = useDeleteColumn();
  const upsertNotification = useUpsertStageNotification();
  const { availableWorkspaces, isAdmin } = useWorkspaceContext();

  const otherPipelines = allPipelines.filter(p => p.id !== pipeline.id);

  useEffect(() => {
    setName(pipeline.name);
    setDescription(pipeline.description || '');
    setSelectedWorkspaceIds(pipeline.workspace_ids || []);
    setNextPipelineId(pipeline.next_pipeline_id || 'none');
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
    const nextPipelineChanged = (nextPipelineId === 'none' ? null : nextPipelineId) !== (pipeline.next_pipeline_id || null);
    return name !== pipeline.name || description !== (pipeline.description || '') || wsChanged || nextPipelineChanged;
  };

  const handleSave = async () => {
    if (hasChanges()) {
      await updatePipeline.mutateAsync({ 
        id: pipeline.id, 
        name, 
        description,
        workspace_ids: selectedWorkspaceIds,
        next_pipeline_id: nextPipelineId === 'none' ? null : nextPipelineId,
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

  const getNotificationForColumn = (columnId: string) => {
    return notifications.find((n: any) => n.column_id === columnId);
  };

  const handleToggleNotification = async (columnId: string, currentlyActive: boolean) => {
    if (!profile?.organization_id) return;
    const existing = getNotificationForColumn(columnId);
    await upsertNotification.mutateAsync({
      pipelineId: pipeline.id,
      columnId,
      notifyUserIds: existing?.notify_user_ids || [],
      messageTemplate: existing?.message_template || undefined,
      isActive: !currentlyActive,
      organizationId: profile.organization_id,
    });
  };

  const handleToggleUserNotification = async (columnId: string, userId: string) => {
    if (!profile?.organization_id) return;
    const existing = getNotificationForColumn(columnId);
    const currentUsers: string[] = existing?.notify_user_ids || [];
    const newUsers = currentUsers.includes(userId)
      ? currentUsers.filter(id => id !== userId)
      : [...currentUsers, userId];

    await upsertNotification.mutateAsync({
      pipelineId: pipeline.id,
      columnId,
      notifyUserIds: newUsers,
      messageTemplate: existing?.message_template || undefined,
      isActive: existing?.is_active ?? true,
      organizationId: profile.organization_id,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Configurar Pipeline</DialogTitle>
          </DialogHeader>

          {/* Section tabs */}
          <div className="flex gap-2 border-b border-border pb-2">
            <Button
              variant={activeSection === 'general' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveSection('general')}
            >
              Geral
            </Button>
            <Button
              variant={activeSection === 'notifications' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveSection('notifications')}
            >
              <Bell className="h-4 w-4 mr-1" />
              Notificações
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4">
            {activeSection === 'general' && (
              <>
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
                    <Label>Colunas (Estágios)</Label>
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

                {/* Next Pipeline (Auto-transition) */}
                <div className="space-y-2">
                  <Label>Ao concluir, enviar para:</Label>
                  <p className="text-xs text-muted-foreground">
                    Quando um lead chegar na última coluna, será transferido automaticamente para o pipeline selecionado.
                  </p>
                  <Select
                    value={nextPipelineId}
                    onValueChange={setNextPipelineId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar pipeline..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <span className="text-muted-foreground">Nenhum (sem transição)</span>
                      </SelectItem>
                      {otherPipelines.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {activeSection === 'notifications' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Configure notificações WhatsApp quando um lead entrar em um estágio específico.
                </p>

                {columns.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma coluna configurada.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {columns.map((col) => {
                      const notif = getNotificationForColumn(col.id);
                      const isActive = notif?.is_active ?? false;
                      const notifyUserIds: string[] = notif?.notify_user_ids || [];

                      return (
                        <div key={col.id} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: col.color }} 
                              />
                              <span className="text-sm font-medium">{col.name}</span>
                            </div>
                            <Switch
                              checked={isActive}
                              onCheckedChange={() => handleToggleNotification(col.id, isActive)}
                            />
                          </div>

                          {isActive && (
                            <div className="pl-5 space-y-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">Texto da notificação:</Label>
                                <Textarea
                                  value={notif?.message_template || '🔔 Lead *{nome}* entrou no estágio *{estagio}*'}
                                  onChange={(e) => {
                                    if (!profile?.organization_id) return;
                                    upsertNotification.mutate({
                                      pipelineId: pipeline.id,
                                      columnId: col.id,
                                      notifyUserIds: notifyUserIds,
                                      messageTemplate: e.target.value,
                                      isActive: true,
                                      organizationId: profile.organization_id,
                                    });
                                  }}
                                  rows={2}
                                  placeholder="🔔 Lead *{nome}* entrou no estágio *{estagio}*"
                                  className="text-sm"
                                />
                                <p className="text-[10px] text-muted-foreground">
                                  Use <code>{'{nome}'}</code> e <code>{'{estagio}'}</code> como variáveis.
                                </p>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">Notificar membros:</Label>
                                <div className="space-y-1">
                                  {profiles.map((p) => (
                                    <div key={p.user_id} className="flex items-center gap-2">
                                      <Checkbox
                                        id={`notif-${col.id}-${p.user_id}`}
                                        checked={notifyUserIds.includes(p.user_id)}
                                        onCheckedChange={() => handleToggleUserNotification(col.id, p.user_id)}
                                      />
                                      <Label 
                                        htmlFor={`notif-${col.id}-${p.user_id}`}
                                        className="text-sm cursor-pointer"
                                      >
                                        {p.full_name}
                                      </Label>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
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
