import { Bot, User, Clock, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ServiceMode = 'ia' | 'ativo' | 'pendente' | 'all';

interface ServiceModeTabsProps {
  value: ServiceMode;
  onChange: (value: ServiceMode) => void;
  counts?: {
    ia: number;
    ativo: number;
    pendente: number;
  };
  className?: string;
}

const tabs = [
  { value: 'all' as const, label: 'Todas', icon: Users, color: 'bg-muted-foreground' },
  { value: 'pendente' as const, label: 'Fila', icon: Clock, color: 'bg-yellow-500' },
  { value: 'ativo' as const, label: 'Equipe', icon: User, color: 'bg-green-500' },
  { value: 'ia' as const, label: 'IA', icon: Bot, color: 'bg-purple-500' },
];

export function ServiceModeTabs({ value, onChange, counts, className }: ServiceModeTabsProps) {
  const totalCount = counts ? counts.ia + counts.ativo + counts.pendente : undefined;

  return (
    <div className={cn("inline-flex items-center gap-1 bg-muted/30 p-1 rounded-xl border border-border/40", className)}>
      {tabs.map((tab) => {
        const count = tab.value === 'all'
          ? totalCount
          : counts?.[tab.value as keyof typeof counts];
        const Icon = tab.icon;
        const isActive = value === tab.value;

        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative flex flex-col items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-all text-xs font-medium min-w-[64px]",
              isActive
                ? "bg-card shadow-sm text-foreground ring-1 ring-border/50"
                : "text-muted-foreground hover:text-foreground hover:bg-card/50"
            )}
          >
            <div className={cn(
              "h-6 w-6 sm:h-7 sm:w-7 rounded-full flex items-center justify-center",
              isActive ? tab.color : "bg-muted"
            )}>
              <Icon className={cn(
                "h-3.5 w-3.5 sm:h-4 sm:w-4",
                isActive ? "text-white" : "text-muted-foreground"
              )} />
            </div>
            <span className="hidden sm:block text-[11px] font-semibold">{tab.label}</span>
            {count !== undefined && count > 0 && (
              <Badge
                variant="secondary"
                className={cn(
                  "absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1.5 flex items-center justify-center text-[10px] font-bold shadow-sm",
                  isActive && "bg-primary text-primary-foreground shadow-primary/20"
                )}
              >
                {count > 99 ? '99+' : count}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
