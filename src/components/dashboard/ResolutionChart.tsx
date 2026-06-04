import { CheckCircle2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useResolutionData } from '@/hooks/useDashboardData';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardPeriod } from '@/contexts/DashboardPeriodContext';

export function ResolutionChart() {
  const { range } = useDashboardPeriod();
  const { data = [], isLoading } = useResolutionData(range);

  const primary = data[0];
  const hasData = data.some((item) => Number(item.value) > 0);

  return (
    <div className="h-[420px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex h-full flex-col">
        <div className="border-b border-border bg-muted/20 p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Status das Conversas</h3>
              <p className="text-sm text-muted-foreground">Distribuição operacional do período</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-5">
            <Skeleton className="h-[320px] w-full rounded-xl" />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto] gap-2 p-4 md:p-5">
            <div className="relative min-h-[190px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius="58%"
                    outerRadius="82%"
                    paddingAngle={hasData ? 3 : 0}
                    dataKey="value"
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '12px',
                      boxShadow: '0 16px 40px -20px rgb(0 0 0 / 0.45)',
                      color: 'hsl(var(--foreground))',
                    }}
                    formatter={(value: number) => [`${value}%`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-bold text-foreground">{primary?.value ?? 0}%</span>
                <span className="mt-1 max-w-[120px] truncate text-xs text-muted-foreground">
                  {primary?.name || 'Sem dados'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {data.map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate text-xs font-medium text-foreground">{item.name}</span>
                  </div>
                  <span className="text-xs font-bold tabular-nums text-muted-foreground">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
