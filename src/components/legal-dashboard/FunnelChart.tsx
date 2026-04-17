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
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/80">Performance de Funil</h3>
          <p className="text-xs text-white/50">Da captação ao contrato fechado</p>
        </div>
        <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-400">
          Conversão total {((stages[stages.length - 1].count / stages[0].count) * 100).toFixed(1)}%
        </span>
      </div>

      {/* Stage labels row */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-white/50">{s.label}</p>
              <p className="text-xl font-bold tabular-nums text-white">{s.count.toLocaleString('pt-BR')}</p>
              {s.conversion !== undefined && (
                <p className="text-[11px] font-medium text-emerald-400 tabular-nums">
                  {s.conversion.toFixed(1)}% conv.
                </p>
              )}
            </div>
            {i < stages.length - 1 && <ArrowRight className="hidden h-4 w-4 shrink-0 text-white/30 lg:block" />}
          </div>
        ))}
      </div>

      {/* Funnel SVG */}
      <div className="relative h-[220px] w-full">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full">
          <defs>
            <linearGradient id="funnelGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#14b8a6" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="funnelStroke" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#22d3ee" />
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
              stroke="rgba(255,255,255,0.05)"
              strokeDasharray="3 3"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
