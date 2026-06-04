import { useMemo } from 'react';
import { Trophy, MessageSquare, Zap } from 'lucide-react';
import { useTeamPerformance } from '@/hooks/useDashboardData';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useDashboardPeriod } from '@/contexts/DashboardPeriodContext';

export function AgentPerformance() {
  const { range } = useDashboardPeriod();
  const { data: teamMembers = [], isLoading } = useTeamPerformance('7d', range);

  const sortedMembers = useMemo(
    () => [...teamMembers].sort((a, b) => b.conversationsHandled - a.conversationsHandled),
    [teamMembers],
  );

  const maxConversations = Math.max(...sortedMembers.map((member) => member.conversationsHandled), 1);
  const totalHandled = sortedMembers.reduce((sum, member) => sum + member.conversationsHandled, 0);

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/20 p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Ranking da Equipe</h3>
            <p className="text-sm text-muted-foreground">Conversas atendidas no período selecionado</p>
          </div>
        </div>
        <div className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{totalHandled}</span> atendimentos
        </div>
      </div>

      <div className="p-3 md:p-4">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : sortedMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">Nenhum atendimento registrado</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Assim que a equipe atender conversas, o ranking aparece aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedMembers.map((member, index) => {
              const percentage = Math.max((member.conversationsHandled / maxConversations) * 100, 4);

              return (
                <div key={member.id} className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-5 text-center text-xs font-bold text-muted-foreground">
                      {index + 1}
                    </div>
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback className="bg-gradient-to-br from-amber-500 to-rose-500 text-sm font-semibold text-white">
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-foreground">{member.name}</p>
                        <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
                          <Zap className="h-3 w-3 text-amber-500" />
                          {member.conversationsHandled}
                        </div>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
