import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/fluzz/components/ui/card";
import { Badge } from "@/fluzz/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock, TrendingUp, User } from "lucide-react";
import { formatDateBR, formatUserName, isTaskOverdue } from "@/fluzz/lib/utils";
import { ScrollArea } from "@/fluzz/components/ui/scroll-area";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  assigned_to: string | null;
}

interface ProjectDashboardProps {
  tasks: Task[];
  onFilterClick: (filterType: string, filterValue: string) => void;
}

export function ProjectDashboard({ tasks, onFilterClick }: ProjectDashboardProps) {
  const navigate = useNavigate();

  // Get unique user IDs from tasks
  const userIds = useMemo(() => {
    const ids = tasks
      .map(t => t.assigned_to)
      .filter((id): id is string => id !== null);
    return [...new Set(ids)];
  }, [tasks]);

  // Fetch profiles for all assigned users
  const { data: profiles } = useQuery({
    queryKey: ["task-user-profiles", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      return data || [];
    },
  });

  // Create a map of user ID to formatted name
  const userNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    profiles?.forEach(profile => {
      map[profile.id] = formatUserName(profile.full_name) || `Usuário`;
    });
    return map;
  }, [profiles]);

  const metrics = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const overdue = tasks.filter((task) => isTaskOverdue(task.due_date, task.status));

    const completed = tasks.filter((task) => task.status === "completed");
    const pending = tasks.filter(
      (task) => task.status === "todo" || task.status === "in_progress"
    );

    // Group tasks by assigned user
    const tasksByUser = tasks.reduce((acc, task) => {
      const userId = task.assigned_to || "unassigned";
      if (!acc[userId]) {
        acc[userId] = { todo: 0, in_progress: 0, completed: 0 };
      }
      if (task.status === "todo") acc[userId].todo++;
      else if (task.status === "in_progress") acc[userId].in_progress++;
      else if (task.status === "completed") acc[userId].completed++;
      return acc;
    }, {} as Record<string, { todo: number; in_progress: number; completed: number }>);

    const userDistribution = Object.entries(tasksByUser).map(([userId, counts]) => ({
      userId,
      userName: userId === "unassigned" ? "Não atribuído" : (userNameMap[userId] || "Usuário"),
      todo: counts.todo,
      inProgress: counts.in_progress,
      completed: counts.completed,
      total: counts.todo + counts.in_progress + counts.completed,
    }));

    const completionRate =
      tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

    return {
      overdue,
      completed,
      pending,
      userDistribution,
      completionRate,
      total: tasks.length,
      todoCount: tasks.filter((t) => t.status === "todo").length,
      inProgressCount: tasks.filter((t) => t.status === "in_progress").length,
    };
  }, [tasks, userNameMap]);

  const MetricCard = ({
    title,
    value,
    icon: Icon,
    color,
    description,
    onClick,
  }: {
    title: string;
    value: number;
    icon: any;
    color: string;
    description: string;
    onClick: () => void;
  }) => (
    <Card
      className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-[1.02]"
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );

  return (
    <ScrollArea className="h-[calc(100vh-280px)] pr-4">
      <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Tarefas Atrasadas"
          value={metrics.overdue.length}
          icon={AlertCircle}
          color="text-destructive"
          description={
            metrics.overdue.length > 0
              ? "Requerem atenção imediata"
              : "Nenhuma tarefa atrasada"
          }
          onClick={() => onFilterClick("dueDate", "overdue")}
        />
        <MetricCard
          title="Tarefas Concluídas"
          value={metrics.completed.length}
          icon={CheckCircle2}
          color="text-green-600"
          description={`${metrics.completionRate}% do projeto concluído`}
          onClick={() => onFilterClick("status", "completed")}
        />
        <MetricCard
          title="Em Andamento"
          value={metrics.inProgressCount}
          icon={TrendingUp}
          color="text-blue-600"
          description="Tarefas em execução"
          onClick={() => onFilterClick("status", "in_progress")}
        />
        <MetricCard
          title="A Fazer"
          value={metrics.todoCount}
          icon={Clock}
          color="text-orange-600"
          description="Aguardando início"
          onClick={() => onFilterClick("status", "todo")}
        />
      </div>

      {/* Data Tables Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Status Distribution - Table */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Status</CardTitle>
            <CardDescription>
              Quantidade de tarefas em cada estado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-center py-2 px-2">Quantidade</th>
                    <th className="text-center py-2 px-2">Porcentagem</th>
                  </tr>
                </thead>
                <tbody>
                  <tr 
                    className="border-b hover:bg-muted/50 cursor-pointer"
                    onClick={() => onFilterClick("status", "todo")}
                  >
                    <td className="py-3 px-2 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-blue-500" />
                        A Fazer
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <Badge variant="secondary" className="bg-blue-500/20 text-blue-600">{metrics.todoCount}</Badge>
                    </td>
                    <td className="text-center py-3 px-2 text-muted-foreground">
                      {metrics.total > 0 ? Math.round((metrics.todoCount / metrics.total) * 100) : 0}%
                    </td>
                  </tr>
                  <tr 
                    className="border-b hover:bg-muted/50 cursor-pointer"
                    onClick={() => onFilterClick("status", "in_progress")}
                  >
                    <td className="py-3 px-2 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-yellow-500" />
                        Fazendo
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600">{metrics.inProgressCount}</Badge>
                    </td>
                    <td className="text-center py-3 px-2 text-muted-foreground">
                      {metrics.total > 0 ? Math.round((metrics.inProgressCount / metrics.total) * 100) : 0}%
                    </td>
                  </tr>
                  <tr 
                    className="border-b hover:bg-muted/50 cursor-pointer"
                    onClick={() => onFilterClick("status", "completed")}
                  >
                    <td className="py-3 px-2 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-green-500" />
                        Feito
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <Badge variant="secondary" className="bg-green-500/20 text-green-600">{metrics.completed.length}</Badge>
                    </td>
                    <td className="text-center py-3 px-2 text-muted-foreground">
                      {metrics.total > 0 ? Math.round((metrics.completed.length / metrics.total) * 100) : 0}%
                    </td>
                  </tr>
                </tbody>
              </table>
              
              {/* Progress Bar */}
              <div className="pt-2">
                <div className="w-full bg-secondary rounded-full h-3 overflow-hidden flex">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${metrics.total > 0 ? (metrics.todoCount / metrics.total) * 100 : 0}%` }}
                  />
                  <div 
                    className="h-full bg-yellow-500 transition-all duration-500"
                    style={{ width: `${metrics.total > 0 ? (metrics.inProgressCount / metrics.total) * 100 : 0}%` }}
                  />
                  <div 
                    className="h-full bg-green-500 transition-all duration-500"
                    style={{ width: `${metrics.total > 0 ? (metrics.completed.length / metrics.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Distribution - Table */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Responsável</CardTitle>
            <CardDescription>
              Quantidade de tarefas por status para cada membro
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[300px] overflow-y-auto scrollbar-discrete">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr>
                    <th className="text-left py-2 px-2">Responsável</th>
                    <th className="text-center py-2 px-2">A fazer</th>
                    <th className="text-center py-2 px-2">Fazendo</th>
                    <th className="text-center py-2 px-2">Feito</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.userDistribution.length > 0 ? (
                    metrics.userDistribution.map((user) => (
                      <tr key={user.userId} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-2 font-medium">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-3 w-3 text-primary" />
                            </div>
                            {user.userName}
                          </div>
                        </td>
                        <td className="text-center py-2 px-2">
                          <Badge variant={user.todo > 0 ? "default" : "outline"} className="bg-blue-500/80">{user.todo}</Badge>
                        </td>
                        <td className="text-center py-2 px-2">
                          <Badge variant={user.inProgress > 0 ? "default" : "outline"} className="bg-yellow-500/80">{user.inProgress}</Badge>
                        </td>
                        <td className="text-center py-2 px-2">
                          <Badge variant="outline" className="text-green-600">{user.completed}</Badge>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="text-center py-4 text-muted-foreground">
                        Nenhuma tarefa atribuída
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Tasks List */}
      {metrics.overdue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Tarefas Atrasadas
              <Badge variant="destructive">{metrics.overdue.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metrics.overdue.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg hover:bg-destructive/10 transition-colors cursor-pointer"
                  onClick={() => navigate(`/tools/wizzy-flow/tasks/${task.id}`)}
                >
                  <div className="flex-1">
                    <p className="font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Vencimento:{" "}
                      {task.due_date
                        ? formatDateBR(task.due_date)
                        : "Sem prazo"}
                    </p>
                  </div>
                  <Badge variant="destructive">Atrasada</Badge>
                </div>
              ))}
              {metrics.overdue.length > 5 && (
                <button
                  onClick={() => onFilterClick("dueDate", "overdue")}
                  className="text-sm text-primary hover:underline w-full text-center pt-2"
                >
                  Ver todas as {metrics.overdue.length} tarefas atrasadas
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completion Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Resumo Geral</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Total de Tarefas
              </span>
              <span className="text-2xl font-bold">{metrics.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Taxa de Conclusão
              </span>
              <span className="text-2xl font-bold text-green-600">
                {metrics.completionRate}%
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-green-600 transition-all duration-500"
                style={{ width: `${metrics.completionRate}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-4 pt-2">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">A Fazer</div>
                <div className="text-lg font-semibold">
                  {metrics.todoCount}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Fazendo</div>
                <div className="text-lg font-semibold">
                  {metrics.inProgressCount}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Feito</div>
                <div className="text-lg font-semibold text-green-600">
                  {metrics.completed.length}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </ScrollArea>
  );
}
