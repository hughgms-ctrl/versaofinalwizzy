import { useCaseActivity } from '@/hooks/useCaseDeadlines';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const ACTION_LABELS: Record<string, string> = {
  case_created: 'Caso criado',
  status_changed: 'Status alterado',
  task_completed: 'Tarefa concluída',
  task_added: 'Tarefa adicionada',
  deadline_added: 'Prazo adicionado',
};

export function CaseTimeline({ caseId }: { caseId: string }) {
  const { data: events = [] } = useCaseActivity(caseId);

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">Sem atividades registradas.</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((e: any) => (
        <div key={e.id} className="flex gap-3 text-sm">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">
              {e.actor?.full_name?.slice(0, 2).toUpperCase() || 'SY'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p>
              <span className="font-medium">{e.actor?.full_name || 'Sistema'}</span>{' '}
              <span className="text-muted-foreground">{ACTION_LABELS[e.action] || e.action}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(e.created_at), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
