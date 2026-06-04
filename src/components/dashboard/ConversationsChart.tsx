import { Activity, Bot, UserRound } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useConversationsByHour } from '@/hooks/useDashboardData';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardPeriod } from '@/contexts/DashboardPeriodContext';

export function ConversationsChart() {
  const { range, periodKind } = useDashboardPeriod();
  const { data = [], isLoading } = useConversationsByHour(range);

  const displayData = periodKind === 'today' ? data.filter((_, i) => i % 2 === 0) : data;

  const subtitleMap: Record<string, string> = {
    today: 'Mensagens enviadas por hora - Hoje',
    '7d': 'Mensagens enviadas por dia - Últimos 7 dias',
    '30d': 'Mensagens enviadas por dia - Últimos 30 dias',
    '90d': 'Mensagens enviadas por dia - Últimos 90 dias',
    custom: 'Mensagens enviadas no período selecionado',
  };

  const totals = displayData.reduce(
    (acc, item) => ({
      ai: acc.ai + (Number(item.ai) || 0),
      human: acc.human + (Number(item.human) || 0),
    }),
    { ai: 0, human: 0 },
  );

  return (
    <div className="h-[420px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex h-full flex-col">
        <div className="border-b border-border bg-muted/20 p-4 md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Volume de Mensagens</h3>
                <p className="text-sm text-muted-foreground">{subtitleMap[periodKind] || 'Mensagens enviadas'}</p>
              </div>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground md:flex">
              <span className="font-medium text-foreground">{totals.ai + totals.human}</span>
              mensagens
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border bg-background/70 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Bot className="h-3.5 w-3.5 text-sky-500" />
                IA
              </div>
              <p className="mt-1 text-lg font-bold text-foreground">{totals.ai}</p>
            </div>
            <div className="rounded-xl border border-border bg-background/70 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <UserRound className="h-3.5 w-3.5 text-emerald-500" />
                Humano
              </div>
              <p className="mt-1 text-lg font-bold text-foreground">{totals.human}</p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 p-4 md:p-5">
          <div className="mb-3 flex justify-end gap-4">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-sky-500" />
              <span className="text-xs text-muted-foreground">IA</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-xs text-muted-foreground">Humano</span>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-[245px] w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={245}>
              <AreaChart data={displayData} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="aiGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(199 89% 48%)" stopOpacity={0.34} />
                    <stop offset="95%" stopColor="hsl(199 89% 48%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="humanGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(160 84% 39%)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="hsl(160 84% 39%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    boxShadow: '0 16px 40px -20px rgb(0 0 0 / 0.45)',
                    color: 'hsl(var(--foreground))',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Area
                  type="monotone"
                  dataKey="ai"
                  stroke="hsl(199 89% 48%)"
                  strokeWidth={3}
                  fill="url(#aiGradient)"
                  name="IA"
                />
                <Area
                  type="monotone"
                  dataKey="human"
                  stroke="hsl(160 84% 39%)"
                  strokeWidth={3}
                  fill="url(#humanGradient)"
                  name="Humano"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
