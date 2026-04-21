import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PipelineChatModal } from '@/components/pipeline/PipelineChatModal';
import { ContactAvatar } from '@/components/conversations/ContactAvatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Scale,
  Building2,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  ListTodo,
  MessageSquare,
  Plus,
  Bell,
  CalendarClock,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow, differenceInHours, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  useCaseTasks,
  useUpdateCaseTask,
  useCreateCaseTask,
} from '@/hooks/useCaseTasks';
import {
  useCaseTaskNotifications,
  useUpsertCaseTaskNotification,
} from '@/hooks/useCaseTaskNotifications';
import type { OperationsCase } from '@/types/operations';

function formatPhoneNumber(phone: string) {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 13) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  if (cleaned.length === 12) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
  }
  return phone;
}

interface CaseCardProps {
  case_: OperationsCase & {
    contact?: { name: string | null; phone: string; avatar_url: string | null };
    category?: { name: string; kind: string; color: string | null };
    assignee?: { full_name: string | null; avatar_url: string | null };
    workspace?: { id: string; name: string; color: string | null } | null;
    conversation?: { id: string; unread_count: number } | null;
  };
  taskStats?: { total: number; done: number; nextDue?: string | null };
  onClick?: () => void;
}

const priorityStyle: Record<string, { label: string; className: string }> = {
  urgent: { label: 'Urgente', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  high: { label: 'Alta', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
  low: { label: 'Baixa', className: 'bg-muted text-muted-foreground border-transparent' },
};

export function CaseCard({ case_, taskStats, onClick }: CaseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const Icon = case_.kind === 'judicial' ? Scale : Building2;
  const contactName = case_.contact?.name || case_.contact?.phone || 'Sem contato';
  const initials = contactName.slice(0, 2).toUpperCase();
  const isDone = !!case_.closed_at;
  const unreadCount = case_.conversation?.unread_count || 0;
  const conversationId = case_.conversation?.id;
  const contactId = (case_ as any).contact_id || (case_ as any).contact?.id;
  const hasChat = !!(conversationId || contactId);

  const { data: conversationFull } = useQuery({
    queryKey: ['case-card-conversation', conversationId, contactId],
    enabled: chatOpen && hasChat,
    queryFn: async () => {
      let q = (supabase as any).from('conversations').select('*, contact:contacts(*)');
      if (conversationId) q = q.eq('id', conversationId);
      else q = q.eq('contact_id', contactId).order('last_message_at', { ascending: false }).limit(1);
      const { data } = await q.maybeSingle();
      return data;
    },
  });

  // Prazo
  let dueBadge: React.ReactNode = null;
  if (taskStats?.nextDue) {
    const due = new Date(taskStats.nextDue);
    const hours = differenceInHours(due, new Date());
    if (isPast(due)) {
      dueBadge = (
        <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 text-destructive px-1.5 py-0.5 text-[10px] font-medium">
          <AlertTriangle className="h-2.5 w-2.5" /> Vencida
        </span>
      );
    } else if (hours < 24) {
      dueBadge = (
        <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 text-destructive px-1.5 py-0.5 text-[10px] font-medium">
          <Clock className="h-2.5 w-2.5" /> {hours}h
        </span>
      );
    } else if (hours < 72) {
      dueBadge = (
        <span className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 text-[10px] font-medium">
          <Clock className="h-2.5 w-2.5" /> {Math.ceil(hours / 24)}d
        </span>
      );
    }
  }

  const progress = taskStats && taskStats.total > 0 ? (taskStats.done / taskStats.total) * 100 : 0;
  const assigneeName = case_.assignee?.full_name;
  const assigneeInitials = assigneeName
    ? assigneeName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '';
  const priority = priorityStyle[case_.priority];

  return (
    <TooltipProvider delayDuration={300}>
      <Card
        className={cn(
          'group relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-b from-card to-card/60 backdrop-blur-sm shadow-sm',
          'hover:shadow-lg hover:border-border hover:-translate-y-0.5 transition-all duration-200 cursor-pointer',
          isDone && 'opacity-60'
        )}
        onClick={onClick}
      >
        <div className="p-3.5 space-y-2.5">
          {/* Header: avatar + nome + chat */}
          <div className="flex items-start gap-2.5">
            <Avatar className="h-9 w-9 flex-shrink-0 ring-2 ring-background shadow-sm">
              <AvatarImage src={case_.contact?.avatar_url || undefined} />
              <AvatarFallback className="text-[11px] font-semibold text-primary-foreground bg-gradient-to-br from-primary to-primary/80">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground truncate leading-tight">
                {contactName}
              </p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium border bg-primary/10 text-primary border-primary/20">
                    <Icon className="h-2.5 w-2.5" />
                    {case_.category?.name || (case_.kind === 'judicial' ? 'Judicial' : 'Administrativo')}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{case_.contact?.phone}</TooltipContent>
              </Tooltip>
            </div>
            {hasChat && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setChatOpen(true);
                    }}
                    className="relative inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0"
                    aria-label="Abrir conversa"
                  >
                    <MessageSquare className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center leading-none ring-2 ring-card">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {unreadCount > 0 ? `Abrir conversa (${unreadCount} não lidas)` : 'Abrir conversa'}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Título do caso */}
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-[13px] font-medium text-foreground/90 line-clamp-2 leading-snug">
                {case_.title}
              </p>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{case_.title}</TooltipContent>
          </Tooltip>

          {/* Metadados sutis */}
          {(priority || dueBadge) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {priority && (
                <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium', priority.className)}>
                  {priority.label}
                </span>
              )}
              {dueBadge}
            </div>
          )}

          {/* Barra de progresso fina */}
          {taskStats && taskStats.total > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="h-1 w-full bg-muted/60 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-500 rounded-full bg-primary"
                    style={{ width: `${Math.max(progress, 2)}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {taskStats.done} de {taskStats.total} tarefas concluídas
              </TooltipContent>
            </Tooltip>
          )}

          {/* Footer minimalista */}
          <div className="flex items-center justify-between pt-0.5">
            <div className="flex items-center gap-2">
              {assigneeName && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Avatar className="h-5 w-5 ring-1 ring-border">
                      <AvatarImage src={case_.assignee?.avatar_url || undefined} />
                      <AvatarFallback className="text-[8px] font-medium">{assigneeInitials}</AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent>Responsável: {assigneeName}</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(case_.opened_at), { locale: ptBR, addSuffix: false })}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Aberto em {format(new Date(case_.opened_at), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="flex items-center gap-1">
              {taskStats && taskStats.total > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(!expanded);
                      }}
                      className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors rounded px-1 py-0.5"
                    >
                      <ListTodo className="h-3 w-3" />
                      <span className="tabular-nums">{taskStats.done}/{taskStats.total}</span>
                      {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{expanded ? 'Esconder tarefas' : 'Ver tarefas'}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          {expanded && <InlineTaskList caseId={case_.id} />}
        </div>
      </Card>
      {hasChat && conversationFull && (
        <PipelineChatModal
          conversation={conversationFull as any}
          open={chatOpen}
          onOpenChange={setChatOpen}
        />
      )}
    </TooltipProvider>
  );
}

function InlineTaskList({ caseId }: { caseId: string }) {
  const { data: tasks = [], isLoading } = useCaseTasks(caseId);
  const update = useUpdateCaseTask();
  const create = useCreateCaseTask();

  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newReminderDays, setNewReminderDays] = useState('1');

  const resetForm = () => {
    setNewTitle('');
    setNewDate('');
    setNewTime('');
    setNewReminderDays('1');
    setAdding(false);
  };

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    let due: string | null = null;
    if (newDate) {
      const time = newTime || '09:00';
      due = new Date(`${newDate}T${time}:00`).toISOString();
    }
    create.mutate(
      { case_id: caseId, title: newTitle.trim(), due_date: due },
      {
        onSuccess: () => {
          // Notificação será associada via useCaseTaskNotifications quando o usuário abrir
          // (criação avulsa: lembrete configurado já entra como days_before na nova tarefa)
          resetForm();
        },
      }
    );
  };

  if (isLoading) return <p className="text-[10px] text-muted-foreground">Carregando...</p>;

  return (
    <div
      className="space-y-1.5 max-h-72 overflow-y-auto rounded-lg bg-muted/30 p-2 mt-1"
      onClick={(e) => e.stopPropagation()}
    >
      {tasks.length === 0 && !adding && (
        <p className="text-[10px] text-muted-foreground italic px-1">Sem tarefas</p>
      )}

      {tasks.slice(0, 10).map((t: any) => {
        const isDone = t.status === 'done' || !!t.completed_at;
        const isOverdue = t.due_date && !isDone && isPast(new Date(t.due_date));
        return (
          <div key={t.id} className="flex items-start gap-2 text-[11px] group/task">
            <Checkbox
              checked={isDone}
              onCheckedChange={(c) => update.mutate({ id: t.id, status: c ? 'done' : 'todo' })}
              className="h-3.5 w-3.5 mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <span className={cn('block leading-tight', isDone && 'line-through text-muted-foreground')}>
                {t.title}
              </span>
              {t.due_date && !isDone && (
                <span
                  className={cn(
                    'text-[10px] flex items-center gap-1 mt-0.5',
                    isOverdue ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  <Clock className="h-2.5 w-2.5" />
                  {format(new Date(t.due_date), "dd/MM HH:mm", { locale: ptBR })}
                </span>
              )}
            </div>
            <TaskScheduleEditor task={t} />
          </div>
        );
      })}
      {tasks.length > 10 && (
        <p className="text-[10px] text-muted-foreground italic">+{tasks.length - 10} tarefas</p>
      )}

      {adding ? (
        <div className="space-y-2 rounded-md border border-border/60 bg-card/60 p-2 mt-1">
          <Input
            autoFocus
            placeholder="Título da tarefa"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="h-7 text-[11px]"
          />
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <Label className="text-[9px] text-muted-foreground uppercase tracking-wide">Data</Label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="h-7 text-[11px]"
              />
            </div>
            <div>
              <Label className="text-[9px] text-muted-foreground uppercase tracking-wide">Hora</Label>
              <Input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="h-7 text-[11px]"
              />
            </div>
          </div>
          <div>
            <Label className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Bell className="h-2.5 w-2.5" /> Lembrete (dias antes)
            </Label>
            <Input
              type="number"
              min="0"
              value={newReminderDays}
              onChange={(e) => setNewReminderDays(e.target.value)}
              className="h-7 text-[11px]"
            />
          </div>
          <div className="flex items-center gap-1.5 pt-0.5">
            <Button
              size="sm"
              className="h-7 text-[10px] flex-1"
              onClick={handleAdd}
              disabled={!newTitle.trim() || create.isPending}
            >
              Salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[10px]"
              onClick={resetForm}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[10px] w-full mt-1 gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3 w-3" /> Adicionar tarefa
        </Button>
      )}
    </div>
  );
}

function TaskScheduleEditor({ task }: { task: any }) {
  const update = useUpdateCaseTask();
  const { data: notif } = useCaseTaskNotifications(task.id);
  const upsertNotif = useUpsertCaseTaskNotification();

  const initialDate = task.due_date ? format(new Date(task.due_date), 'yyyy-MM-dd') : '';
  const initialTime = task.due_date ? format(new Date(task.due_date), 'HH:mm') : '';
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [days, setDays] = useState(String(notif?.notify_days_before ?? 1));
  const [open, setOpen] = useState(false);

  const handleSave = () => {
    let due: string | null = null;
    if (date) {
      const t = time || '09:00';
      due = new Date(`${date}T${t}:00`).toISOString();
    }
    update.mutate({ id: task.id, due_date: due } as any);
    upsertNotif.mutate({
      case_task_id: task.id,
      notify_on_create: false,
      notify_days_before: parseInt(days || '0', 10),
      notify_on_overdue: true,
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) {
        setDate(initialDate);
        setTime(initialTime);
        setDays(String(notif?.notify_days_before ?? 1));
      }
    }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="opacity-0 group-hover/task:opacity-100 transition-opacity h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
          aria-label="Editar prazo e lembrete"
        >
          <CalendarClock className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <Label className="text-[9px] text-muted-foreground uppercase tracking-wide">Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-7 text-[11px]" />
          </div>
          <div>
            <Label className="text-[9px] text-muted-foreground uppercase tracking-wide">Hora</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-7 text-[11px]" />
          </div>
        </div>
        <div>
          <Label className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Bell className="h-2.5 w-2.5" /> Lembrete (dias antes)
          </Label>
          <Input
            type="number"
            min="0"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="h-7 text-[11px]"
          />
        </div>
        <Button size="sm" className="h-7 text-[10px] w-full" onClick={handleSave}>
          Salvar
        </Button>
      </PopoverContent>
    </Popover>
  );
}
