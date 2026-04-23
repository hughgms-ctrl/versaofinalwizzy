import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import {
  WorkspaceTemplate,
  useUpdateWorkspaceTemplate,
  useCreateWorkspaceTemplateScratch,
} from '@/hooks/useWorkspaceTemplates';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

interface TemplateEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: WorkspaceTemplate | null;
}

export function TemplateEditorDialog({ open, onOpenChange, template }: TemplateEditorDialogProps) {
  const { availableWorkspaces, selectedWorkspaceId } = useWorkspaceContext();
  const isNew = !template;

  const [workspaceId, setWorkspaceId] = useState<string | null>(template?.workspace_id || selectedWorkspaceId);
  const [name, setName] = useState(template?.name || '');
  const [icon, setIcon] = useState(template?.icon || '📦');
  const [color, setColor] = useState(template?.color || '#3b82f6');
  const [description, setDescription] = useState(template?.description || '');
  const [masterPrompt, setMasterPrompt] = useState(template?.master_prompt || '');

  useEffect(() => {
    if (open) {
      setWorkspaceId(template?.workspace_id || selectedWorkspaceId);
      setName(template?.name || '');
      setIcon(template?.icon || '📦');
      setColor(template?.color || '#3b82f6');
      setDescription(template?.description || '');
      setMasterPrompt(template?.master_prompt || '');
    }
  }, [open, template, selectedWorkspaceId]);

  const create = useCreateWorkspaceTemplateScratch();
  const update = useUpdateWorkspaceTemplate();
  const pending = create.isPending || update.isPending;

  const handleSave = async () => {
    if (!name.trim()) return;
    if (isNew) {
      if (!workspaceId) return;
      await create.mutateAsync({
        workspace_id: workspaceId,
        name: name.trim(),
        icon, color, description: description || null,
        master_prompt: masterPrompt || null,
      });
    } else {
      await update.mutateAsync({
        id: template!.id,
        name: name.trim(),
        icon, color, description: description || null,
        master_prompt: masterPrompt || null,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? 'Criar template do zero' : 'Editar template'}</DialogTitle>
          <DialogDescription>
            Edita identidade e master prompt. Para mudar agentes/fluxos, use "Salvar workspace como template" depois de ajustar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {isNew && (
            <div>
              <Label>Workspace</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                value={workspaceId || ''}
                onChange={(e) => setWorkspaceId(e.target.value || null)}
              >
                <option value="">Selecione</option>
                {availableWorkspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Ícone</Label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Descrição</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label>Cor</Label>
              <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Master prompt</Label>
            <Textarea rows={4} value={masterPrompt} onChange={(e) => setMasterPrompt(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || pending}>
            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
