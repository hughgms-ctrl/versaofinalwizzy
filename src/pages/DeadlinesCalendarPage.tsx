import { MainLayout } from '@/components/layout/MainLayout';
import { useAllDeadlines } from '@/hooks/useCaseDeadlines';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, differenceInHours, isPast, isToday, isThisWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Link, useLocation } from 'react-router-dom';
import { Briefcase, ListTodo, Calendar, Settings, AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';

export default function DeadlinesCalendarPage() {
  const { data: deadlines = [] } = useAllDeadlines();
  const location = useLocation();

  const tabs = [
    { href: '/operations', label: 'Casos', icon: Briefcase },
    { href: '/operations/tasks', label: 'Minhas Tarefas', icon: ListTodo },
    { href: '/operations/deadlines', label: 'Prazos', icon: Calendar },
    { href: '/operations/templates', label: 'Templates', icon: Settings },
  ];

  const groups = useMemo(() => {
    const overdue: any[] = [];
    const today: any[] = [];
    const week: any[] = [];
    const later: any[] = [];
    deadlines.forEach((d: any) => {
      const due = new Date(d.due_date);
      if (isPast(due) && !isToday(due)) overdue.push(d);
      else if (isToday(due)) today.push(d);
      else if (isThisWeek(due)) week.push(d);
      else later.push(d);
    });
    return { overdue, today, week, later };
  }, [deadlines]);

  const renderGroup = (label: string, items: any[], variant: 'destructive' | 'warning' | 'normal') => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <h3 className={cn(
          'text-sm font-semibold flex items-center gap-2',
          variant === 'destructive' && 'text-red-600',
          variant === 'warning' && 'text-orange-600',
        )}>
          {(variant === 'destructive' || variant === 'warning') && <AlertTriangle className="h-4 w-4" />}
          {label} ({items.length})
        </h3>
        <div className="space-y-2">
          {items.map((d: any) => (
            <Card key={d.id} className={cn(
              'p-3 border-l-4',
              variant === 'destructive' && 'border-l-red-500',
              variant === 'warning' && 'border-l-orange-500',
              variant === 'normal' && 'border-l-muted',
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{d.title}</p>
                    {d.is_fatal && <Badge variant="destructive" className="text-[10px]">FATAL</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{d.case?.title}</p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(d.due_date), "dd/MM HH:mm", { locale: ptBR })}
                </span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  return (
    <MainLayout title="Prazos" subtitle="Calendário de prazos operacionais">
      <div className="space-y-4">
        <div className="flex gap-1 border-b">
          {tabs.map((t) => (
            <Link
              key={t.href}
              to={t.href}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition',
                location.pathname === t.href ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          ))}
        </div>

        {deadlines.length === 0 && (
          <Card className="p-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-muted-foreground">Nenhum prazo cadastrado.</p>
          </Card>
        )}

        <div className="space-y-6">
          {renderGroup('Vencidos', groups.overdue, 'destructive')}
          {renderGroup('Hoje', groups.today, 'warning')}
          {renderGroup('Esta semana', groups.week, 'warning')}
          {renderGroup('Depois', groups.later, 'normal')}
        </div>
      </div>
    </MainLayout>
  );
}
