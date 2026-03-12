import { useRecentConversations } from '@/hooks/useDashboardData';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageSquare, Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { useCanAccessModule } from '@/hooks/useUserPermissions';

export function RecentConversations() {
  const { data: recentConversations = [], isLoading } = useRecentConversations(5);
  const { canAccess: canAccessConversations } = useCanAccessModule('conversations');
  const navigate = useNavigate();

  const handleClick = (conversationId: string) => {
    if (!canAccessConversations) return;
    navigate(`/conversations?id=${conversationId}`);
  };

  return (
    <div className="metric-card">
      <div className="metric-card-gradient" />
      <div className="relative">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Conversas Recentes</h3>
            <p className="text-sm text-muted-foreground">Últimas interações</p>
          </div>
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : recentConversations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma conversa encontrada
          </div>
        ) : (
          <div className="space-y-3">
            {recentConversations.map((conversation) => (
              <div 
                key={conversation.id}
                onClick={() => handleClick(conversation.id)}
                className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
              >
                <div className="relative">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                    <span className="text-sm font-semibold text-primary">
                      {conversation.contactName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  {conversation.isFromBot && (
                    <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                      <Bot className="h-3 w-3 text-white" />
                    </div>
                  )}
                  {!conversation.isFromBot && (
                    <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                      <User className="h-3 w-3 text-white" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground truncate">
                      {conversation.contactName}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(conversation.lastMessageAt, { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {conversation.lastMessage}
                  </p>
                </div>

                <div className={cn(
                  "status-badge",
                  conversation.status === 'open' && "status-open",
                  (conversation.status === 'resolved' || conversation.status === 'closed' || conversation.status === 'archived') && "status-closed"
                )}>
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    conversation.status === 'open' && "bg-green-600",
                    (conversation.status === 'resolved' || conversation.status === 'closed' || conversation.status === 'archived') && "bg-slate-500"
                  )} />
                  {conversation.status === 'open' && 'Aberto'}
                  {(conversation.status === 'resolved' || conversation.status === 'closed' || conversation.status === 'archived') && 'Resolvido'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
