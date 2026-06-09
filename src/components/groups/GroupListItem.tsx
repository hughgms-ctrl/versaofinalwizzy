import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WhatsAppGroup } from '@/hooks/useWhatsAppGroups';

interface GroupListItemProps {
  group: WhatsAppGroup;
  selected?: boolean;
  onSelect: (group: WhatsAppGroup) => void;
}

export function GroupListItem({ group, selected, onSelect }: GroupListItemProps) {
  const initials = (group.name || 'G').slice(0, 2).toUpperCase();

  return (
    <div
      onClick={() => onSelect(group)}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors',
        selected ? 'bg-primary/10' : 'hover:bg-accent/30'
      )}
    >
      <Avatar className="h-10 w-10">
        <AvatarImage src={group.picture_url || undefined} />
        <AvatarFallback className="bg-emerald-500/15 text-emerald-600">{initials}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{group.name || group.group_jid}</p>
          {group.is_admin && (
            <Badge variant="secondary" className="h-5 gap-1 text-[10px] flex-shrink-0">
              <ShieldCheck className="h-3 w-3" /> Admin
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {group.participant_count} participante(s)
        </p>
      </div>
    </div>
  );
}
