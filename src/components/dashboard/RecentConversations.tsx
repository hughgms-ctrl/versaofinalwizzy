import { useRecentConversations } from '@/hooks/useDashboardData';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot, Inbox, MessageSquare, User, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { useCanAccessModule } from '@/hooks/useUserPermissions';

export function RecentConversations() {
  const { data: allRecent = [], isLoading } = useRecentConversations(20);
  const recentConversations = allRecent
    .filter((c) => c.status === 'open')
    .slice(0, 5);
  const { canAccess: canAccessConversations } = useCanAccessModule('conversations');
  const navigate = useNavigate();

  const handleClick = (conversationId: string) => {
    if (!canAccessConversations) return;
    navigate(`/conversations?id=${conversationId}`);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/20 p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Conversas em aberto</h3>
            <p className="text-sm text-muted-foreground">Últimas interações que ainda pedem atenção</p>
          </div>
        </div>
        <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground">
          {recentConversations.length}
        </span>
      </div>

      <div className="p-3 md:p-4">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : recentConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">Nenhuma conversa aberta</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Quando novas conversas chegarem, elas aparecem aqui para ação rápida.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentConversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                onClick={() => handleClick(conversation.id)}
                disabled={!canAccessConversations}
                className={cn(
                  'group flex w-full items-center gap-3 px-1 py-3 text-left transition-colors',
                  canAccessConversations ? 'hover:bg-muted/30' : 'cursor-default opacity-80',
                )}
              >
                <div className="relative shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted font-semibold text-foreground">
                    {conversation.contactName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className={cn(
                    'absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-white ring-2 ring-card',
                    conversation.isFromBot ? 'bg-sky-500' : 'bg-emerald-500',
                  )}>
                    {conversation.isFromBot ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {conversation.contactName}
                    </p>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                      Aberto
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {conversation.lastMessage}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(conversation.lastMessageAt, { addSuffix: true, locale: ptBR })}
                  </span>
                  {canAccessConversations && (
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
