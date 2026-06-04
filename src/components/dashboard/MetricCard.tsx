import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

const variantStyles = {
  default: {
    shell: 'border-slate-300/50 bg-slate-500/5',
    icon: 'bg-slate-500 text-white',
    accent: 'bg-slate-500',
    glow: 'bg-slate-500/10',
  },
  primary: {
    shell: 'border-sky-400/40 bg-sky-500/5',
    icon: 'bg-sky-500 text-white',
    accent: 'bg-sky-500',
    glow: 'bg-sky-500/10',
  },
  success: {
    shell: 'border-emerald-400/40 bg-emerald-500/5',
    icon: 'bg-emerald-500 text-white',
    accent: 'bg-emerald-500',
    glow: 'bg-emerald-500/10',
  },
  warning: {
    shell: 'border-amber-400/50 bg-amber-500/5',
    icon: 'bg-amber-500 text-white',
    accent: 'bg-amber-500',
    glow: 'bg-amber-500/10',
  },
  danger: {
    shell: 'border-rose-400/50 bg-rose-500/5',
    icon: 'bg-rose-500 text-white',
    accent: 'bg-rose-500',
    glow: 'bg-rose-500/10',
  },
};

export function MetricCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  variant = 'default' 
}: MetricCardProps) {
  const styles = variantStyles[variant];

  return (
    <div className={cn(
      'group relative min-h-[132px] overflow-hidden rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg',
      'bg-card/95',
      styles.shell,
    )}>
      <div className={cn('absolute -right-8 -top-10 h-28 w-28 rounded-full blur-2xl', styles.glow)} />
      <div className={cn('absolute inset-x-0 top-0 h-1', styles.accent)} />

      <div className="relative flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
          <div className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm transition-transform group-hover:scale-105',
            styles.icon,
          )}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
        </div>

        <div>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-bold leading-none tracking-normal text-foreground">{value}</p>
            {trend && (
              <span className={cn(
                'mb-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                trend.isPositive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
              )}>
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
