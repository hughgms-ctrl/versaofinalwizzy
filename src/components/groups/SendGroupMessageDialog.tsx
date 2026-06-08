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
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Check, Loader2, Send } from 'lucide-react';
import { WhatsAppGroup, useSendGroupMessage } from '@/hooks/useWhatsAppGroups';

interface SendGroupMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: WhatsAppGroup[];
  initialGroup?: WhatsAppGroup | null;
}

export function SendGroupMessageDialog({ open, onOpenChange, groups, initialGroup }: SendGroupMessageDialogProps) {
  const [selectedJids, setSelectedJids] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const sendMessage = useSendGroupMessage();

  useEffect(() => {
    if (open) {
      setSelectedJids(initialGroup ? [initialGroup.group_jid] : []);
      setText('');
      setMediaUrl('');
    }
  }, [open, initialGroup]);

  const toggle = (jid: string) => {
    setSelectedJids(prev => (prev.includes(jid) ? prev.filter(j => j !== jid) : [...prev, jid]));
  };

  const mediaType = (() => {
    const lower = mediaUrl.toLowerCase();
    if (/\.(png|jpe?g|webp|gif)(\?|$)/.test(lower)) return 'image' as const;
    if (/\.(mp4|mov|webm|3gp)(\?|$)/.test(lower)) return 'video' as const;
    if (/\.(ogg|mp3|m4a|wav)(\?|$)/.test(lower)) return 'audio' as const;
    return 'document' as const;
  })();

  const handleSend = async () => {
    if (selectedJids.length === 0) return;
    try {
      await sendMessage.mutateAsync({
        groupJids: selectedJids,
        text: text.trim() || null,
        type: mediaUrl.trim() ? mediaType : 'text',
        mediaUrl: mediaUrl.trim() || null,
        caption: text.trim() || null,
      });
      onOpenChange(false);
    } catch {
      // toast handled by hook
    }
  };

  const canSend = selectedJids.length > 0 && (text.trim() || mediaUrl.trim()) && !sendMessage.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Enviar mensagem para grupo(s)</DialogTitle>
          <DialogDescription>
            Selecione um ou mais grupos e escreva a mensagem. Marque vários para envio em massa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Grupos ({selectedJids.length} selecionado(s))</Label>
            <ScrollArea className="h-40 rounded-md border border-border">
              <div className="divide-y divide-border">
                {groups.map(group => {
                  const checked = selectedJids.includes(group.group_jid);
                  return (
                    <button
                      type="button"
                      key={group.id}
                      onClick={() => toggle(group.group_jid)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-muted/40"
                    >
                      <span className={cn(
                        'h-4 w-4 rounded border flex items-center justify-center flex-shrink-0',
                        checked ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40'
                      )}>
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate">{group.name || group.group_jid}</span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <Label htmlFor="group-message">Mensagem</Label>
            <Textarea
              id="group-message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escreva a mensagem..."
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="group-media">URL de mídia (opcional)</Label>
            <Input
              id="group-media"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://.../arquivo.jpg"
            />
            <p className="text-[10px] text-muted-foreground">
              Imagem, vídeo, áudio ou documento. O texto vira legenda quando há mídia.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={!canSend} className="gap-2">
            {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
