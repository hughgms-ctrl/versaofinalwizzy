import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useMyTasks, useUpdateCaseTask } from '@/hooks/useCaseTasks';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { format, differenceInHours, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Link, useLocation } from 'react-router-dom';
import { Briefcase, ListTodo, Calendar, Settings, AlertTriangle, Clock, ExternalLink } from 'lucide-react';
import { CaseDrawer } from '@/components/operations/CaseDrawer';

export default function MyTasksPage() {
  const { data: tasks = [], isLoading } = useMyTasks();
  const update = useUpdateCaseTask();
  const location = useLocation();
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);

  const tabs = [
    { href: '/operations', label: 'Casos', icon: Briefcase },
    { href: '/operations/tasks', label: 'Minhas Tarefas', icon: ListTodo },
    { href: '/operations/deadlines', label: 'Prazos', icon: Calendar },
    { href: '/operations/templates', label: 'Templates', icon: Settings },
  ];

  return (
    <MainLayout title="Minhas Tarefas" subtitle="Tarefas operacionais sob sua responsabilidade">
      <div className="space-y-4">
        <div className="flex gap-1 border-b">
          {tabs.map((t) => (
            <Link
              key={t.href}
              to={t.href}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition',
                location.pathname === t.href
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          ))}
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!isLoading && tasks.length === 0 && (
          <Card className="p-12 text-center">
            <ListTodo className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-muted-foreground">Nenhuma tarefa pendente para você.</p>
          </Card>
        )}

        <div className="space-y-2">
          {tasks.map((t: any) => {
            let badge: React.ReactNode = null;
            if (t.due_date) {
              const due = new Date(t.due_date);
              if (isPast(due)) badge = <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Vencida</Badge>;
              else if (differenceInHours(due, new Date()) < 24) badge = <Badge className="bg-red-500 text-white gap-1"><Clock className="h-3 w-3" /> &lt; 24h</Badge>;
              else if (differenceInHours(due, new Date()) < 72) badge = <Badge className="bg-orange-500 text-white">Em breve</Badge>;
            }
            return (
              <Card
                key={t.id}
                className="p-3 flex items-start gap-3 hover:shadow-md transition cursor-pointer"
                onClick={() => t.case?.id && setOpenCaseId(t.case.id)}
              >
                <Checkbox
                  checked={false}
                  onCheckedChange={() => update.mutate({ id: t.id, status: 'done' })}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t.title}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span className="truncate flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      {t.case?.title || '—'}
                    </span>
                    {t.case?.contact?.name && <span>• {t.case.contact.name}</span>}
                    {t.due_date && <span>• {format(new Date(t.due_date), "dd/MM HH:mm", { locale: ptBR })}</span>}
                  </div>
                </div>
                {badge}
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Card>
            );
          })}
        </div>
      </div>

      <CaseDrawer caseId={openCaseId} open={!!openCaseId} onOpenChange={(o) => !o && setOpenCaseId(null)} />
    </MainLayout>
  );
}
