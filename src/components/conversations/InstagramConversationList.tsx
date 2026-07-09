import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Instagram } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { InstagramConversationRow } from '@/hooks/useInstagramConversations';

interface InstagramConversationListProps {
  conversations: InstagramConversationRow[];
  selectedId?: string;
  onSelect: (conversation: InstagramConversationRow) => void;
}

export function InstagramConversationList({ conversations, selectedId, onSelect }: InstagramConversationListProps) {
  return (
    <div className="divide-y divide-border">
      {conversations.map((conversation) => {
        const contact = conversation.contact;
        const displayName = contact?.name || (contact?.username ? `@${contact.username}` : 'Instagram');
        return (
          <button
            key={conversation.id}
            onClick={() => onSelect(conversation)}
            className={cn(
              'w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors',
              selectedId === conversation.id && 'bg-muted',
            )}
          >
            <div className="relative flex-shrink-0">
              <Avatar className="h-10 w-10">
                <AvatarImage src={contact?.profile_pic_url || undefined} />
                <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-background">
                <Instagram className="h-3.5 w-3.5 text-pink-500" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm truncate">{displayName}</p>
                {conversation.last_message_at && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: false, locale: ptBR })}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className="text-xs text-muted-foreground truncate">
                  {conversation.last_message_direction === 'outbound' ? 'Você: ' : ''}
                  @{contact?.username || contact?.igsid}
                </p>
                {conversation.unread_count > 0 && (
                  <Badge className="h-5 min-w-5 flex items-center justify-center px-1.5">
                    {conversation.unread_count}
                  </Badge>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
