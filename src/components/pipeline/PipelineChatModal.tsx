import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
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
          "p-0 gap-0 flex flex-col overflow-hidden transition-all duration-200",
          fullscreen 
            ? "max-w-[100vw] w-[100vw] h-[100dvh] max-h-[100dvh] rounded-none border-0 m-0 top-0 left-0 translate-x-0 translate-y-0" 
            : "max-w-4xl h-[85vh]"
        )}
        style={fullscreen ? { position: 'fixed', inset: 0, transform: 'none' } : undefined}
      >
        {/* Mobile back button */}
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 left-3 z-50 h-9 w-9"
            onClick={() => onOpenChange(false)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}

        {/* Fullscreen toggle button (desktop only) */}
        {!isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-12 z-50 h-8 w-8"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        )}

        <ConversationDetail conversation={conversation} />
      </DialogContent>
    </Dialog>
  );
}
