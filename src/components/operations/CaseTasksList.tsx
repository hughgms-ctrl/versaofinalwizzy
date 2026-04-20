import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Calendar, AlertTriangle, Clock } from 'lucide-react';
import { useCaseTasks, useCreateCaseTask, useUpdateCaseTask, useDeleteCaseTask } from '@/hooks/useCaseTasks';
import { format, differenceInHours, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComp } from '@/components/ui/calendar';

export function CaseTasksList({ caseId }: { caseId: string }) {
  const { data: tasks = [], isLoading } = useCaseTasks(caseId);
  const create = useCreateCaseTask();
  const update = useUpdateCaseTask();
  const del = useDeleteCaseTask();
  const [newTitle, setNewTitle] = useState('');

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    create.mutate({ case_id: caseId, title: newTitle.trim() }, { onSuccess: () => setNewTitle('') });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Adicionar nova tarefa..."
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Button onClick={handleAdd} disabled={!newTitle.trim() || create.isPending}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!isLoading && tasks.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma tarefa ainda.</p>
      )}

      <div className="space-y-2">
        {tasks.map((t) => {
          const done = t.status === 'done';
          let dueColor = 'text-muted-foreground';
          let dueIcon: React.ReactNode = <Calendar className="h-3 w-3" />;
          if (t.due_date && !done) {
            const due = new Date(t.due_date);
            if (isPast(due)) {
              dueColor = 'text-red-600 font-medium';
              dueIcon = <AlertTriangle className="h-3 w-3" />;
            } else if (differenceInHours(due, new Date()) < 24) {
              dueColor = 'text-red-500 font-medium';
              dueIcon = <Clock className="h-3 w-3" />;
            } else if (differenceInHours(due, new Date()) < 72) {
              dueColor = 'text-orange-500';
            }
          }

          return (
            <Card key={t.id} className={cn('p-3 flex items-start gap-3', done && 'opacity-60')}>
              <Checkbox
                checked={done}
                onCheckedChange={(c) =>
                  update.mutate({ id: t.id, status: c ? 'done' : 'todo' })
                }
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm', done && 'line-through')}>{t.title}</p>
                {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                <div className="flex items-center gap-3 mt-1.5">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={cn('flex items-center gap-1 text-xs hover:underline', dueColor)}>
                        {dueIcon}
                        {t.due_date
                          ? format(new Date(t.due_date), "dd 'de' MMM, HH:mm", { locale: ptBR })
                          : 'Sem prazo'}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComp
                        mode="single"
                        selected={t.due_date ? new Date(t.due_date) : undefined}
                        onSelect={(d) =>
                          update.mutate({ id: t.id, due_date: d ? d.toISOString() : null })
                        }
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => del.mutate(t.id)}
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
