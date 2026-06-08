import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Send, Users, Pencil, ShieldCheck } from 'lucide-react';
import { WhatsAppGroup } from '@/hooks/useWhatsAppGroups';

interface GroupListItemProps {
  group: WhatsAppGroup;
  onSend: (group: WhatsAppGroup) => void;
  onParticipants: (group: WhatsAppGroup) => void;
  onEdit: (group: WhatsAppGroup) => void;
}

export function GroupListItem({ group, onSend, onParticipants, onEdit }: GroupListItemProps) {
  const initials = (group.name || 'G').slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors">
      <Avatar className="h-10 w-10">
        <AvatarImage src={group.picture_url || undefined} />
        <AvatarFallback className="bg-emerald-500/15 text-emerald-600">{initials}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{group.name || group.group_jid}</p>
          {group.is_admin && (
            <Badge variant="secondary" className="h-5 gap-1 text-[10px]">
              <ShieldCheck className="h-3 w-3" /> Admin
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {group.participant_count} participante(s)
        </p>
      </div>

      <Button variant="ghost" size="sm" className="gap-1.5 h-8" onClick={() => onSend(group)}>
        <Send className="h-3.5 w-3.5" /> Enviar
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onSend(group)}>
            <Send className="h-4 w-4 mr-2" /> Enviar mensagem
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onParticipants(group)}>
            <Users className="h-4 w-4 mr-2" /> Participantes
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(group)}>
            <Pencil className="h-4 w-4 mr-2" /> Editar grupo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
