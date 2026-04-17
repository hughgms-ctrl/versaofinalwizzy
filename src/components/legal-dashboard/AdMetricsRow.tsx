import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdMetric } from '@/data/legalDashboardMock';

interface Props {
  metrics: AdMetric[];
}

export function AdMetricsRow({ metrics }: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/80">Métricas de Anúncios</h3>
          <p className="text-xs text-white/50">Performance de captação paga</p>
        </div>
        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium uppercase text-white/60">
          Meta Ads · em breve
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((m) => {
          const isUp = m.delta >= 0;
          // For cost metrics (CPM, CPC, CPA), down is good
          const isCost = ['cpm', 'cpc', 'cpa'].includes(m.key);
          const isGood = isCost ? !isUp : isUp;

          return (
            <div
              key={m.key}
              className="rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-3 transition hover:border-teal-400/30"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">{m.label}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-white">{m.value}</p>
              <div className="mt-1 flex items-center gap-1">
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums',
                    isGood ? 'text-emerald-400' : 'text-rose-400',
                  )}
                >
                  {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(m.delta).toFixed(1)}%
                </span>
                <span className="truncate text-[10px] text-white/40">{m.hint}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
