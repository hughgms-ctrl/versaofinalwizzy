import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Calendar, AlertTriangle, Clock, Bell, User } from 'lucide-react';
import { useCaseTasks, useCreateCaseTask, useUpdateCaseTask, useDeleteCaseTask } from '@/hooks/useCaseTasks';
import { useCaseTaskNotifications, useUpsertCaseTaskNotification } from '@/hooks/useCaseTaskNotifications';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { format, differenceInHours, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComp } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function CaseTasksList({ caseId }: { caseId: string }) {
  const { data: tasks = [], isLoading } = useCaseTasks(caseId);
  const create = useCreateCaseTask();
  const update = useUpdateCaseTask();
  const del = useDeleteCaseTask();
  const { data: team = [] } = useTeamMembers();
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
        {tasks.map((t: any) => (
          <TaskRow
            key={t.id}
            task={t}
            team={team}
            onUpdate={(patch) => update.mutate({ id: t.id, ...patch })}
            onToggle={(done) => update.mutate({ id: t.id, status: done ? 'done' : 'todo' })}
            onDelete={() => del.mutate(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  team,
  onUpdate,
  onToggle,
  onDelete,
}: {
  task: any;
  team: any[];
  onUpdate: (patch: any) => void;
  onToggle: (done: boolean) => void;
  onDelete: () => void;
}) {
  const [showNotif, setShowNotif] = useState(false);
  const done = task.status === 'done';
  const due = task.due_date ? new Date(task.due_date) : null;

  let dueColor = 'text-muted-foreground';
  let dueIcon: React.ReactNode = <Calendar className="h-3 w-3" />;
  if (due && !done) {
    if (isPast(due)) {
      dueColor = 'text-destructive font-medium';
      dueIcon = <AlertTriangle className="h-3 w-3" />;
    } else if (differenceInHours(due, new Date()) < 24) {
      dueColor = 'text-destructive font-medium';
      dueIcon = <Clock className="h-3 w-3" />;
    } else if (differenceInHours(due, new Date()) < 72) {
      dueColor = 'text-orange-500';
    }
  }

  const timeStr = due ? format(due, 'HH:mm') : '09:00';

  const updateDate = (newDate: Date | null, newTime?: string) => {
    if (!newDate) {
      onUpdate({ due_date: null });
      return;
    }
    const [hh, mm] = (newTime || timeStr).split(':').map(Number);
    const d = new Date(newDate);
    d.setHours(hh || 9, mm || 0, 0, 0);
    onUpdate({ due_date: d.toISOString() });
  };

  const updateTime = (newTime: string) => {
    if (!due) return;
    const [hh, mm] = newTime.split(':').map(Number);
    const d = new Date(due);
    d.setHours(hh || 0, mm || 0, 0, 0);
    onUpdate({ due_date: d.toISOString() });
  };

  return (
    <Card className={cn('p-3 space-y-2', done && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <Checkbox checked={done} onCheckedChange={(c) => onToggle(!!c)} className="mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium', done && 'line-through')}>{task.title}</p>
          {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {/* Data */}
            <Popover>
              <PopoverTrigger asChild>
                <button className={cn('flex items-center gap-1 text-xs hover:underline', dueColor)}>
                  {dueIcon}
                  {due ? format(due, "dd 'de' MMM", { locale: ptBR }) : 'Sem prazo'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComp
                  mode="single"
                  selected={due || undefined}
                  onSelect={(d) => updateDate(d || null)}
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>

            {/* Hora */}
            {due && (
              <div className="flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <Input
                  type="time"
                  value={timeStr}
                  onChange={(e) => updateTime(e.target.value)}
                  className="h-6 w-20 text-xs px-1"
                />
              </div>
            )}

            {/* Responsável */}
            <div className="flex items-center gap-1 text-xs">
              <User className="h-3 w-3 text-muted-foreground" />
              <Select
                value={task.assignee_id || 'none'}
                onValueChange={(v) => onUpdate({ assignee_id: v === 'none' ? null : v })}
              >
                <SelectTrigger className="h-6 text-xs w-36 px-2">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {team.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notificações */}
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowNotif(!showNotif)}
            >
              <Bell className="h-3 w-3" />
              Notificações
            </button>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {showNotif && <TaskNotificationConfig taskId={task.id} />}
    </Card>
  );
}

function TaskNotificationConfig({ taskId }: { taskId: string }) {
  const { data: notif } = useCaseTaskNotifications(taskId);
  const upsert = useUpsertCaseTaskNotification();
  const config = notif || {
    notify_on_create: false,
    notify_days_before: 1,
    notify_on_overdue: true,
    notify_channel: 'whatsapp',
  };

  const update = (patch: any) => upsert.mutate({ case_task_id: taskId, ...config, ...patch });

  return (
    <div className="bg-muted/40 rounded p-3 space-y-2 ml-7 border-l-2 border-primary/30">
      <p className="text-xs font-medium flex items-center gap-1">
        <Bell className="h-3 w-3" /> Notificar responsável (WhatsApp)
      </p>
      <div className="flex items-center justify-between text-xs">
        <Label htmlFor={`notif-create-${taskId}`}>Ao criar a tarefa</Label>
        <Switch
          id={`notif-create-${taskId}`}
          checked={config.notify_on_create}
          onCheckedChange={(v) => update({ notify_on_create: v })}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <Label htmlFor={`notif-days-${taskId}`}>Dias antes do vencimento</Label>
        <Input
          id={`notif-days-${taskId}`}
          type="number"
          min={0}
          value={config.notify_days_before}
          onChange={(e) => update({ notify_days_before: parseInt(e.target.value) || 0 })}
          className="h-6 w-16 text-xs"
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <Label htmlFor={`notif-overdue-${taskId}`}>Quando ficar atrasada</Label>
        <Switch
          id={`notif-overdue-${taskId}`}
          checked={config.notify_on_overdue}
          onCheckedChange={(v) => update({ notify_on_overdue: v })}
        />
      </div>
    </div>
  );
}
