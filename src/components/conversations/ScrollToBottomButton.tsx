import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ScrollToBottomButtonProps {
  visible: boolean;
  onClick: () => void;
  unreadCount?: number;
}

export function ScrollToBottomButton({ visible, onClick, unreadCount = 0 }: ScrollToBottomButtonProps) {
  if (!visible) return null;
  
  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={onClick}
      className={cn(
        "absolute bottom-4 right-4 z-10 rounded-full shadow-lg",
        "bg-card border border-border hover:bg-accent",
        "animate-in fade-in slide-in-from-bottom-2 duration-200"
      )}
    >
      <ChevronDown className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center font-medium">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Button>
  );
}
