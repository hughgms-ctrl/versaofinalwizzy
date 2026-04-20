import { useMemo, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useMyTasks, useAllPendingTasks, useUpdateCaseTask } from '@/hooks/useCaseTasks';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Link, useLocation } from 'react-router-dom';
import {
  Briefcase,
  ListTodo,
  Calendar,
  Settings,
  AlertTriangle,
  Clock,
  Scale,
  Building2,
  Circle,
  CircleDot,
  CheckCircle2,
  ListChecks,
} from 'lucide-react';
import { CaseDrawer } from '@/components/operations/CaseDrawer';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

type TaskStatus = 'todo' | 'doing' | 'done';

const COLUMNS: { id: TaskStatus; label: string; icon: any; color: string; description: string }[] = [
  { id: 'todo', label: 'A fazer', icon: Circle, color: 'hsl(215 20% 65%)', description: 'Aguardando' },
  { id: 'doing', label: 'Fazendo', icon: CircleDot, color: 'hsl(217 91% 60%)', description: 'Em andamento' },
  { id: 'done', label: 'Concluído', icon: CheckCircle2, color: 'hsl(142 71% 45%)', description: 'Finalizadas' },
];

export default function MyTasksPage() {
  const { data: myTasks = [], isLoading: loadingMine } = useMyTasks(true);
  const { data: allTasks = [], isLoading: loadingAll } = useAllPendingTasks(true);
  const { selectedWorkspaceId } = useWorkspaceContext();
  const update = useUpdateCaseTask();
  const location = useLocation();
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);

  const tabs = [
    { href: '/operations', label: 'Casos', icon: Briefcase },
    { href: '/operations/tasks', label: 'Tarefas', icon: ListTodo },
    { href: '/operations/deadlines', label: 'Prazos', icon: Calendar },
    { href: '/operations/templates', label: 'Templates', icon: Settings },
  ];

  const filterWS = (tasks: any[]) =>
    selectedWorkspaceId
      ? tasks.filter((t) => t.case?.workspace_id === selectedWorkspaceId)
      : tasks;

  const filteredMine = filterWS(myTasks);
  const filteredAll = filterWS(allTasks);

  const handleMove = (taskId: string, newStatus: TaskStatus) => {
    update.mutate({ id: taskId, status: newStatus });
  };

  return (
    <MainLayout title="Tarefas Operacionais" subtitle="Kanban de tarefas: arraste para atualizar o status">
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

        <Tabs defaultValue="mine" className="space-y-3">
          <TabsList>
            <TabsTrigger value="mine">
              Minhas tarefas <Badge variant="secondary" className="ml-2">{filteredMine.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="all">
              Todas as tarefas <Badge variant="secondary" className="ml-2">{filteredAll.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mine">
            <TasksKanban
              tasks={filteredMine}
              isLoading={loadingMine}
              onMove={handleMove}
              onOpenCase={setOpenCaseId}
            />
          </TabsContent>

          <TabsContent value="all">
            <TasksKanban
              tasks={filteredAll}
              isLoading={loadingAll}
              showAssignee
              onMove={handleMove}
              onOpenCase={setOpenCaseId}
            />
          </TabsContent>
        </Tabs>
      </div>

      <CaseDrawer caseId={openCaseId} open={!!openCaseId} onOpenChange={(o) => !o && setOpenCaseId(null)} />
    </MainLayout>
  );
}

function TasksKanban({
  tasks,
  isLoading,
  showAssignee,
  onMove,
  onOpenCase,
}: {
  tasks: any[];
  isLoading: boolean;
  showAssignee?: boolean;
  onMove: (id: string, status: TaskStatus) => void;
  onOpenCase: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    const map: Record<TaskStatus, any[]> = { todo: [], doing: [], done: [] };
    tasks.forEach((t) => {
      const status: TaskStatus = t.completed_at
        ? 'done'
        : t.status === 'doing' || t.status === 'in_progress'
        ? 'doing'
        : t.status === 'done'
        ? 'done'
        : 'todo';
      map[status].push(t);
    });
    return map;
  }, [tasks]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const taskId = result.draggableId;
    const newStatus = result.destination.droppableId as TaskStatus;
    if (result.source.droppableId !== newStatus) onMove(taskId, newStatus);
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-12 text-center">Carregando...</p>;
  }

  if (tasks.length === 0) {
    return (
      <Card className="p-12 text-center">
        <ListTodo className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-muted-foreground">Nenhuma tarefa encontrada.</p>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[60vh]">
          {COLUMNS.map((col) => {
            const items = grouped[col.id];
            return (
              <Droppable droppableId={col.id} key={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'rounded-xl border border-border/60 bg-muted/20 transition-colors',
                      snapshot.isDraggingOver && 'bg-muted/50 border-primary/30'
                    )}
                  >
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
                      <div className="flex items-center gap-2">
                        <col.icon className="h-3.5 w-3.5" style={{ color: col.color }} />
                        <h3 className="text-sm font-semibold">{col.label}</h3>
                      </div>
                      <Badge variant="secondary" className="text-[10px] h-5">{items.length}</Badge>
                    </div>
                    <div className="p-2 space-y-2 min-h-[200px]">
                      {items.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-8 italic">
                          Arraste tarefas para cá
                        </p>
                      )}
                      {items.map((t, idx) => (
                        <Draggable draggableId={t.id} index={idx} key={t.id}>
                          {(p, snap) => (
                            <div
                              ref={p.innerRef}
                              {...p.draggableProps}
                              {...p.dragHandleProps}
                              style={p.draggableProps.style}
                            >
                              <TaskCard
                                task={t}
                                showAssignee={showAssignee}
                                isDragging={snap.isDragging}
                                isDone={col.id === 'done'}
                                onOpenCase={onOpenCase}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>
    </TooltipProvider>
  );
}

function TaskCard({
  task,
  showAssignee,
  isDragging,
  isDone,
  onOpenCase,
}: {
  task: any;
  showAssignee?: boolean;
  isDragging: boolean;
  isDone: boolean;
  onOpenCase: (id: string) => void;
}) {
  const contactName = task.case?.contact?.name || task.case?.contact?.phone || 'Sem contato';
  const contactInitials = contactName.slice(0, 2).toUpperCase();
  const KindIcon = task.case?.kind === 'judicial' ? Scale : Building2;

  let dueLabel: React.ReactNode = null;
  if (task.due_date && !isDone) {
    const due = new Date(task.due_date);
    if (isPast(due)) {
      dueLabel = (
        <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 text-destructive px-1.5 py-0.5 text-[10px] font-medium">
          <AlertTriangle className="h-2.5 w-2.5" /> Vencida
        </span>
      );
    } else {
      dueLabel = (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-2.5 w-2.5" />
          {format(due, "dd/MM HH:mm", { locale: ptBR })}
        </span>
      );
    }
  }

  const assigneeName = task.assignee?.full_name;
  const assigneeInitials = assigneeName
    ? assigneeName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : '';

  return (
    <Card
      onClick={() => task.case?.id && onOpenCase(task.case.id)}
      className={cn(
        'p-3 cursor-pointer rounded-lg border-border/60 hover:border-border hover:shadow-sm transition-all space-y-2',
        isDragging && 'shadow-lg rotate-1',
        isDone && 'opacity-70'
      )}
    >
      <div className="flex items-start gap-2">
        <Avatar className="h-7 w-7 flex-shrink-0">
          <AvatarImage src={task.case?.contact?.avatar_url || undefined} />
          <AvatarFallback className="text-[10px] bg-muted font-medium">{contactInitials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-muted-foreground truncate">{contactName}</p>
          <p className={cn('text-[13px] font-medium leading-tight line-clamp-2', isDone && 'line-through')}>
            {task.title}
          </p>
        </div>
      </div>

      {task.case?.title && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-1 truncate">
              <KindIcon className="h-2.5 w-2.5 flex-shrink-0" />
              <span className="truncate">{task.case.title}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>{task.case.title}</TooltipContent>
        </Tooltip>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {dueLabel}
          {isDone && task.completed_at && (
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(task.completed_at), { locale: ptBR, addSuffix: true })}
            </span>
          )}
        </div>
        {showAssignee && assigneeName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-5 w-5 ring-1 ring-border flex-shrink-0">
                <AvatarImage src={task.assignee?.avatar_url || undefined} />
                <AvatarFallback className="text-[8px] font-medium">{assigneeInitials}</AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>{assigneeName}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </Card>
  );
}
