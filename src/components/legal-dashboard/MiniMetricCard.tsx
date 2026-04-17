import { ArrowUpRight, ArrowDownRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MiniMetric } from '@/data/legalDashboardMock';

interface Props {
  data: MiniMetric;
  icon: LucideIcon;
}

export function MiniMetricCard({ data, icon: Icon }: Props) {
  const isUp = data.delta >= 0;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-sm transition hover:border-cyan-400/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 p-1.5 text-cyan-300">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-white/60">{data.label}</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
            isUp ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400',
          )}
        >
          {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(data.delta).toFixed(1)}%
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-white">{data.value}</p>
    </div>
  );
}
