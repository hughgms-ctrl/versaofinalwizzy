import { DbConversation, useProfiles } from '@/hooks/useConversations';
import { useContactTags, useTags } from '@/hooks/useTags';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useFollowUpStatus } from '@/hooks/useFollowUpStatus';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot, MessageCircle, Check, CheckCheck, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { highlightTerm } from '@/lib/highlightTerm';
import { ConversationCardActions } from './ConversationCardActions';

interface ConversationListProps {
  conversations: DbConversation[];
  selectedId?: string;
  onSelect: (conversation: DbConversation) => void;
  onSpyView?: (conversation: DbConversation) => void;
  searchQuery?: string;
  messageSnippets?: Map<string, string>;
}

export function ConversationList({ conversations, selectedId, onSelect, onSpyView, searchQuery, messageSnippets }: ConversationListProps) {
  const { data: profiles } = useProfiles();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: followUpMap = {} } = useFollowUpStatus();
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

  const stripMarkdown = (text: string | null) => {
    if (!text) return null;
    return text.replace(/[*_~`]/g, '');
  };

  return (
    <div className="flex flex-col h-full">
      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2" style={{ WebkitOverflowScrolling: 'touch' }}>
        {conversations.map((conversation) => {
          const isSelected = selectedId === conversation.id;
          const hasName = !!conversation.contact?.name;
          const contactName = conversation.contact?.name;
          const contactPhone = conversation.contact?.phone || '';
          const formattedPhone = formatPhoneNumber(contactPhone);
          const hasUnread = conversation.unread_count > 0 && !isSelected;
          const lastMessage = conversation.last_message?.[0];
          const isAIActive = lastMessage?.is_from_bot;
          const isInFollowUp = !!followUpMap[conversation.id];
          const followUpStep = followUpMap[conversation.id]?.step;
          const searchSnippet = searchQuery && searchQuery.trim().length >= 2 ? messageSnippets?.get(conversation.id) : undefined;
          const highlightedSnippet = searchSnippet ? highlightTerm(stripMarkdown(searchSnippet), searchQuery || '') : null;
          const messagePreview = (() => {
            if (searchSnippet) return null; // handled separately
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
            return stripMarkdown(lastMessage.content);
          })();

          // Real presence logic using contact_presence table
          const presenceData = conversation.contact?.contact_presence;
          const presence = Array.isArray(presenceData) ? presenceData[0] : presenceData;
          const isActive = presence ? new Date(presence.expires_at) > new Date() : false;
          const isOnline = isActive && presence?.presence_type !== 'offline';
          const isTyping = isActive && presence?.presence_type === 'typing';
          const isRecording = isActive && presence?.presence_type === 'recording';

          const contactWorkspaceId = (conversation as any).workspace_id || (conversation.contact as any)?.workspace_id;
          const workspace = contactWorkspaceId ? workspaces.find(w => w.id === contactWorkspaceId) : null;

          return (
            <div
              key={conversation.id}
              onClick={() => onSelect(conversation)}
              className={cn(
                "pipeline-card !cursor-pointer transition-all duration-200 relative overflow-hidden",
                isSelected ? "bg-primary/10 border-primary/30 shadow-sm" : "hover:bg-accent/30",
                hasUnread && "bg-primary/5"
              )}
            >
              {/* Workspace Color Bar */}
              {workspace && (
                <div
                  className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full"
                  style={{ backgroundColor: workspace.color }}
                  title={workspace.name}
                />
              )}
              {/* Selection Indicator Bar */}
              {isSelected && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full" />
              )}
              <div className="flex items-start gap-2">
                {/* Avatar with indicator */}
                <div className="relative flex-shrink-0">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center relative">
                    {conversation.contact?.avatar_url ? (
                      <img
                        src={conversation.contact.avatar_url}
                        alt={contactName || contactPhone}
                        className="h-10 w-10 rounded-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <span className={cn("text-xs font-semibold text-primary", conversation.contact?.avatar_url && "hidden")}>
                      {getInitials(contactName || null, contactPhone)}
                    </span>

                    {/* Online Status Dot - only show when presence is active */}
                    {isOnline && (
                      <div className={cn(
                        "absolute top-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                        isTyping ? "bg-blue-500 animate-pulse" : isRecording ? "bg-red-500 animate-pulse" : "bg-green-500"
                      )} />
                    )}
                  </div>

                  <div className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center ring-2 ring-card",
                    isAIActive ? "bg-primary" : "bg-green-500"
                  )}>
                    {isAIActive ? (
                      <Bot className="h-2.5 w-2.5 text-primary-foreground" />
                    ) : (
                      <MessageCircle className="h-2.5 w-2.5 text-white" />
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 overflow-hidden">
                  {(() => {
                    const metadata = conversation.contact?.metadata as { note?: string } | null;
                    const note = metadata?.note;

                    return (
                      <div className="flex flex-col gap-0.5">
                        {/* Row 1: Note (if exists) + Time/Unread/Actions */}
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          {note && (
                            <span
                              className="text-xs font-semibold px-2 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-400 rounded truncate min-w-0 flex-1"
                              title={note}
                            >
                              {note}
                            </span>
                          )}

                          <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                            {conversation.last_message_at && (
                              <span className={cn(
                                "text-[10px] whitespace-nowrap",
                                hasUnread ? "text-primary font-medium" : "text-muted-foreground"
                              )}>
                                {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: false, locale: ptBR })}
                              </span>
                            )}
                            {hasUnread && (
                              <span className="h-5 min-w-[20px] px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
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

                        {/* Row 2: Name + Phone */}
                        {note ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className={cn(
                              "text-[11px] truncate flex-1 min-w-0",
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
                        ) : (
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <p className={cn(
                              "text-sm truncate flex-1 min-w-0",
                              hasUnread ? "font-bold text-foreground" : "font-medium text-foreground"
                            )}>
                              {hasName ? contactName : formattedPhone}
                            </p>
                          </div>
                        )}
                        {!note && hasName && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {formattedPhone}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Row 3: Last message preview */}
                  <div className="flex items-center gap-1 mt-1">
                    {lastMessage?.direction === 'outbound' && (
                      <span className="flex-shrink-0 flex items-center">
                        {lastMessage.read_at ? (
                          <CheckCheck className="text-blue-500 h-3 w-3 stroke-[3]" />
                        ) : (lastMessage.delivered_at || lastMessage.read_at) ? (
                          <CheckCheck className="text-muted-foreground/60 h-3 w-3 stroke-[3]" />
                        ) : (
                          <Check className="text-muted-foreground/60 h-3 w-3 stroke-[3]" />
                        )}
                      </span>
                    )}
                    {highlightedSnippet ? (
                      <p className={cn(
                        "text-[11px] truncate flex-1 min-w-0",
                        hasUnread ? "text-foreground font-medium" : "text-muted-foreground"
                      )}>
                        🔍 {highlightedSnippet}
                      </p>
                    ) : messagePreview ? (
                      <p className={cn(
                        "text-[11px] truncate flex-1 min-w-0",
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

                  {/* Follow-up Badge */}
                  {isInFollowUp && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 font-medium animate-pulse">
                        <RefreshCw className="h-2.5 w-2.5" />
                        Follow-up #{followUpStep}
                      </span>
                    </div>
                  )}

                  {/* Row 4: Contact Tags */}
                  {conversation.contact?.id && (
                    <ContactTagsDisplay contactId={conversation.contact.id} />
                  )}
                </div>
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
          className="text-[9px] px-1.5 py-0.5 rounded truncate max-w-[80px]"
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
