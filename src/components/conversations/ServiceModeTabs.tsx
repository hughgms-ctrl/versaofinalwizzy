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
  { value: 'ia' as const, label: 'IA', icon: Bot, color: 'bg-purple-500' },
  { value: 'ativo' as const, label: 'Ativos', icon: User, color: 'bg-green-500' },
  { value: 'pendente' as const, label: 'Pendentes', icon: Clock, color: 'bg-yellow-500' },
];

export function ServiceModeTabs({ value, onChange, counts, className }: ServiceModeTabsProps) {
  const totalCount = counts ? counts.ia + counts.ativo + counts.pendente : undefined;
  
  return (
    <div className={cn("inline-flex items-center gap-0 bg-muted/50 p-0.5 rounded-lg", className)}>
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
              "relative flex flex-col items-center gap-0.5 px-1.5 sm:px-2 py-1 rounded-md transition-all text-xs font-medium",
              isActive 
                ? "bg-card shadow-sm text-foreground" 
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
            <span className="hidden sm:block text-[10px]">{tab.label}</span>
            {count !== undefined && count > 0 && (
              <Badge 
                variant="secondary" 
                className={cn(
                  "absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] font-bold",
                  isActive && "bg-primary text-primary-foreground"
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
