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
    <div className="relative h-full overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-white/[0.02] to-emerald-500/5 p-5 backdrop-blur-sm">
      <div className="pointer-events-none absolute -bottom-16 -right-12 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl" />

      <div className="relative">
        <p className="text-xs font-medium uppercase tracking-wider text-white/60">Lucro Líquido</p>
        <p
          className="mt-3 text-3xl font-bold tabular-nums text-emerald-300 md:text-4xl"
          style={{ textShadow: '0 0 28px rgba(16,255,157,0.35)' }}
        >
          {formatCurrency(value)}
        </p>
        <div className="mt-2 flex items-center gap-1">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
              isUp ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-400',
            )}
          >
            {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
          <span className="text-xs text-white/40">vs período anterior</span>
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
                      ? 'bg-gradient-to-t from-emerald-500 to-emerald-300 shadow-[0_0_12px_-2px] shadow-emerald-400/60'
                      : 'bg-gradient-to-t from-emerald-500/40 to-emerald-400/20',
                  )}
                  style={{ height: `${h}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-white/30">
          <span>7d atrás</span>
          <span>Hoje</span>
        </div>
      </div>
    </div>
  );
}
