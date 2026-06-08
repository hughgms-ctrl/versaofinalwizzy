import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, MoreVertical, UserPlus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { WhatsAppGroup, useUpdateParticipants } from '@/hooks/useWhatsAppGroups';

interface GroupParticipantsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: WhatsAppGroup | null;
}

function jidToNumber(jid: string): string {
  return jid.split('@')[0] || jid;
}

export function GroupParticipantsDialog({ open, onOpenChange, group }: GroupParticipantsDialogProps) {
  const [newNumber, setNewNumber] = useState('');
  const updateParticipants = useUpdateParticipants();

  if (!group) return null;

  const participants = group.participants || [];

  const run = async (
    participantAction: 'add' | 'remove' | 'promote' | 'demote',
    participantsList: string[],
  ) => {
    await updateParticipants.mutateAsync({
      groupJid: group.group_jid,
      participantAction,
      participants: participantsList,
    });
  };

  const handleAdd = async () => {
    const digits = newNumber.replace(/\D/g, '');
    if (digits.length < 10) return;
    await run('add', [digits]);
    setNewNumber('');
  };

  const isAdminGroup = group.is_admin;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Participantes — {group.name || group.group_jid}</DialogTitle>
          <DialogDescription>
            {isAdminGroup
              ? 'Adicione, remova ou altere a função dos participantes.'
              : 'A instância não é admin deste grupo; as ações podem falhar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2">
          <Input
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value.replace(/[^\d+\s]/g, ''))}
            placeholder="Número com DDD para adicionar"
            className="h-9"
          />
          <Button
            onClick={handleAdd}
            disabled={newNumber.replace(/\D/g, '').length < 10 || updateParticipants.isPending}
            className="gap-1.5 h-9"
          >
            {updateParticipants.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Adicionar
          </Button>
        </div>

        <ScrollArea className="h-64 rounded-md border border-border">
          <div className="divide-y divide-border">
            {participants.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhum participante sincronizado.
              </p>
            )}
            {participants.map((p) => (
              <div key={p.jid} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 text-sm truncate">{jidToNumber(p.jid)}</span>
                {p.isAdmin && <Badge variant="secondary" className="text-[10px]">Admin</Badge>}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {p.isAdmin ? (
                      <DropdownMenuItem onClick={() => run('demote', [p.jid])}>
                        <ArrowDown className="h-4 w-4 mr-2" /> Rebaixar
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => run('promote', [p.jid])}>
                        <ArrowUp className="h-4 w-4 mr-2" /> Promover a admin
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => run('remove', [p.jid])} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" /> Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
