import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save } from 'lucide-react';
import { WhatsAppGroup, useUpdateGroup } from '@/hooks/useWhatsAppGroups';

interface EditGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: WhatsAppGroup | null;
}

export function EditGroupDialog({ open, onOpenChange, group }: EditGroupDialogProps) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const updateGroup = useUpdateGroup();

  useEffect(() => {
    if (open && group) {
      setSubject(group.name || '');
      setDescription(group.description || '');
      setImage('');
    }
  }, [open, group]);

  if (!group) return null;

  const handleSave = async () => {
    const payload: { groupJid: string; subject?: string; description?: string; image?: string } = {
      groupJid: group.group_jid,
    };
    if (subject !== (group.name || '')) payload.subject = subject;
    if (description !== (group.description || '')) payload.description = description;
    if (image.trim()) payload.image = image.trim();

    try {
      await updateGroup.mutateAsync(payload);
      onOpenChange(false);
    } catch {
      // toast handled by hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Editar grupo</DialogTitle>
          <DialogDescription>Atualize o nome, a descrição e a foto do grupo.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="group-subject">Nome</Label>
            <Input id="group-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-desc">Descrição</Label>
            <Textarea
              id="group-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[70px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-image">URL da foto (opcional)</Label>
            <Input
              id="group-image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://.../foto.jpg"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={updateGroup.isPending} className="gap-2">
            {updateGroup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
