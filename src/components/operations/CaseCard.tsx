import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Scale, Building2, AlertTriangle, CheckCircle2, Clock, Phone, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, differenceInHours, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCaseTasks, useUpdateCaseTask } from '@/hooks/useCaseTasks';
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
  const [expanded, setExpanded] = useState(false);
  const Icon = case_.kind === 'judicial' ? Scale : Building2;
  const contactName = case_.contact?.name || case_.contact?.phone || 'Sem contato';
  const initials = contactName.slice(0, 2).toUpperCase();
  const isDone = !!case_.closed_at;

  let dueBadge: React.ReactNode = null;
  if (taskStats?.nextDue) {
    const due = new Date(taskStats.nextDue);
    const hours = differenceInHours(due, new Date());
    if (isPast(due)) {
      dueBadge = (
        <Badge variant="destructive" className="text-[10px] gap-1 px-1.5 py-0">
          <AlertTriangle className="h-2.5 w-2.5" /> Vencida
        </Badge>
      );
    } else if (hours < 24) {
      dueBadge = (
        <Badge className="bg-red-500 text-white text-[10px] gap-1 px-1.5 py-0">
          <Clock className="h-2.5 w-2.5" /> {hours}h
        </Badge>
      );
    } else if (hours < 72) {
      dueBadge = (
        <Badge className="bg-orange-500 text-white text-[10px] gap-1 px-1.5 py-0">
          <Clock className="h-2.5 w-2.5" /> {Math.ceil(hours / 24)}d
        </Badge>
      );
    }
  }

  const progress = taskStats && taskStats.total > 0 ? (taskStats.done / taskStats.total) * 100 : 0;

  return (
    <Card
      className={cn(
        'p-3 hover:shadow-md transition-all border-l-4 space-y-2',
        isDone && 'opacity-70'
      )}
      style={{ borderLeftColor: case_.category?.color || '#6366f1' }}
    >
      <div className="flex items-start gap-2 cursor-pointer" onClick={onClick}>
        <Avatar className="h-9 w-9 flex-shrink-0">
          <AvatarImage src={case_.contact?.avatar_url || undefined} />
          <AvatarFallback className="text-xs bg-primary/10">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate leading-tight">{contactName}</p>
          {case_.contact?.phone && (
            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
              <Phone className="h-2.5 w-2.5" /> {case_.contact.phone}
            </p>
          )}
        </div>
        {isDone && <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />}
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2">{case_.title}</p>

      <div className="flex items-center gap-1 flex-wrap">
        <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
          <Icon className="h-2.5 w-2.5" />
          {case_.category?.name || (case_.kind === 'judicial' ? 'Judicial' : 'Administrativo')}
        </Badge>
        {case_.priority !== 'medium' && (
          <Badge className={cn('text-[10px] px-1.5 py-0 border-0', priorityColors[case_.priority])}>
            {case_.priority === 'urgent' ? 'Urgente' : case_.priority === 'high' ? 'Alta' : 'Baixa'}
          </Badge>
        )}
        {dueBadge}
      </div>

      {taskStats && taskStats.total > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{taskStats.done}/{taskStats.total} tarefas</span>
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="hover:text-foreground transition-colors flex items-center gap-0.5"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Esconder' : 'Ver'}
            </button>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {expanded && <InlineTaskList caseId={case_.id} />}

      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <span className="text-[10px] text-muted-foreground">
          {format(new Date(case_.opened_at), "dd/MM/yy", { locale: ptBR })}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px] px-2"
          onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        >
          Abrir
        </Button>
      </div>
    </Card>
  );
}

function InlineTaskList({ caseId }: { caseId: string }) {
  const { data: tasks = [], isLoading } = useCaseTasks(caseId);
  const update = useUpdateCaseTask();

  if (isLoading) return <p className="text-[10px] text-muted-foreground">Carregando...</p>;
  if (tasks.length === 0) return <p className="text-[10px] text-muted-foreground italic">Sem tarefas</p>;

  return (
    <div className="space-y-1 max-h-40 overflow-y-auto">
      {tasks.slice(0, 8).map((t: any) => {
        const isDone = t.status === 'done' || !!t.completed_at;
        return (
          <div
            key={t.id}
            className="flex items-start gap-2 text-[11px]"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={isDone}
              onCheckedChange={(c) => update.mutate({ id: t.id, status: c ? 'done' : 'todo' })}
              className="h-3 w-3 mt-0.5"
            />
            <span className={cn('flex-1 leading-tight', isDone && 'line-through text-muted-foreground')}>
              {t.title}
            </span>
          </div>
        );
      })}
      {tasks.length > 8 && (
        <p className="text-[10px] text-muted-foreground italic">+{tasks.length - 8} tarefas</p>
      )}
    </div>
  );
}
