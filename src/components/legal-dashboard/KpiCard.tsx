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
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 backdrop-blur-sm transition hover:border-primary/40 hover:shadow-glow">
      {/* gradient overlay (brand magenta → coral) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-primary-subtle opacity-60 transition group-hover:opacity-100" />
      {/* glow */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/20 blur-3xl transition group-hover:bg-primary/30" />

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-2 text-primary shadow-[0_0_18px_-4px] shadow-primary/40">
            <Icon className="h-4 w-4" />
          </div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{data.label}</p>
        </div>
      </div>

      <p className="relative mt-4 text-2xl font-bold tabular-nums text-foreground md:text-3xl">{formatted}</p>

      <div className="relative mt-2 flex items-center gap-1">
        <span
          className={cn(
            'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
            isGood
              ? 'bg-[hsl(var(--status-open)/0.15)] text-[hsl(var(--status-open))]'
              : 'bg-destructive/15 text-destructive',
          )}
        >
          {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(data.delta).toFixed(1)}%
        </span>
        <span className="text-xs text-muted-foreground/70">vs período anterior</span>
      </div>
    </div>
  );
}
