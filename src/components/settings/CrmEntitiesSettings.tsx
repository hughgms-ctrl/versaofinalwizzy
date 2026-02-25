import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Plus, Trash2, Edit2, Loader2, CheckSquare, Building2, Share2 } from 'lucide-react';
import {
  useConversationStatuses,
  useCreateConversationStatus,
  useUpdateConversationStatus,
  useDeleteConversationStatus,
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
  useLeadSources,
  useCreateLeadSource,
  useUpdateLeadSource,
  useDeleteLeadSource,
  ConversationStatus,
  Department,
  LeadSource,
} from '@/hooks/useCrmEntities';

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
];

interface EntityFormProps {
  entity?: { id: string; name: string; color: string };
  onSave: (data: { name: string; color: string }) => void;
  onCancel: () => void;
  isLoading: boolean;
  title: string;
}

function EntityForm({ entity, onSave, onCancel, isLoading, title }: EntityFormProps) {
  const [name, setName] = useState(entity?.name || '');
  const [color, setColor] = useState(entity?.color || '#6366f1');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), color });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Nome</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Nome do ${title.toLowerCase()}`}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label>Cor</Label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                color === c ? 'border-foreground scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading || !name.trim()}>
          {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {entity ? 'Salvar' : 'Criar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface EntityListProps<T extends { id: string; name: string; color: string; is_default?: boolean }> {
  entities: T[];
  isLoading: boolean;
  onCreate: (data: { name: string; color: string }) => void;
  onUpdate: (id: string, data: { name: string; color: string }) => void;
  onDelete: (id: string) => void;
  title: string;
  description: string;
  icon: React.ReactNode;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
}

function EntityList<T extends { id: string; name: string; color: string; is_default?: boolean }>({
  entities,
  isLoading,
  onCreate,
  onUpdate,
  onDelete,
  title,
  description,
  icon,
  isCreating,
  isUpdating,
  isDeleting,
}: EntityListProps<T>) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<T | null>(null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              {icon}
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo {title}</DialogTitle>
                <DialogDescription>
                  Adicione um novo {title.toLowerCase()} ao sistema.
                </DialogDescription>
              </DialogHeader>
              <EntityForm
                onSave={(data) => {
                  onCreate(data);
                  setIsCreateOpen(false);
                }}
                onCancel={() => setIsCreateOpen(false)}
                isLoading={isCreating}
                title={title}
              />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : entities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Nenhum {title.toLowerCase()} cadastrado.</p>
            <p className="text-sm mt-1">Clique em "Adicionar" para criar o primeiro.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entities.map((entity) => (
              <div
                key={entity.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: entity.color }}
                  />
                  <span className="font-medium">{entity.name}</span>
                  {entity.is_default && (
                    <Badge variant="secondary" className="text-xs">Padrão</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Dialog
                    open={editingEntity?.id === entity.id}
                    onOpenChange={(open) => !open && setEditingEntity(null)}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setEditingEntity(entity)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Editar {title}</DialogTitle>
                        <DialogDescription>
                          Atualize as informações do {title.toLowerCase()}.
                        </DialogDescription>
                      </DialogHeader>
                      <EntityForm
                        entity={entity}
                        onSave={(data) => {
                          onUpdate(entity.id, data);
                          setEditingEntity(null);
                        }}
                        onCancel={() => setEditingEntity(null)}
                        isLoading={isUpdating}
                        title={title}
                      />
                    </DialogContent>
                  </Dialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover {title}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. Conversas associadas a este{' '}
                          {title.toLowerCase()} ficarão sem classificação.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDelete(entity.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CrmEntitiesSettings() {
  // Status
  const { data: statuses = [], isLoading: statusesLoading } = useConversationStatuses();
  const createStatus = useCreateConversationStatus();
  const updateStatus = useUpdateConversationStatus();
  const deleteStatus = useDeleteConversationStatus();

  // Departments
  const { data: departments = [], isLoading: departmentsLoading } = useDepartments();
  const createDepartment = useCreateDepartment();
  const updateDepartment = useUpdateDepartment();
  const deleteDepartment = useDeleteDepartment();

  // Lead Sources
  const { data: leadSources = [], isLoading: leadSourcesLoading } = useLeadSources();
  const createLeadSource = useCreateLeadSource();
  const updateLeadSource = useUpdateLeadSource();
  const deleteLeadSource = useDeleteLeadSource();

  return (
    <Tabs defaultValue="statuses" className="space-y-4">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="statuses" className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4" />
          <span className="hidden sm:inline">Status</span>
        </TabsTrigger>
        <TabsTrigger value="departments" className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          <span className="hidden sm:inline">Departamentos</span>
        </TabsTrigger>
        <TabsTrigger value="sources" className="flex items-center gap-2">
          <Share2 className="h-4 w-4" />
          <span className="hidden sm:inline">Origens</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="statuses">
        <EntityList
          entities={statuses}
          isLoading={statusesLoading}
          onCreate={(data) => createStatus.mutate(data)}
          onUpdate={(id, data) => updateStatus.mutate({ id, data })}
          onDelete={(id) => deleteStatus.mutate(id)}
          title="Status"
          description="Defina os status de classificação das conversas (ex: Análise, Qualificado)"
          icon={<CheckSquare className="h-5 w-5 text-primary" />}
          isCreating={createStatus.isPending}
          isUpdating={updateStatus.isPending}
          isDeleting={deleteStatus.isPending}
        />
      </TabsContent>

      <TabsContent value="departments">
        <EntityList
          entities={departments}
          isLoading={departmentsLoading}
          onCreate={(data) => createDepartment.mutate(data)}
          onUpdate={(id, data) => updateDepartment.mutate({ id, data })}
          onDelete={(id) => deleteDepartment.mutate(id)}
          title="Departamento"
          description="Defina os departamentos da empresa (ex: Comercial, Jurídico, Suporte)"
          icon={<Building2 className="h-5 w-5 text-primary" />}
          isCreating={createDepartment.isPending}
          isUpdating={updateDepartment.isPending}
          isDeleting={deleteDepartment.isPending}
        />
      </TabsContent>

      <TabsContent value="sources">
        <EntityList
          entities={leadSources}
          isLoading={leadSourcesLoading}
          onCreate={(data) => createLeadSource.mutate(data)}
          onUpdate={(id, data) => updateLeadSource.mutate({ id, data })}
          onDelete={(id) => deleteLeadSource.mutate(id)}
          title="Origem"
          description="Defina as origens de leads (ex: Facebook Ads, Instagram, Indicação)"
          icon={<Share2 className="h-5 w-5 text-primary" />}
          isCreating={createLeadSource.isPending}
          isUpdating={updateLeadSource.isPending}
          isDeleting={deleteLeadSource.isPending}
        />
      </TabsContent>
    </Tabs>
  );
}
