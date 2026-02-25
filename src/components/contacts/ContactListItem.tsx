import { Contact } from '@/hooks/useContacts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ContactListItemProps {
  contact: Contact;
  onSelect: (contact: Contact) => void;
}

const getInitials = (name: string | null, phone: string) => {
  if (name) {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  }
  return phone.slice(-2);
};

const formatPhoneNumber = (phone: string) => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 13) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  if (cleaned.length === 12) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
  }
  return phone;
};

export function ContactListItem({ contact, onSelect }: ContactListItemProps) {
  const hasName = !!contact.name;
  const formattedPhone = formatPhoneNumber(contact.phone);
  const metadata = contact.metadata as { note?: string } | null;
  const note = metadata?.note;

  return (
    <div
      onClick={() => onSelect(contact)}
      className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer transition-colors group"
    >
      {/* Avatar - Smaller */}
      <Avatar className="h-9 w-9 flex-shrink-0">
        <AvatarImage src={contact.avatar_url || undefined} />
        <AvatarFallback className="bg-gradient-to-br from-primary/20 to-purple-500/20 text-primary text-xs font-semibold">
          {getInitials(contact.name, contact.phone)}
        </AvatarFallback>
      </Avatar>

      {/* Content - Compact */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {/* Name or Phone as primary */}
          <span className="font-medium text-sm text-foreground truncate">
            {contact.name || formattedPhone}
          </span>
          {/* Quick Note Badge */}
          {note && (
            <span 
              className="text-[9px] px-1 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded truncate max-w-[80px] flex-shrink-0"
              title={note}
            >
              {note}
            </span>
          )}
        </div>
        
        {/* Phone (if has name) + Tags inline */}
        <div className="flex items-center gap-1.5 mt-0.5">
          {hasName && (
            <span className="text-[10px] text-muted-foreground truncate">
              {formattedPhone}
            </span>
          )}
          {/* Tags - Show max 2 */}
          {contact.tags && contact.tags.length > 0 && (
            <>
              {hasName && <span className="text-muted-foreground text-[10px]">•</span>}
              {contact.tags.slice(0, 2).map(({ tag }) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="text-[9px] px-1 py-0 h-4"
                  style={{ 
                    backgroundColor: `${tag.color}20`,
                    color: tag.color,
                  }}
                >
                  {tag.name}
                </Badge>
              ))}
              {contact.tags.length > 2 && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                  +{contact.tags.length - 2}
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right side - Date + Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Date */}
        <span className="hidden sm:inline text-[10px] text-muted-foreground">
          {format(parseISO(contact.created_at), "dd/MM/yy", { locale: ptBR })}
        </span>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-50 bg-popover">
            <DropdownMenuItem onClick={e => {
              e.stopPropagation();
              onSelect(contact);
            }}>
              Ver detalhes
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/conversations" className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5" />
                Ver conversa
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
