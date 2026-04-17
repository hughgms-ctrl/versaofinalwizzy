import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/data/legalDashboardMock';

interface Props {
  value: number;
  delta: number;
  spark: number[];
}

export function ProfitCard({ value, delta, spark }: Props) {
  const isUp = delta >= 0;
  const max = Math.max(...spark);

  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-[hsl(var(--status-open)/0.25)] bg-card p-5 backdrop-blur-sm">
      {/* subtle success gradient overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'linear-gradient(135deg, hsl(var(--status-open) / 0.10) 0%, transparent 60%, hsl(var(--status-open) / 0.05) 100%)',
        }}
      />
      <div className="pointer-events-none absolute -bottom-16 -right-12 h-40 w-40 rounded-full bg-[hsl(var(--status-open)/0.20)] blur-3xl" />

      <div className="relative">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Lucro Líquido</p>
        <p
          className="mt-3 text-3xl font-bold tabular-nums text-[hsl(var(--status-open))] md:text-4xl"
          style={{ textShadow: '0 0 28px hsl(var(--status-open) / 0.35)' }}
        >
          {formatCurrency(value)}
        </p>
        <div className="mt-2 flex items-center gap-1">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
              isUp
                ? 'bg-[hsl(var(--status-open)/0.20)] text-[hsl(var(--status-open))]'
                : 'bg-destructive/20 text-destructive',
            )}
          >
            {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground/70">vs período anterior</span>
        </div>

        {/* Sparkline bars */}
        <div className="mt-6 flex h-24 items-end gap-1.5">
          {spark.map((v, i) => {
            const h = (v / max) * 100;
            const isLast = i === spark.length - 1;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={cn(
                    'w-full rounded-t-md transition-all',
                    isLast
                      ? 'shadow-[0_0_12px_-2px]'
                      : '',
                  )}
                  style={{
                    height: `${h}%`,
                    background: isLast
                      ? 'linear-gradient(to top, hsl(var(--status-open)) 0%, hsl(var(--status-open) / 0.7) 100%)'
                      : 'linear-gradient(to top, hsl(var(--status-open) / 0.4) 0%, hsl(var(--status-open) / 0.15) 100%)',
                    boxShadow: isLast ? '0 0 12px -2px hsl(var(--status-open) / 0.6)' : undefined,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/60">
          <span>7d atrás</span>
          <span>Hoje</span>
        </div>
      </div>
    </div>
  );
}
