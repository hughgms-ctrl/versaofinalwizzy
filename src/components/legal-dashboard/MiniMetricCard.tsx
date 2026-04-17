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
    <div className="rounded-2xl border border-border bg-card p-4 backdrop-blur-sm transition hover:border-primary/30 hover:shadow-glow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-primary/20 bg-primary/10 p-1.5 text-primary">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {data.label}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
            isUp
              ? 'bg-[hsl(var(--status-open)/0.15)] text-[hsl(var(--status-open))]'
              : 'bg-destructive/15 text-destructive',
          )}
        >
          {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(data.delta).toFixed(1)}%
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{data.value}</p>
    </div>
  );
}
