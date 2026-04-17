import { ArrowRight } from 'lucide-react';
import type { FunnelStage } from '@/data/legalDashboardMock';

interface Props {
  stages: FunnelStage[];
}

export function FunnelChart({ stages }: Props) {
  const max = Math.max(...stages.map((s) => s.count));
  const width = 800;
  const height = 220;
  const stepW = width / stages.length;
  const padY = 16;

  // Build top + bottom paths to form a funnel polygon
  const points = stages.map((s, i) => {
    const ratio = s.count / max;
    const h = (height - padY * 2) * ratio;
    const x = i * stepW + stepW / 2;
    const yTop = (height - h) / 2;
    const yBot = yTop + h;
    return { x, yTop, yBot };
  });

  // Smooth path through tops then bottoms
  const topPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.yTop}`).join(' ');
  const botPath = points
    .slice()
    .reverse()
    .map((p) => `L ${p.x},${p.yBot}`)
    .join(' ');
  const fullPath = `${topPath} ${botPath} Z`;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/80">
            Performance de Funil
          </h3>
          <p className="text-xs text-muted-foreground">Da captação ao contrato fechado</p>
        </div>
        <span className="rounded-md bg-[hsl(var(--status-open)/0.15)] px-2 py-1 text-xs font-semibold text-[hsl(var(--status-open))]">
          Conversão total {((stages[stages.length - 1].count / stages[0].count) * 100).toFixed(1)}%
        </span>
      </div>

      {/* Stage labels row */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold tabular-nums text-foreground">
                {s.count.toLocaleString('pt-BR')}
              </p>
              {s.conversion !== undefined && (
                <p className="text-[11px] font-medium text-[hsl(var(--status-open))] tabular-nums">
                  {s.conversion.toFixed(1)}% conv.
                </p>
              )}
            </div>
            {i < stages.length - 1 && (
              <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground/50 lg:block" />
            )}
          </div>
        ))}
      </div>

      {/* Funnel SVG — brand gradient (magenta → coral) */}
      <div className="relative h-[220px] w-full">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full">
          <defs>
            <linearGradient id="funnelGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(340 82% 55%)" stopOpacity="0.9" />
              <stop offset="50%" stopColor="hsl(0 85% 60%)" stopOpacity="0.85" />
              <stop offset="100%" stopColor="hsl(20 90% 60%)" stopOpacity="0.75" />
            </linearGradient>
            <linearGradient id="funnelStroke" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(340 82% 65%)" />
              <stop offset="100%" stopColor="hsl(20 90% 68%)" />
            </linearGradient>
          </defs>
          <path d={fullPath} fill="url(#funnelGradient)" stroke="url(#funnelStroke)" strokeWidth="1.5" />
          {/* vertical guide lines */}
          {points.map((p, i) => (
            <line
              key={i}
              x1={p.x}
              x2={p.x}
              y1="0"
              y2={height}
              stroke="hsl(var(--border))"
              strokeOpacity="0.4"
              strokeDasharray="3 3"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
