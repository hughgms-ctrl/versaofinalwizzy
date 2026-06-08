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
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Check, Loader2, Plus, Search } from 'lucide-react';
import { useContacts } from '@/hooks/useContacts';
import { useCreateGroup } from '@/hooks/useWhatsAppGroups';

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateGroupDialog({ open, onOpenChange }: CreateGroupDialogProps) {
  const { data: contacts = [] } = useContacts();
  const createGroup = useCreateGroup();
  const [subject, setSubject] = useState('');
  const [search, setSearch] = useState('');
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setSubject('');
      setSearch('');
      setSelectedPhones([]);
    }
  }, [open]);

  const filtered = contacts.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (c.name?.toLowerCase().includes(q) || c.phone.includes(q));
  });

  const toggle = (phone: string) => {
    setSelectedPhones(prev => (prev.includes(phone) ? prev.filter(p => p !== phone) : [...prev, phone]));
  };

  const handleCreate = async () => {
    if (!subject.trim() || selectedPhones.length === 0) return;
    try {
      await createGroup.mutateAsync({
        subject: subject.trim(),
        participants: selectedPhones,
      });
      onOpenChange(false);
    } catch {
      // toast handled by hook
    }
  };

  const canCreate = subject.trim() && selectedPhones.length > 0 && !createGroup.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Criar grupo</DialogTitle>
          <DialogDescription>Defina o nome e escolha os participantes a partir dos contatos.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="new-group-subject">Nome do grupo</Label>
            <Input
              id="new-group-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex: Equipe de Vendas"
            />
          </div>

          <div className="space-y-2">
            <Label>Participantes ({selectedPhones.length} selecionado(s))</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contato..."
                className="pl-8 h-9"
              />
            </div>
            <ScrollArea className="h-48 rounded-md border border-border">
              <div className="divide-y divide-border">
                {filtered.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum contato.</p>
                )}
                {filtered.map(contact => {
                  const checked = selectedPhones.includes(contact.phone);
                  return (
                    <button
                      type="button"
                      key={contact.id}
                      onClick={() => toggle(contact.phone)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-muted/40"
                    >
                      <span className={cn(
                        'h-4 w-4 rounded border flex items-center justify-center flex-shrink-0',
                        checked ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40'
                      )}>
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate">{contact.name || contact.phone}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{contact.phone}</span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={!canCreate} className="gap-2">
            {createGroup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar grupo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
