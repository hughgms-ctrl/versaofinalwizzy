import { useState } from 'react';
import { useTags, useCreateTag, useUpdateTag, useDeleteTag, Tag } from '@/hooks/useTags';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Pencil, Trash2, Tag as TagIcon, X, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from '@/components/ui/alert-dialog';

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6b7280', // gray
];

export function TagsSettings() {
  const { data: tags, isLoading } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const { selectedWorkspaceId, availableWorkspaces } = useWorkspaceContext();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    color: '#6366f1',
    description: '',
    workspace_id: '' as string,
  });

  const resetForm = () => {
    setFormData({ name: '', color: '#6366f1', description: '', workspace_id: selectedWorkspaceId || '' });
    setEditingTag(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (tag: Tag) => {
    setEditingTag(tag);
    setFormData({
      name: tag.name,
      color: tag.color,
      description: tag.description || '',
      workspace_id: tag.workspace_id || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;
    
    if (editingTag) {
      await updateTag.mutateAsync({
        id: editingTag.id,
        name: formData.name,
        color: formData.color,
        description: formData.description,
        workspace_id: formData.workspace_id || null,
      });
    } else {
      await createTag.mutateAsync({
        ...formData,
        workspace_id: formData.workspace_id || null,
      });
    }
    
    setIsDialogOpen(false);
    resetForm();
  };

  const handleDelete = async () => {
    if (!tagToDelete) return;
    await deleteTag.mutateAsync(tagToDelete.id);
    setDeleteDialogOpen(false);
    setTagToDelete(null);
  };

  const confirmDelete = (tag: Tag) => {
    setTagToDelete(tag);
    setDeleteDialogOpen(true);
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <TagIcon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-foreground">Tags</CardTitle>
              <CardDescription>
                Gerencie as tags para categorizar seus contatos
              </CardDescription>
            </div>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Tag
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !tags || tags.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <TagIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma tag criada ainda</p>
            <p className="text-sm mt-1">Crie tags para organizar seus contatos</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <div>
                    <p className="font-medium text-foreground">{tag.name}</p>
                    {tag.description && (
                      <p className="text-xs text-muted-foreground">{tag.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEditDialog(tag)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => confirmDelete(tag)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTag ? 'Editar Tag' : 'Nova Tag'}</DialogTitle>
            <DialogDescription>
              {editingTag
                ? 'Atualize as informações da tag'
                : 'Crie uma nova tag para categorizar seus contatos'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                placeholder="Ex: Cliente VIP"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Input
                id="description"
                placeholder="Ex: Clientes com alto valor de compra"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="h-8 w-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData({ ...formData, color })}
                  >
                    {formData.color === color && (
                      <Check className="h-4 w-4 text-white" />
                    )}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
              <span className="text-sm text-muted-foreground">Preview:</span>
              <Badge
                style={{ 
                  backgroundColor: `${formData.color}20`,
                  color: formData.color,
                  borderColor: `${formData.color}40`,
                }}
                className="border"
              >
                {formData.name || 'Tag'}
              </Badge>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.name.trim() || createTag.isPending || updateTag.isPending}
            >
              {(createTag.isPending || updateTag.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingTag ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tag?</AlertDialogTitle>
            <AlertDialogDescription>
              A tag "{tagToDelete?.name}" será removida de todos os contatos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTag.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
