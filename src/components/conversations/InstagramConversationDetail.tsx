import { useEffect, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, Instagram } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  InstagramConversationRow,
  useInstagramMessages,
  useMarkInstagramConversationRead,
  useSendInstagramMessage,
} from '@/hooks/useInstagramConversations';

interface InstagramConversationDetailProps {
  conversation: InstagramConversationRow;
}

export function InstagramConversationDetail({ conversation }: InstagramConversationDetailProps) {
  const { toast } = useToast();
  const { data: messages = [], isLoading } = useInstagramMessages(conversation.id);
  const sendMessage = useSendInstagramMessage();
  const markRead = useMarkInstagramConversationRead();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const contact = conversation.contact;
  const displayName = contact?.name || (contact?.username ? `@${contact.username}` : 'Instagram');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (conversation.unread_count > 0) {
      markRead.mutate(conversation.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    try {
      await sendMessage.mutateAsync({ conversationId: conversation.id, text: trimmed });
    } catch (error: any) {
      toast({ title: 'Erro ao enviar mensagem', description: error.message, variant: 'destructive' });
      setText(trimmed);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 p-3 border-b border-border flex-shrink-0">
        <Avatar className="h-9 w-9">
          <AvatarImage src={contact?.profile_pic_url || undefined} />
          <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium text-sm">{displayName}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Instagram className="h-3 w-3 text-pink-500" />
            @{contact?.username || contact?.igsid}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn('flex', message.direction === 'outbound' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words',
                  message.direction === 'outbound'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-muted rounded-bl-sm',
                  message.failed_at && 'border border-destructive',
                )}
              >
                {message.content || (message.media_url ? '[mídia]' : '')}
                {message.failed_at && (
                  <p className="text-xs text-destructive mt-1">Falha ao enviar</p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-border flex-shrink-0 flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Digite uma mensagem..."
          disabled={sendMessage.isPending}
        />
        <Button onClick={handleSend} disabled={sendMessage.isPending || !text.trim()} size="icon">
          {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
