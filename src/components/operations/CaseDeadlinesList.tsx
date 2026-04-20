import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, AlertTriangle, Calendar as CalIcon } from 'lucide-react';
import { useCaseDeadlines, useCreateDeadline, useUpdateDeadline, useDeleteDeadline } from '@/hooks/useCaseDeadlines';
import { format, differenceInHours, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';

export function CaseDeadlinesList({ caseId }: { caseId: string }) {
  const { data: deadlines = [] } = useCaseDeadlines(caseId);
  const create = useCreateDeadline();
  const update = useUpdateDeadline();
  const del = useDeleteDeadline();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('17:00');
  const [isFatal, setIsFatal] = useState(false);

  const handleCreate = () => {
    if (!title.trim() || !date) return;
    const due = new Date(`${date}T${time}:00`).toISOString();
    create.mutate(
      { case_id: caseId, title: title.trim(), due_date: due, is_fatal: isFatal },
      {
        onSuccess: () => {
          setOpen(false);
          setTitle('');
          setDate('');
          setIsFatal(false);
        },
      }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo prazo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo prazo</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Título</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Audiência inicial" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <Label>Hora</Label>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm">Prazo fatal</Label>
                  <p className="text-xs text-muted-foreground">Notificação intensificada</p>
                </div>
                <Switch checked={isFatal} onCheckedChange={setIsFatal} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={!title.trim() || !date || create.isPending}>
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {deadlines.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhum prazo cadastrado.</p>
      )}

      <div className="space-y-2">
        {deadlines.map((d) => {
          const done = !!d.completed_at;
          const due = new Date(d.due_date);
          let alertColor = '';
          if (!done) {
            if (isPast(due)) alertColor = 'border-red-500 bg-red-50 dark:bg-red-950/20';
            else if (differenceInHours(due, new Date()) < 72) alertColor = 'border-orange-400 bg-orange-50 dark:bg-orange-950/20';
          }
          return (
            <Card key={d.id} className={cn('p-3 flex items-start gap-3 border-l-4', alertColor || 'border-l-muted', done && 'opacity-60')}>
              <Checkbox checked={done} onCheckedChange={(c) => update.mutate({ id: d.id, complete: !!c })} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={cn('text-sm font-medium', done && 'line-through')}>{d.title}</p>
                  {d.is_fatal && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                      <AlertTriangle className="h-2.5 w-2.5" /> FATAL
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <CalIcon className="h-3 w-3" />
                  {format(due, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => del.mutate(d.id)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
