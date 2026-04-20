import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useMyTasks, useAllPendingTasks, useUpdateCaseTask } from '@/hooks/useCaseTasks';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { format, differenceInHours, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Link, useLocation } from 'react-router-dom';
import { Briefcase, ListTodo, Calendar, Settings, AlertTriangle, Clock, ExternalLink, User } from 'lucide-react';
import { CaseDrawer } from '@/components/operations/CaseDrawer';

export default function MyTasksPage() {
  const { data: myTasks = [], isLoading: loadingMine } = useMyTasks();
  const { data: allTasks = [], isLoading: loadingAll } = useAllPendingTasks();
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

  // Filter by workspace
  const filterWS = (tasks: any[]) =>
    selectedWorkspaceId
      ? tasks.filter((t) => t.case?.workspace_id === selectedWorkspaceId)
      : tasks;

  const filteredMine = filterWS(myTasks);
  const filteredAll = filterWS(allTasks);

  return (
    <MainLayout title="Tarefas Operacionais" subtitle="Acompanhe tarefas pendentes">
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
              Todas as pendentes <Badge variant="secondary" className="ml-2">{filteredAll.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mine" className="space-y-2">
            <TaskList
              tasks={filteredMine}
              isLoading={loadingMine}
              showAssignee={false}
              onComplete={(id) => update.mutate({ id, status: 'done' })}
              onOpenCase={setOpenCaseId}
            />
          </TabsContent>

          <TabsContent value="all" className="space-y-2">
            <TaskList
              tasks={filteredAll}
              isLoading={loadingAll}
              showAssignee
              onComplete={(id) => update.mutate({ id, status: 'done' })}
              onOpenCase={setOpenCaseId}
            />
          </TabsContent>
        </Tabs>
      </div>

      <CaseDrawer caseId={openCaseId} open={!!openCaseId} onOpenChange={(o) => !o && setOpenCaseId(null)} />
    </MainLayout>
  );
}

function TaskList({
  tasks,
  isLoading,
  showAssignee,
  onComplete,
  onOpenCase,
}: {
  tasks: any[];
  isLoading: boolean;
  showAssignee: boolean;
  onComplete: (id: string) => void;
  onOpenCase: (id: string) => void;
}) {
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (tasks.length === 0)
    return (
      <Card className="p-12 text-center">
        <ListTodo className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-muted-foreground">Nenhuma tarefa pendente.</p>
      </Card>
    );

  // Group by case
  const byCase = tasks.reduce((acc: Record<string, { case: any; tasks: any[] }>, t: any) => {
    const cid = t.case?.id || 'sem-caso';
    if (!acc[cid]) acc[cid] = { case: t.case, tasks: [] };
    acc[cid].tasks.push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(byCase).map(([cid, group]: any) => {
        const contactName = group.case?.contact?.name || group.case?.contact?.phone || 'Sem contato';
        const contactInitials = contactName.slice(0, 2).toUpperCase();
        return (
          <Card key={cid} className="overflow-hidden">
            {/* Case header */}
            <div
              className="p-3 bg-muted/40 border-b flex items-center gap-3 cursor-pointer hover:bg-muted/60 transition"
              onClick={() => group.case?.id && onOpenCase(group.case.id)}
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={group.case?.contact?.avatar_url || undefined} />
                <AvatarFallback className="text-xs">{contactInitials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{contactName}</p>
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <Briefcase className="h-3 w-3" /> {group.case?.title || 'Sem caso'}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {group.tasks.length} {group.tasks.length === 1 ? 'tarefa' : 'tarefas'}
              </Badge>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Tasks */}
            <div className="divide-y">
              {group.tasks.map((t: any) => {
                let badge: React.ReactNode = null;
                if (t.due_date) {
                  const due = new Date(t.due_date);
                  if (isPast(due))
                    badge = (
                      <Badge variant="destructive" className="gap-1 text-[10px]">
                        <AlertTriangle className="h-3 w-3" /> Vencida
                      </Badge>
                    );
                  else if (differenceInHours(due, new Date()) < 24)
                    badge = (
                      <Badge className="bg-red-500 text-white gap-1 text-[10px]">
                        <Clock className="h-3 w-3" /> &lt; 24h
                      </Badge>
                    );
                  else if (differenceInHours(due, new Date()) < 72)
                    badge = <Badge className="bg-orange-500 text-white text-[10px]">Em breve</Badge>;
                }
                return (
                  <div
                    key={t.id}
                    className="p-3 flex items-start gap-3 hover:bg-muted/30 transition cursor-pointer"
                    onClick={() => group.case?.id && onOpenCase(group.case.id)}
                  >
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => onComplete(t.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{t.title}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                        {t.due_date && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(t.due_date), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
                          </span>
                        )}
                        {showAssignee && t.assignee?.full_name && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {t.assignee.full_name}
                          </span>
                        )}
                      </div>
                    </div>
                    {badge}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
