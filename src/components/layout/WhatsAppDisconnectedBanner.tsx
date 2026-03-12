import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import { WifiOff, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export function WhatsAppDisconnectedBanner() {
  const { status, connected, isLoading, refetch } = useWhatsAppStatus();
  const [dismissed, setDismissed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const prevConnected = useRef<boolean | null>(null);

  // Reset dismissed when status changes from connected to disconnected
  useEffect(() => {
    if (prevConnected.current === true && !connected && !isLoading) {
      setDismissed(false);
    }
    if (!isLoading) {
      prevConnected.current = connected;
    }
  }, [connected, isLoading]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 2000);
  };

  if (isLoading || connected || dismissed || status === 'pending' || status === 'not_configured') {
    return null;
  }

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-2.5 text-sm font-medium animate-in slide-in-from-top-2 duration-300",
      "bg-destructive text-destructive-foreground"
    )}>
      <WifiOff className="h-4 w-4 flex-shrink-0 animate-pulse" />
      <span className="flex-1">
        WhatsApp desconectado — mensagens não estão sendo enviadas nem recebidas.
        {status === 'connecting' && ' Tentando reconectar...'}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-destructive-foreground hover:bg-destructive-foreground/20"
        onClick={handleRefresh}
        disabled={isRefreshing}
      >
        <RefreshCw className={cn("h-3.5 w-3.5 mr-1", isRefreshing && "animate-spin")} />
        Verificar
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive-foreground hover:bg-destructive-foreground/20"
        onClick={() => setDismissed(true)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}