import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Scale, Building2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, differenceInHours, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { OperationsCase } from '@/types/operations';

interface CaseCardProps {
  case_: OperationsCase & {
    contact?: { name: string | null; phone: string; avatar_url: string | null };
    category?: { name: string; kind: string; color: string | null };
  };
  taskStats?: { total: number; done: number; nextDue?: string | null };
  onClick?: () => void;
}

const priorityColors: Record<string, string> = {
  low: 'bg-slate-200 text-slate-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export function CaseCard({ case_, taskStats, onClick }: CaseCardProps) {
  const Icon = case_.kind === 'judicial' ? Scale : Building2;
  const contactName = case_.contact?.name || case_.contact?.phone || 'Sem contato';
  const initials = contactName.slice(0, 2).toUpperCase();

  let dueBadge: React.ReactNode = null;
  if (taskStats?.nextDue) {
    const due = new Date(taskStats.nextDue);
    const hours = differenceInHours(due, new Date());
    if (isPast(due)) {
      dueBadge = (
        <Badge variant="destructive" className="text-[10px] gap-1">
          <AlertTriangle className="h-3 w-3" /> Vencida
        </Badge>
      );
    } else if (hours < 24) {
      dueBadge = (
        <Badge className="bg-red-500 text-white text-[10px] gap-1">
          <Clock className="h-3 w-3" /> {hours}h
        </Badge>
      );
    } else if (hours < 72) {
      dueBadge = (
        <Badge className="bg-orange-500 text-white text-[10px] gap-1">
          <Clock className="h-3 w-3" /> {Math.ceil(hours / 24)}d
        </Badge>
      );
    }
  }

  const isDone = !!case_.closed_at;

  return (
    <Card
      onClick={onClick}
      className={cn(
        'p-3 cursor-pointer hover:shadow-md transition-all border-l-4 space-y-2',
        isDone && 'opacity-70'
      )}
      style={{ borderLeftColor: case_.category?.color || '#6366f1' }}
    >
      <div className="flex items-start gap-2">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={case_.contact?.avatar_url || undefined} />
          <AvatarFallback className="text-xs bg-primary/10">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{contactName}</p>
          <p className="text-xs text-muted-foreground truncate">{case_.title}</p>
        </div>
        {isDone && <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
          <Icon className="h-2.5 w-2.5" />
          {case_.category?.name || (case_.kind === 'judicial' ? 'Judicial' : 'Administrativo')}
        </Badge>
        {case_.priority !== 'medium' && (
          <Badge className={cn('text-[10px] px-1.5 py-0 border-0', priorityColors[case_.priority])}>
            {case_.priority === 'urgent' ? 'Urgente' : case_.priority === 'high' ? 'Alta' : 'Baixa'}
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {taskStats ? `${taskStats.done}/${taskStats.total} tarefas` : '—'}
        </span>
        {dueBadge || <span>{format(new Date(case_.opened_at), "dd/MM", { locale: ptBR })}</span>}
      </div>
    </Card>
  );
}
