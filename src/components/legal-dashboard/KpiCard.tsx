import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, type KpiData } from '@/data/legalDashboardMock';

interface Props {
  data: KpiData;
  icon: LucideIcon;
  /** invert delta colors (down = good for cost-type kpis) */
  invertDelta?: boolean;
}

export function KpiCard({ data, icon: Icon, invertDelta = false }: Props) {
  const isUp = data.delta >= 0;
  const isGood = invertDelta ? !isUp : isUp;
  const formatted =
    data.format === 'currency' ? formatCurrency(data.value) : data.value.toLocaleString('pt-BR');

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-teal-500/15 via-white/[0.02] to-cyan-500/5 p-5 backdrop-blur-sm transition hover:border-teal-400/40">
      {/* glow */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-teal-500/20 blur-3xl transition group-hover:bg-teal-400/30" />

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-teal-400/30 bg-teal-500/10 p-2 text-teal-300 shadow-[0_0_18px_-4px] shadow-teal-500/40">
            <Icon className="h-4 w-4" />
          </div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/60">{data.label}</p>
        </div>
      </div>

      <p className="relative mt-4 text-2xl font-bold tabular-nums text-white md:text-3xl">{formatted}</p>

      <div className="relative mt-2 flex items-center gap-1">
        <span
          className={cn(
            'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
            isGood ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400',
          )}
        >
          {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(data.delta).toFixed(1)}%
        </span>
        <span className="text-xs text-white/40">vs período anterior</span>
      </div>
    </div>
  );
}
