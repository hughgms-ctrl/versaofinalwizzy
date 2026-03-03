import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Maximize2, Minimize2, X } from 'lucide-react';
import { DbConversation } from '@/hooks/useConversations';
import { ConversationDetail } from '@/components/conversations/ConversationDetail';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface PipelineChatModalProps {
  conversation: DbConversation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PipelineChatModal({ conversation, open, onOpenChange }: PipelineChatModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isMobile = useIsMobile();
  const fullscreen = isMobile || isFullscreen;

  if (!conversation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 gap-0 flex flex-col overflow-hidden transition-all duration-200 [&>button.absolute]:hidden",
          fullscreen
            ? "max-w-[100vw] w-[100vw] h-[100dvh] max-h-[100dvh] rounded-none border-0 m-0 top-0 left-0 translate-x-0 translate-y-0"
            : "max-w-4xl h-[85vh]"
        )}
        style={fullscreen ? { position: 'fixed', inset: 0, transform: 'none' } : undefined}
      >
        <ConversationDetail
          conversation={conversation}
          headerActions={
            <div className="flex items-center gap-1">
              {!isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 md:h-9 md:w-9"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  title={isFullscreen ? "Restaurar tamanho" : "Maximizar"}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 md:h-9 md:w-9 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onOpenChange(false)}
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
