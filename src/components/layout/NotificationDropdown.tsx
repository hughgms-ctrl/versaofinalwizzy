import { useState, useMemo } from 'react';
import { Bell, Check, MessageSquare, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';

interface Notification {
  id: string;
  type: 'message' | 'alert' | 'system' | 'disconnect';
  title: string;
  description: string;
  timestamp: Date;
  read: boolean;
}

export function NotificationDropdown() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const { connected, status, isLoading } = useWhatsAppStatus();
  const [disconnectedAt, setDisconnectedAt] = useState<Date | null>(null);

  // Track WhatsApp disconnection events
  useEffect(() => {
    if (isLoading) return;
    
    if (!connected && status !== 'pending' && status !== 'not_configured') {
      if (!disconnectedAt) {
        const now = new Date();
        setDisconnectedAt(now);
        setNotifications(prev => {
          // Don't duplicate disconnect notifications
          const filtered = prev.filter(n => n.type !== 'disconnect');
          return [
            {
              id: `disconnect-${now.getTime()}`,
              type: 'disconnect' as const,
              title: '⚠️ WhatsApp desconectado',
              description: 'Sua instância perdeu a conexão. Mensagens não estão sendo enviadas.',
              timestamp: now,
              read: false,
            },
            ...filtered,
          ];
        });
      }
    } else if (connected && disconnectedAt) {
      // Reconnected — add reconnection notification
      const now = new Date();
      setDisconnectedAt(null);
      setNotifications(prev => {
        const filtered = prev.filter(n => n.type !== 'disconnect');
        return [
          {
            id: `reconnect-${now.getTime()}`,
            type: 'system' as const,
            title: '✅ WhatsApp reconectado',
            description: 'Sua instância voltou a funcionar normalmente.',
            timestamp: now,
            read: false,
          },
          ...filtered,
        ];
      });
    }
  }, [connected, status, isLoading, disconnectedAt]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'message':
        return <MessageSquare className="h-4 w-4 text-primary" />;
      case 'alert':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'disconnect':
        return <WifiOff className="h-4 w-4 text-destructive" />;
      case 'system':
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className={cn(
              "absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-medium",
              notifications.some(n => !n.read && n.type === 'disconnect')
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "bg-destructive text-destructive-foreground"
            )}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificações</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={markAllAsRead}
            >
              <Check className="h-3 w-3 mr-1" />
              Marcar todas como lidas
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={cn(
                  'flex items-start gap-3 p-3 cursor-pointer',
                  !notification.read && 'bg-muted/50',
                  !notification.read && notification.type === 'disconnect' && 'bg-destructive/10'
                )}
                onClick={() => markAsRead(notification.id)}
              >
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                  notification.type === 'disconnect' ? "bg-destructive/20" : "bg-muted"
                )}>
                  {getIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm',
                    !notification.read && 'font-medium'
                  )}>
                    {notification.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {notification.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(notification.timestamp, {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </p>
                </div>
                {!notification.read && (
                  <div className={cn(
                    "h-2 w-2 rounded-full shrink-0 mt-1",
                    notification.type === 'disconnect' ? "bg-destructive" : "bg-primary"
                  )} />
                )}
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
