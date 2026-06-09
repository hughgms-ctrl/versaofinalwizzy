import { useState, useRef, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Users, Pencil, ShieldCheck, Send, Loader2, MessagesSquare } from 'lucide-react';
import { WhatsAppGroup, useSendGroupMessage } from '@/hooks/useWhatsAppGroups';
import { GroupParticipantsDialog } from './GroupParticipantsDialog';
import { EditGroupDialog } from './EditGroupDialog';

interface GroupChatPanelProps {
  group: WhatsAppGroup;
}

interface SessionMessage {
  id: string;
  text: string | null;
  mediaUrl: string | null;
  at: string;
}

export function GroupChatPanel({ group }: GroupChatPanelProps) {
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [showParticipants, setShowParticipants] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const sendMessage = useSendGroupMessage();
  const scrollRef = useRef<HTMLDivElement>(null);

  const initials = (group.name || 'G').slice(0, 2).toUpperCase();

  const mediaType = (() => {
    const lower = mediaUrl.toLowerCase();
    if (/\.(png|jpe?g|webp|gif)(\?|$)/.test(lower)) return 'image' as const;
    if (/\.(mp4|mov|webm|3gp)(\?|$)/.test(lower)) return 'video' as const;
    if (/\.(ogg|mp3|m4a|wav)(\?|$)/.test(lower)) return 'audio' as const;
    return 'document' as const;
  })();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const canSend = (text.trim() || mediaUrl.trim()) && !sendMessage.isPending;

  const handleSend = async () => {
    if (!canSend) return;
    const trimmedText = text.trim();
    const trimmedMedia = mediaUrl.trim();
    try {
      await sendMessage.mutateAsync({
        groupJids: [group.group_jid],
        text: trimmedText || null,
        type: trimmedMedia ? mediaType : 'text',
        mediaUrl: trimmedMedia || null,
        caption: trimmedText || null,
      });
      setMessages(prev => [
        ...prev,
        {
          id: `${prev.length}-${trimmedText}-${trimmedMedia}`,
          text: trimmedText || null,
          mediaUrl: trimmedMedia || null,
          at: new Date().toISOString(),
        },
      ]);
      setText('');
      setMediaUrl('');
    } catch {
      // toast handled by hook
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card flex-shrink-0">
        <Avatar className="h-10 w-10">
          <AvatarImage src={group.picture_url || undefined} />
          <AvatarFallback className="bg-emerald-500/15 text-emerald-600">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate">{group.name || group.group_jid}</p>
            {group.is_admin && (
              <Badge variant="secondary" className="h-5 gap-1 text-[10px] flex-shrink-0">
                <ShieldCheck className="h-3 w-3" /> Admin
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{group.participant_count} participante(s)</p>
        </div>

        <Button variant="ghost" size="sm" className="gap-1.5 h-8 hidden sm:flex" onClick={() => setShowParticipants(true)}>
          <Users className="h-4 w-4" /> Participantes
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowParticipants(true)}>
              <Users className="h-4 w-4 mr-2" /> Participantes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowEdit(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Editar grupo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center px-6">
            <MessagesSquare className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhuma mensagem enviada nesta sessão.</p>
            <p className="text-xs mt-1 max-w-xs">
              As mensagens que você enviar para o grupo aparecerão aqui.
            </p>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[70%] rounded-2xl rounded-tr-sm px-4 py-2.5 bg-green-500 text-white">
                {msg.mediaUrl && (
                  <a
                    href={msg.mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs underline break-all opacity-90 mb-1"
                  >
                    {msg.mediaUrl}
                  </a>
                )}
                {msg.text && <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-card p-3 flex-shrink-0 space-y-2">
        <Input
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.target.value)}
          placeholder="URL de mídia (opcional) — imagem, vídeo, áudio ou documento"
          className="h-8 text-xs"
        />
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escreva a mensagem... (Enter para enviar, Shift+Enter para quebrar linha)"
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
          />
          <Button onClick={handleSend} disabled={!canSend} size="icon" className="h-11 w-11 flex-shrink-0">
            {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <GroupParticipantsDialog
        open={showParticipants}
        onOpenChange={setShowParticipants}
        group={group}
      />
      <EditGroupDialog
        open={showEdit}
        onOpenChange={setShowEdit}
        group={group}
      />
    </div>
  );
}
