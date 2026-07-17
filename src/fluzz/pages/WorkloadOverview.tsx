import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/fluzz/components/ui/card";
import { Badge } from "@/fluzz/components/ui/badge";
import { Button } from "@/fluzz/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/fluzz/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fluzz/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/fluzz/components/ui/table";
import { ScrollArea, ScrollBar } from "@/fluzz/components/ui/scroll-area";

import { 
  AlertTriangle, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Flame, 
  Users,
  User,
  CheckCircle2,
  Circle,
  ArrowUpRight
} from "lucide-react";
import { 
  format, 
  startOfWeek,
  endOfWeek,
  eachDayOfInterval, 
  isSameDay, 
  isToday, 
  addDays,
  startOfDay,
  parseISO
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseDateOnly, isTaskOverdue, formatUserName } from "@/fluzz/lib/utils";
import { useNavigate } from "react-router-dom";

interface TaskWithAssignee {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  assigned_to: string | null;
  project_id: string | null;
  projects: {
    id: string;
    name: string;
  } | null;
}

interface MemberWorkload {
  userId: string;
  name: string;
  fullName: string;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  highPriorityTasks: number;
  tasksByDay: { [date: string]: number };
  overloadedDays: number;
}

export default function WorkloadOverview() {
  const { workspace, isAdmin, isGestor } = useWorkspace();
  const navigate = useNavigate();
  const today = startOfDay(new Date());
  const [viewOffset, setViewOffset] = useState(0);
  const [selectedMember, setSelectedMember] = useState<string>("all");
  
  // NOTE: All hooks must be called before any conditional returns!

  // Fetch workspace members
  const { data: members } = useQuery({
    queryKey: ["workload-members", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      
      const { data: workspaceMembers } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspace.id);
      
      if (!workspaceMembers?.length) return [];
      
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, full_name")
        .in("user_id", workspaceMembers.map(m => m.user_id));
      
      return profiles || [];
    },
    enabled: !!workspace,
  });

  // Fetch all tasks (excluding draft projects)
  const { data: allTasks, isLoading } = useQuery({
    queryKey: ["workload-tasks", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      
      // Get non-draft, non-archived project IDs
      const { data: activeProjects } = await supabase
        .from("projects")
        .select("id")
        .eq("workspace_id", workspace.id)
        .eq("archived", false)
        .neq("pending_notifications", true);
      
      const projectIds = activeProjects?.map(p => p.id) || [];
      
      // Fetch project tasks
      let projectTasks: TaskWithAssignee[] = [];
      if (projectIds.length > 0) {
        const { data } = await supabase
          .from("tasks")
          .select(`
            id, title, status, priority, due_date, assigned_to, project_id,
            projects(id, name)
          `)
          .in("project_id", projectIds);
        projectTasks = (data || []) as TaskWithAssignee[];
      }
      
      // Fetch standalone tasks (by workspace_id now)
      const { data: standaloneTasks } = await supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, assigned_to, project_id")
        .is("project_id", null)
        .is("routine_id", null)
        .eq("workspace_id", workspace.id);
      
      // Fetch routine tasks (by workspace_id now)
      const { data: routineTasks } = await supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, assigned_to, project_id")
        .not("routine_id", "is", null)
        .eq("workspace_id", workspace.id);
      
      return [
        ...projectTasks,
        ...((standaloneTasks || []).map(t => ({ ...t, projects: null })) as TaskWithAssignee[]),
        ...((routineTasks || []).map(t => ({ ...t, projects: null })) as TaskWithAssignee[])
      ];
    },
    enabled: !!workspace,
  });

  // Calculate date range - 90 days total (30 before today + 60 after) with offset navigation
  const totalDays = 90;
  const viewStart = addDays(today, -30 + viewOffset);
  const dateRange = useMemo(() => {
    return Array.from({ length: totalDays }, (_, i) => addDays(viewStart, i));
  }, [viewStart, totalDays]);

  // Calculate workload per member
  const memberWorkloads = useMemo((): MemberWorkload[] => {
    if (!allTasks || !members) return [];
    
    const OVERLOAD_THRESHOLD = 4; // >4 tasks = overload
    
    return members.map(member => {
      const memberTasks = allTasks.filter(t => t.assigned_to === member.user_id);
      const pendingTasks = memberTasks.filter(t => t.status !== "completed");
      const completedTasks = memberTasks.filter(t => t.status === "completed");
      const overdueTasks = memberTasks.filter(t => isTaskOverdue(t.due_date, t.status));
      const highPriorityTasks = pendingTasks.filter(t => t.priority === "high");
      
      // Calculate tasks by day for the week
      const tasksByDay: { [date: string]: number } = {};
      let overloadedDays = 0;
      
      dateRange.forEach(date => {
        const dateStr = format(date, "yyyy-MM-dd");
        const tasksOnDay = pendingTasks.filter(t => {
          if (!t.due_date) return false;
          const dueDate = parseDateOnly(t.due_date);
          return dueDate && isSameDay(dueDate, date);
        }).length;
        tasksByDay[dateStr] = tasksOnDay;
        if (tasksOnDay > OVERLOAD_THRESHOLD) overloadedDays++;
      });
      
      return {
        userId: member.user_id,
        name: formatUserName(member.full_name) || "Usuário",
        fullName: member.full_name || "Usuário",
        totalTasks: memberTasks.length,
        completedTasks: completedTasks.length,
        pendingTasks: pendingTasks.length,
        overdueTasks: overdueTasks.length,
        highPriorityTasks: highPriorityTasks.length,
        tasksByDay,
        overloadedDays,
      };
    }).sort((a, b) => b.pendingTasks - a.pendingTasks); // Sort by pending tasks desc
  }, [allTasks, members, dateRange]);

  // Global stats
  const globalStats = useMemo(() => {
    const totalOverdue = memberWorkloads.reduce((acc, m) => acc + m.overdueTasks, 0);
    const totalPending = memberWorkloads.reduce((acc, m) => acc + m.pendingTasks, 0);
    const totalOverloadedDays = memberWorkloads.reduce((acc, m) => acc + m.overloadedDays, 0);
    const membersWithOverload = memberWorkloads.filter(m => m.overloadedDays > 0).length;
    
    return { totalOverdue, totalPending, totalOverloadedDays, membersWithOverload };
  }, [memberWorkloads]);

  // Navigation handlers - move by 7 days (1 week)
  const navigatePrev = () => setViewOffset(prev => prev - 7);
  const navigateNext = () => setViewOffset(prev => prev + 7);
  const goToToday = () => setViewOffset(0);

  // Get filtered tasks for the selected member or all
  const filteredTasks = useMemo(() => {
    if (!allTasks) return [];
    if (selectedMember === "all") return allTasks;
    return allTasks.filter(t => t.assigned_to === selectedMember);
  }, [allTasks, selectedMember]);

  // Tasks grouped by due date for list view
  const tasksByDate = useMemo(() => {
    const grouped: { [date: string]: TaskWithAssignee[] } = {};
    
    filteredTasks.forEach(task => {
      if (!task.due_date) return;
      const dateKey = task.due_date;
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(task);
    });
    
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, tasks]) => ({ date, tasks }));
  }, [filteredTasks]);

  // Check access - only admin and gestor can access (must be after all hooks)
  if (!isAdmin && !isGestor) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
        </div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  const getMemberName = (userId: string | null) => {
    if (!userId) return "Não atribuído";
    const member = members?.find(m => m.user_id === userId);
    return formatUserName(member?.full_name) || "Usuário";
  };

  return (
    <AppLayout>
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Workload View</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Visualize a carga de trabalho por membro da equipe
            </p>
          </div>
          
          <Select value={selectedMember} onValueChange={setSelectedMember}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por membro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os membros</SelectItem>
              {members?.map(member => (
                <SelectItem key={member.user_id} value={member.user_id}>
                  {formatUserName(member.full_name) || "Usuário"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Card className="border-l-4 border-l-destructive">
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 sm:h-8 sm:w-8 text-destructive flex-shrink-0" />
              <div>
                <p className="text-xl sm:text-2xl font-bold">{globalStats.totalOverdue}</p>
                <p className="text-xs sm:text-sm text-muted-foreground">Atrasadas</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-primary">
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-primary flex-shrink-0" />
              <div>
                <p className="text-xl sm:text-2xl font-bold">{globalStats.totalPending}</p>
                <p className="text-xs sm:text-sm text-muted-foreground">Pendentes</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <Flame className="h-6 w-6 sm:h-8 sm:w-8 text-orange-500 flex-shrink-0" />
              <div>
                <p className="text-xl sm:text-2xl font-bold">{globalStats.membersWithOverload}</p>
                <p className="text-xs sm:text-sm text-muted-foreground">Sobrecarregados</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <Users className="h-6 w-6 sm:h-8 sm:w-8 text-green-500 flex-shrink-0" />
              <div>
                <p className="text-xl sm:text-2xl font-bold">{members?.length || 0}</p>
                <p className="text-xs sm:text-sm text-muted-foreground">Membros</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={navigatePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={goToToday}>
            Hoje
          </Button>
          <Button variant="outline" size="icon" onClick={navigateNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="font-medium ml-2">
            {format(dateRange[0], "dd MMM", { locale: ptBR })} - {format(dateRange[dateRange.length - 1], "dd MMM yyyy", { locale: ptBR })}
          </span>
        </div>

        <Tabs defaultValue="members" className="w-full">
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="members">Por Membro</TabsTrigger>
            <TabsTrigger value="list">Lista</TabsTrigger>
          </TabsList>

          {/* Members Table View - Main view like ClickUp */}
          <TabsContent value="members" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Carga de Trabalho por Membro</CardTitle>
                <CardDescription>
                  Visualize quantas tarefas cada membro tem pendentes, atrasadas e por dia. Células em laranja indicam sobrecarga (&gt;4 tarefas).
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="w-full" type="always">
                  <div className="min-w-max">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px] sticky left-0 bg-background z-10">Membro</TableHead>
                        <TableHead className="text-center min-w-[80px]">Pendentes</TableHead>
                        <TableHead className="text-center min-w-[80px]">Atrasadas</TableHead>
                        {dateRange.map(date => {
                          const dateStr = format(date, "yyyy-MM-dd");
                          // Find members with overload on this day
                          const overloadedMembers = memberWorkloads.filter(m => (m.tasksByDay[dateStr] || 0) > 4);
                          
                          return (
                            <TableHead 
                              key={date.toISOString()} 
                              className={`text-center min-w-[100px] ${isToday(date) ? 'bg-primary/10' : ''}`}
                            >
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-xs uppercase">{format(date, "EEE", { locale: ptBR })}</span>
                                <span className="font-medium">{format(date, "dd")}</span>
                                {overloadedMembers.length > 0 && (
                                  <div className="flex flex-col gap-0.5 mt-1">
                                    {overloadedMembers.slice(0, 3).map(m => (
                                      <Badge 
                                        key={m.userId} 
                                        variant="outline" 
                                        className="text-[10px] px-1 py-0 bg-orange-500/20 text-orange-600 border-orange-500/30 whitespace-nowrap"
                                      >
                                        ⚠ {m.name}
                                      </Badge>
                                    ))}
                                    {overloadedMembers.length > 3 && (
                                      <span className="text-[10px] text-orange-500">+{overloadedMembers.length - 3}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {memberWorkloads.map(member => {
                        return (
                          <TableRow 
                            key={member.userId}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setSelectedMember(member.userId)}
                          >
                            <TableCell className="font-medium sticky left-0 bg-background z-10">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <User className="h-4 w-4 text-primary" />
                                </div>
                                <span className="whitespace-nowrap">{member.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={member.pendingTasks > 10 ? "destructive" : "secondary"}>
                                {member.pendingTasks}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {member.overdueTasks > 0 ? (
                                <Badge variant="destructive">{member.overdueTasks}</Badge>
                              ) : (
                                <Badge variant="outline" className="text-green-600">0</Badge>
                              )}
                            </TableCell>
                            {dateRange.map(date => {
                              const dateStr = format(date, "yyyy-MM-dd");
                              const count = member.tasksByDay[dateStr] || 0;
                              const isOverloaded = count > 4;
                              
                              return (
                                <TableCell 
                                  key={date.toISOString()} 
                                  className={`text-center ${isToday(date) ? 'bg-primary/10' : ''} ${
                                    isOverloaded ? 'bg-orange-500/20' : ''
                                  }`}
                                >
                                  {count > 0 ? (
                                    <span className={`inline-flex items-center justify-center h-7 w-7 rounded-full text-sm font-medium ${
                                      isOverloaded 
                                        ? 'bg-orange-500 text-white' 
                                        : count >= 3 
                                          ? 'bg-muted-foreground/20 text-foreground' 
                                          : 'bg-muted'
                                    }`}>
                                      {count}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
                
                {memberWorkloads.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum membro encontrado no workspace
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>


          {/* Task List View */}
          <TabsContent value="list" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Lista de Tarefas por Data</CardTitle>
                <CardDescription>
                  {selectedMember === "all" 
                    ? "Todas as tarefas ordenadas por prazo"
                    : `Tarefas de ${getMemberName(selectedMember)}`
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tasksByDate.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma tarefa com prazo definido
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[60px]">Status</TableHead>
                        <TableHead>Tarefa</TableHead>
                        <TableHead className="w-[180px]">Responsável</TableHead>
                        <TableHead className="w-[150px]">Projeto</TableHead>
                        <TableHead className="w-[100px]">Prioridade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasksByDate.map(({ date, tasks }) => {
                        const parsedDate = parseDateOnly(date);
                        const isOverdue = parsedDate && parsedDate < new Date() && tasks.some(t => t.status !== "completed");
                        
                        return (
                          <>
                            {/* Date separator row */}
                            <TableRow key={`date-${date}`} className="bg-muted/30 hover:bg-muted/30">
                              <TableCell colSpan={5} className="py-2">
                                <div className={`flex items-center gap-2 ${isOverdue ? 'text-destructive' : ''}`}>
                                  <Calendar className="h-4 w-4" />
                                  <span className="font-medium">
                                    {parsedDate ? format(parsedDate, "EEEE, dd 'de' MMMM", { locale: ptBR }) : date}
                                  </span>
                                  <Badge variant={isOverdue ? "destructive" : "secondary"}>
                                    {tasks.length} tarefa{tasks.length !== 1 ? 's' : ''}
                                  </Badge>
                                </div>
                              </TableCell>
                            </TableRow>
                            
                            {/* Task rows */}
                            {tasks.map(task => (
                              <TableRow 
                                key={task.id} 
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => navigate(`/tools/wizzy-flow/tasks/${task.id}`)}
                              >
                                <TableCell>
                                  {task.status === "completed" ? (
                                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                                  ) : (
                                    <Circle className={`h-5 w-5 ${
                                      isTaskOverdue(task.due_date, task.status) ? 'text-destructive' : 'text-muted-foreground'
                                    }`} />
                                  )}
                                </TableCell>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    {task.title}
                                    <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                      <User className="h-3 w-3 text-primary" />
                                    </div>
                                    {getMemberName(task.assigned_to)}
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {task.projects?.name || "Pessoal"}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={
                                    task.priority === "high" ? "destructive" :
                                    task.priority === "medium" ? "default" : "secondary"
                                  }>
                                    {task.priority === "high" ? "Alta" :
                                     task.priority === "medium" ? "Média" : "Baixa"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
