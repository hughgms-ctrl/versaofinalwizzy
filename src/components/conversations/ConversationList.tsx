import { DbConversation, useProfiles } from '@/hooks/useConversations';
import { useContactTags, useTags } from '@/hooks/useTags';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConversationCardActions } from './ConversationCardActions';

interface ConversationListProps {
  conversations: DbConversation[];
  selectedId?: string;
  onSelect: (conversation: DbConversation) => void;
  onSpyView?: (conversation: DbConversation) => void;
}

export function ConversationList({ conversations, selectedId, onSelect, onSpyView }: ConversationListProps) {
  const { data: profiles } = useProfiles();

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

  return (
    <div className="flex flex-col h-full">
      {/* List */}
      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        {conversations.map((conversation) => {
          const isSelected = selectedId === conversation.id;
          const hasName = !!conversation.contact?.name;
          const contactName = conversation.contact?.name;
          const contactPhone = conversation.contact?.phone || '';
          const formattedPhone = formatPhoneNumber(contactPhone);
          const hasUnread = conversation.unread_count > 0 && !isSelected;
          const lastMessage = conversation.last_message?.[0];
          const isAIActive = lastMessage?.is_from_bot;

          const getLastMessagePreview = () => {
            if (!lastMessage) return null;
            if (lastMessage.type !== 'text') {
              const typeLabels: Record<string, string> = {
                image: '📷 Imagem',
                audio: '🎵 Áudio',
                video: '🎥 Vídeo',
                document: '📄 Documento',
                sticker: '😀 Sticker',
                location: '📍 Localização',
              };
              return typeLabels[lastMessage.type] || '📎 Mídia';
            }
            return lastMessage.content;
          };
          const messagePreview = getLastMessagePreview();

          return (
            <div
              key={conversation.id}
              onClick={() => onSelect(conversation)}
              className={cn(
                "conversation-item border-b border-border/50",
                isSelected && "active",
                hasUnread && "bg-primary/5"
              )}
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                  {conversation.contact?.avatar_url ? (
                    <img
                      src={conversation.contact.avatar_url}
                      alt={contactName || contactPhone}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-primary">
                      {getInitials(contactName || null, contactPhone)}
                    </span>
                  )}
                </div>
                <div className={cn(
                  "absolute -bottom-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center ring-2 ring-background",
                  isAIActive ? "bg-primary" : "bg-green-500"
                )}>
                  {isAIActive ? (
                    <Bot className="h-3 w-3 text-primary-foreground" />
                  ) : (
                    <MessageCircle className="h-3 w-3 text-white" />
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {(() => {
                      const metadata = conversation.contact?.metadata as { note?: string } | null;
                      const note = metadata?.note;

                      if (note) {
                        return (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center min-w-0">
                              <span
                                className="text-xs font-semibold px-2 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-400 rounded truncate max-w-full"
                                title={note}
                              >
                                {note}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className={cn(
                                "text-[11px] truncate",
                                hasUnread ? "font-bold text-foreground" : "font-medium text-muted-foreground"
                              )}>
                                {hasName ? contactName : formattedPhone}
                              </p>
                              {hasName && (
                                <p className="text-[10px] text-muted-foreground/70 truncate flex-shrink-0">
                                  • {formattedPhone}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center min-w-0">
                            {hasName ? (
                              <p className={cn(
                                "text-sm truncate",
                                hasUnread ? "font-bold text-foreground" : "font-semibold text-foreground"
                              )}>
                                {contactName}
                              </p>
                            ) : (
                              <p className={cn(
                                "text-sm truncate",
                                hasUnread ? "font-bold text-foreground" : "font-semibold text-foreground"
                              )}>
                                {formattedPhone}
                              </p>
                            )}
                          </div>
                          {hasName && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {formattedPhone}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {conversation.last_message_at && (
                      <span className={cn(
                        "text-xs",
                        hasUnread ? "text-primary font-medium" : "text-muted-foreground"
                      )}>
                        {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: false, locale: ptBR })}
                      </span>
                    )}
                    {hasUnread && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                        {conversation.unread_count}
                      </span>
                    )}
                    <ConversationCardActions
                      conversation={conversation}
                      variant="minimal"
                      onSpyView={onSpyView ? () => onSpyView(conversation) : undefined}
                    />
                  </div>
                </div>

                {/* Last message preview + status */}
                <div className="flex items-center gap-1 mt-1">
                  {/* Status checkmarks for outbound messages */}
                  {lastMessage?.direction === 'outbound' && (
                    <span className="flex-shrink-0 flex items-center">
                      {lastMessage.read_at ? (
                        // Read - double blue checkmark
                        <span className="text-blue-500 text-xs">✓✓</span>
                      ) : lastMessage.delivered_at ? (
                        // Delivered - double gray checkmark
                        <span className="text-muted-foreground text-xs">✓✓</span>
                      ) : (
                        // Sent - single gray checkmark
                        <span className="text-muted-foreground text-xs">✓</span>
                      )}
                    </span>
                  )}
                  {messagePreview ? (
                    <p className={cn(
                      "text-xs truncate flex-1",
                      hasUnread ? "text-foreground font-medium" : "text-muted-foreground"
                    )}>
                      {messagePreview}
                    </p>
                  ) : (
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-medium",
                        conversation.status === 'open' && "bg-green-500/10 text-green-500",
                        conversation.status === 'pending' && "bg-yellow-500/10 text-yellow-500",
                        conversation.status === 'resolved' && "bg-blue-500/10 text-blue-500",
                        conversation.status === 'archived' && "bg-muted text-muted-foreground"
                      )}
                    >
                      {conversation.status === 'open' && 'Aberto'}
                      {conversation.status === 'pending' && 'Pendente'}
                      {conversation.status === 'resolved' && 'Resolvido'}
                      {conversation.status === 'archived' && 'Arquivado'}
                    </span>
                  )}
                </div>

                {/* Contact Tags */}
                {conversation.contact?.id && (
                  <ContactTagsDisplay contactId={conversation.contact.id} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Separate component for contact tags to avoid prop drilling
function ContactTagsDisplay({ contactId }: { contactId: string }) {
  const { data: contactTags } = useContactTags(contactId);
  const { data: allTags } = useTags();

  if (!contactTags?.length || !allTags) return null;

  const tagDetails = contactTags
    .map((ct: { tag_id: string }) => allTags.find((t: { id: string }) => t.id === ct.tag_id))
    .filter(Boolean)
    .slice(0, 3);

  if (!tagDetails.length) return null;

  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap">
      {tagDetails.map((tag: { id: string; name: string; color: string }) => (
        <span
          key={tag.id}
          className="text-[10px] px-1.5 py-0.5 rounded-full"
          style={{
            backgroundColor: `${tag.color}20`,
            color: tag.color,
          }}
        >
          {tag.name}
        </span>
      ))}
      {contactTags.length > 3 && (
        <span className="text-[10px] text-muted-foreground">
          +{contactTags.length - 3}
        </span>
      )}
    </div>
  );
}
