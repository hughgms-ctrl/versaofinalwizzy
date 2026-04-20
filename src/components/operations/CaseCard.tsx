import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PipelineChatModal } from '@/components/pipeline/PipelineChatModal';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow, differenceInHours, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCaseTasks, useUpdateCaseTask } from '@/hooks/useCaseTasks';
import type { OperationsCase } from '@/types/operations';

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
  // Borda lateral segue a cor do workspace; se não houver, usa a cor da categoria; se não, primary
  const accentColor = case_.workspace?.color || case_.category?.color || 'hsl(var(--primary))';
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
          'group relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-none',
          'hover:shadow-md hover:border-border transition-all duration-200 cursor-pointer',
          isDone && 'opacity-60'
        )}
        onClick={onClick}
      >
        {/* Accent bar lateral fina */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ backgroundColor: accentColor }}
        />

        <div className="p-4 pl-[14px] space-y-3">
          {/* Header: avatar + contato + categoria + chat */}
          <div className="flex items-start gap-2.5">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarImage src={case_.contact?.avatar_url || undefined} />
              <AvatarFallback className="text-[11px] bg-muted text-foreground/70 font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate leading-tight">
                {contactName}
              </p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                    <Icon className="h-2.5 w-2.5" style={{ color: accentColor }} />
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
                      <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center leading-none">
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
              <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
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
                <div className="space-y-1.5">
                  <div className="h-[3px] bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all rounded-full"
                      style={{
                        width: `${progress}%`,
                        backgroundColor: progress === 100 ? 'hsl(var(--primary))' : accentColor,
                      }}
                    />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {taskStats.done} de {taskStats.total} tarefas concluídas
              </TooltipContent>
            </Tooltip>
          )}

          {/* Footer minimalista */}
          <div className="flex items-center justify-between pt-1">
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
    </TooltipProvider>
  );
}

function InlineTaskList({ caseId }: { caseId: string }) {
  const { data: tasks = [], isLoading } = useCaseTasks(caseId);
  const update = useUpdateCaseTask();

  if (isLoading) return <p className="text-[10px] text-muted-foreground">Carregando...</p>;
  if (tasks.length === 0) return <p className="text-[10px] text-muted-foreground italic">Sem tarefas</p>;

  return (
    <div
      className="space-y-1.5 max-h-48 overflow-y-auto rounded-lg bg-muted/30 p-2 mt-1"
      onClick={(e) => e.stopPropagation()}
    >
      {tasks.slice(0, 10).map((t: any) => {
        const isDone = t.status === 'done' || !!t.completed_at;
        const isOverdue = t.due_date && !isDone && isPast(new Date(t.due_date));
        return (
          <div key={t.id} className="flex items-start gap-2 text-[11px]">
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
          </div>
        );
      })}
      {tasks.length > 10 && (
        <p className="text-[10px] text-muted-foreground italic">+{tasks.length - 10} tarefas</p>
      )}
      <div className="pt-1">
        <Button size="sm" variant="ghost" className="h-6 text-[10px] w-full">
          Abrir caso completo
        </Button>
      </div>
    </div>
  );
}
