import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/fluzz/components/ui/tabs";
import { Badge } from "@/fluzz/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/fluzz/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fluzz/components/ui/select";
import { Switch } from "@/fluzz/components/ui/switch";
import {
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertCircle,
  FolderOpen,
  User,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Calendar,
  Users,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { formatDateShort, parseDateOnly, formatUserName, isTaskOverdue, isTaskDueSoon } from "@/fluzz/lib/utils";
import { useIsMobile } from "@/fluzz/hooks/use-mobile";
import { UnifiedTaskView } from "@/fluzz/components/tasks/UnifiedTaskView";

const COLORS = {
  completed: "hsl(142, 76%, 36%)",
  in_progress: "hsl(43, 96%, 56%)",
  todo: "hsl(217, 91%, 60%)",
  high: "hsl(0, 84%, 60%)",
  medium: "hsl(43, 96%, 56%)",
  low: "hsl(142, 76%, 36%)",
};

// Natural sort function
const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
};

export default function Analytics() {
  const { workspace } = useWorkspace();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const urlFilter = searchParams.get("filter");
  
  // Set initial tab based on URL filter
  const getInitialTab = () => {
    if (urlFilter === "completed") return "completed";
    if (urlFilter === "pending") return "pending";
    if (urlFilter === "overdue") return "overdue";
    return "all";
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab());
  const [selectedMember, setSelectedMember] = useState<string>("all");
  const [includeStandaloneTasks, setIncludeStandaloneTasks] = useState(false);

  // Update tab when URL filter changes
  useEffect(() => {
    if (urlFilter) {
      setActiveTab(getInitialTab());
    }
  }, [urlFilter]);

  // Fetch all project tasks (excluding drafts)
  const { data: projectTasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["analytics-project-tasks", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          *,
          projects!inner(id, name, color, workspace_id, archived, is_standalone_folder, pending_notifications),
          task_assignees(user_id)
        `)
        .eq("projects.workspace_id", workspace.id)
        .eq("projects.archived", false)
        .neq("projects.pending_notifications", true); // Exclude drafts
      
      if (error) throw error;
      return data;
    },
    enabled: !!workspace?.id,
  });

  // Fetch standalone tasks from this workspace
  const { data: standaloneTasks } = useQuery({
    queryKey: ["analytics-standalone-tasks", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      
      const { data, error } = await supabase
        .from("tasks")
        .select("*, task_assignees(user_id)")
        .is("project_id", null)
        .is("routine_id", null)
        .eq("workspace_id", workspace.id);
      
      if (error) throw error;
      return data;
    },
    enabled: !!workspace?.id,
  });

  // Fetch routine tasks from this workspace
  const { data: routineTasks } = useQuery({
    queryKey: ["analytics-routine-tasks", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];

      const { data, error } = await supabase
        .from("tasks")
        .select("*, task_assignees(user_id)")
        .not("routine_id", "is", null)
        .eq("workspace_id", workspace.id);

      if (error) throw error;
      return data;
    },
    enabled: !!workspace?.id,
  });

  // Fetch profiles for assignee names
  const { data: profiles } = useQuery({
    queryKey: ["analytics-profiles", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      
      const { data: members } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspace.id);
      
      if (!members || members.length === 0) return [];
      
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", members.map(m => m.user_id));
      
      if (error) throw error;
      return data;
    },
    enabled: !!workspace?.id,
  });

  // Fetch workspace members for filter dropdown
  const { data: workspaceMembers } = useQuery({
    queryKey: ["analytics-members", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      
      const { data: members, error } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspace.id);
      
      if (error) throw error;
      
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", members?.map(m => m.user_id) || []);
      
      return profilesData || [];
    },
    enabled: !!workspace?.id,
  });

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["workspace-projects", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("workspace_id", workspace.id)
        .eq("archived", false)
        .eq("is_standalone_folder", false)
        .neq("pending_notifications", true); // Exclude drafts
      
      if (error) throw error;
      return data;
    },
    enabled: !!workspace?.id,
  });

  // Combine all tasks
  const allTasksRaw = useMemo(() => {
    const standalone = includeStandaloneTasks ? standaloneTasks || [] : [];
    return [...(projectTasks || []), ...standalone, ...(routineTasks || [])];
  }, [projectTasks, standaloneTasks, routineTasks, includeStandaloneTasks]);

  // Filter by selected member
  const allTasks = useMemo(() => {
    if (selectedMember === "all") return allTasksRaw;
    return allTasksRaw.filter(t => t.assigned_to === selectedMember);
  }, [allTasksRaw, selectedMember]);

  // Get profile name helper
  const getProfileName = (userId: string | null) => {
    if (!userId) return "Não atribuído";
    const profile = profiles?.find(p => p.id === userId);
    return formatUserName(profile?.full_name) || "Usuário";
  };

  // Get task type helper
  const getTaskType = (task: any): "project" | "folder" | "personal" | "routine" => {
    if (task.routine_id || task.recurring_task_id) return "routine";
    // Tarefa pessoal = sem project_id
    if (!task.project_id) return "personal";
    // Pasta "Sem Projeto" = project com is_standalone_folder = true
    if (task.projects?.is_standalone_folder) return "folder";
    return "project";
  };

  // Filter tasks based on tab
  const getFilteredTasks = (tab: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (tab) {
      case "completed":
        return allTasks.filter(t => t.status === "completed");
      case "pending":
        return allTasks.filter(t => t.status !== "completed");
      case "overdue":
        return allTasks.filter(t => isTaskOverdue(t.due_date, t.status));
      default:
        return allTasks;
    }
  };

  const filteredTasks = useMemo(() => getFilteredTasks(activeTab), [allTasks, activeTab]);

  // Group tasks by type and project
  const taskGroups = useMemo(() => {
    const groups: { 
      projects: { [key: string]: { name: string; tasks: any[] } };
      folders: { [key: string]: { name: string; tasks: any[] } };
      personal: any[];
      routine: any[];
    } = {
      projects: {},
      folders: {},
      personal: [],
      routine: []
    };

    filteredTasks.forEach(task => {
      const type = getTaskType(task);
      
      if (type === "personal") {
        groups.personal.push(task);
      } else if (type === "folder") {
        // Tarefas de pastas "Sem Projeto"
        if (!groups.folders[task.project_id]) {
          const projectTask = projectTasks?.find(pt => pt.project_id === task.project_id);
          groups.folders[task.project_id] = {
            name: (projectTask as any)?.projects?.name || "Sem Projeto",
            tasks: []
          };
        }
        groups.folders[task.project_id].tasks.push(task);
      } else if (type === "routine") {
        groups.routine.push(task);
      } else if (task.project_id) {
        if (!groups.projects[task.project_id]) {
          // Get project name from projectTasks which has the join
          const projectTask = projectTasks?.find(pt => pt.project_id === task.project_id);
          groups.projects[task.project_id] = {
            name: projectTask?.projects?.name || "Projeto",
            tasks: []
          };
        }
        groups.projects[task.project_id].tasks.push(task);
      }
    });

    return groups;
  }, [filteredTasks, projectTasks]);

  if (tasksLoading || projectsLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  const statusData = [
    {
      name: "A fazer",
      value: allTasks?.filter((t) => t.status === "todo").length || 0,
      color: COLORS.todo,
    },
    {
      name: "Fazendo",
      value: allTasks?.filter((t) => t.status === "in_progress").length || 0,
      color: COLORS.in_progress,
    },
    {
      name: "Feito",
      value: allTasks?.filter((t) => t.status === "completed").length || 0,
      color: COLORS.completed,
    },
  ];

  const priorityData = [
    {
      name: "Alta",
      value: allTasks?.filter((t) => t.priority === "high").length || 0,
      color: COLORS.high,
    },
    {
      name: "Média",
      value: allTasks?.filter((t) => t.priority === "medium").length || 0,
      color: COLORS.medium,
    },
    {
      name: "Baixa",
      value: allTasks?.filter((t) => t.priority === "low").length || 0,
      color: COLORS.low,
    },
  ];

  const projectStats = projects?.map((project) => ({
    name: project.name.substring(0, 20),
    tarefas: projectTasks?.filter((t) => t.project_id === project.id).length || 0,
  }));

  const totalTasks = allTasks?.length || 0;
  const completedTasks = allTasks?.filter((t) => t.status === "completed").length || 0;
  const inProgressTasks = allTasks?.filter((t) => t.status === "in_progress").length || 0;
  const overdueTasks = allTasks?.filter(t => isTaskOverdue(t.due_date, t.status)).length || 0;

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const TaskItem = ({ task }: { task: any }) => {
    const isOverdue = isTaskOverdue(task.due_date, task.status);
    const isDueSoon = isTaskDueSoon(task.due_date, task.status);
    
    const priorityColors = {
      high: "destructive",
      medium: "default",
      low: "secondary",
    };
    
    const priorityLabels = {
      high: "Alta",
      medium: "Média",
      low: "Baixa",
    };
    
    const statusLabels = {
      todo: "A fazer",
      in_progress: "Fazendo",
      completed: "Feito"
    };
    
    const statusColors = {
      todo: "bg-status-todo text-status-todo-foreground",
      in_progress: "bg-status-in-progress text-status-in-progress-foreground",
      completed: "bg-status-completed text-status-completed-foreground",
    };
    
    return (
      <Card 
        className="hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => navigate(`/tools/wizzy-flow/tasks/${task.id}`)}
      >
        <CardContent className="p-4">
          <div className="space-y-2">
            <h3 className={`font-medium ${isOverdue ? "text-destructive" : isDueSoon ? "text-amber-500 dark:text-amber-400" : "text-foreground"}`}>
              {task.title}
            </h3>
            
            <div className="flex flex-wrap gap-2 items-center">
              <Badge 
                variant={priorityColors[task.priority as keyof typeof priorityColors] as any}
              >
                {priorityLabels[task.priority as keyof typeof priorityLabels]}
              </Badge>
              
              <Badge className={statusColors[task.status as keyof typeof statusColors]}>
                {statusLabels[task.status as keyof typeof statusLabels]}
              </Badge>
              
              {task.due_date && (
                <div className={`flex items-center gap-1 text-sm ${isOverdue ? "text-destructive" : isDueSoon ? "text-amber-500 dark:text-amber-400" : "text-muted-foreground"}`}>
                  <Calendar className="h-4 w-4" />
                  {formatDateShort(task.due_date)}
                </div>
              )}
              
              <span className="text-sm text-muted-foreground">
                {getProfileName(task.assigned_to)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const CollapsibleTaskGroup = ({ 
    title, 
    icon: Icon, 
    iconColor, 
    tasks 
  }: { 
    title: string; 
    icon: any; 
    iconColor: string; 
    tasks: any[];
  }) => {
    const [isOpen, setIsOpen] = useState(true);
    
    if (tasks.length === 0) return null;
    
    // Sort tasks by title using natural sort
    const sortedTasks = [...tasks].sort((a, b) => naturalSort(a.title, b.title));
    
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 hover:bg-accent/50 rounded-lg transition-colors">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Icon className={`h-4 w-4 ${iconColor}`} />
          <span className="font-medium">{title}</span>
          <Badge variant="secondary" className="ml-auto">{tasks.length}</Badge>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 mt-3">
          {sortedTasks.map(task => (
            <TaskItem key={task.id} task={task} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const pendingCount = allTasks.filter(t => t.status !== "completed").length;

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Analytics</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Visão geral de todas as tarefas e projetos do workspace
            </p>
          </div>
          
          {/* Filtros */}
          <div className="space-y-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedMember} onValueChange={setSelectedMember}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filtrar por responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os membros</SelectItem>
                    {workspaceMembers?.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {formatUserName(member.full_name) || "Usuário"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 sm:pl-3 sm:border-l sm:border-border">
                <Switch
                  checked={includeStandaloneTasks}
                  onCheckedChange={setIncludeStandaloneTasks}
                />
                <span className="text-sm text-muted-foreground">Incluir tarefas pessoais</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Tarefas pessoais são criadas diretamente para você e não estão vinculadas a um projeto.
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow" 
            onClick={() => setActiveTab("all")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-4">
              <CardTitle className="text-xs sm:text-sm font-medium">Total de Tarefas</CardTitle>
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
              <div className="text-xl sm:text-2xl font-bold">{totalTasks}</div>
              <p className="text-xs text-muted-foreground">
                {projects?.length || 0} projetos ativos
              </p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow" 
            onClick={() => setActiveTab("completed")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-4">
              <CardTitle className="text-xs sm:text-sm font-medium">Concluídas</CardTitle>
              <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
              <div className="text-xl sm:text-2xl font-bold">{completedTasks}</div>
              <p className="text-xs text-muted-foreground">
                Taxa: {completionRate}%
              </p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow" 
            onClick={() => setActiveTab("pending")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-4">
              <CardTitle className="text-xs sm:text-sm font-medium">Pendentes</CardTitle>
              <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
              <div className="text-xl sm:text-2xl font-bold">{pendingCount}</div>
              <p className="text-xs text-muted-foreground">
                A fazer + fazendo
              </p>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer hover:shadow-md transition-shadow ${overdueTasks > 0 ? "border-destructive" : ""}`}
            onClick={() => setActiveTab("overdue")}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-4">
              <CardTitle className={`text-xs sm:text-sm font-medium ${overdueTasks > 0 ? "text-destructive" : ""}`}>Atrasadas</CardTitle>
              <AlertCircle className={`h-3 w-3 sm:h-4 sm:w-4 ${overdueTasks > 0 ? "text-destructive" : "text-red-600"}`} />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
              <div className={`text-xl sm:text-2xl font-bold ${overdueTasks > 0 ? "text-destructive" : ""}`}>{overdueTasks}</div>
              <p className="text-xs text-muted-foreground">
                Requerem atenção
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Data Tables - Replacing Charts */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Tasks by Project - Table instead of Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Tarefas por Projeto</CardTitle>
              <CardDescription>
                Quantidade de tarefas pendentes e concluídas por projeto
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[300px] overflow-y-auto scrollbar-discrete">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr>
                      <th className="text-left py-2 px-2">Projeto</th>
                      <th className="text-center py-2 px-2">Total</th>
                      <th className="text-center py-2 px-2">Pendentes</th>
                      <th className="text-center py-2 px-2">Concluídas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects?.map(project => {
                      const projTasks = projectTasks?.filter(t => t.project_id === project.id) || [];
                      const pending = projTasks.filter(t => t.status !== "completed").length;
                      const completed = projTasks.filter(t => t.status === "completed").length;
                      return (
                        <tr key={project.id} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-2 font-medium truncate max-w-[200px]" title={project.name}>
                            {project.name}
                          </td>
                          <td className="text-center py-2 px-2">{projTasks.length}</td>
                          <td className="text-center py-2 px-2">
                            <Badge variant={pending > 0 ? "secondary" : "outline"}>{pending}</Badge>
                          </td>
                          <td className="text-center py-2 px-2">
                            <Badge variant="outline" className="text-green-600">{completed}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(!projects || projects.length === 0) && (
                  <p className="text-center text-muted-foreground py-4">Nenhum projeto encontrado</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tasks by Member - Table instead of Chart */}
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
                    {workspaceMembers?.map(member => {
                      const memberTasks = allTasks.filter(t => t.assigned_to === member.id);
                      const todo = memberTasks.filter(t => t.status === "todo").length;
                      const inProgress = memberTasks.filter(t => t.status === "in_progress").length;
                      const completed = memberTasks.filter(t => t.status === "completed").length;
                      return (
                        <tr key={member.id} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-2 font-medium">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="h-3 w-3 text-primary" />
                              </div>
                              {formatUserName(member.full_name) || "Usuário"}
                            </div>
                          </td>
                          <td className="text-center py-2 px-2">
                            <Badge variant={todo > 0 ? "default" : "outline"} className="bg-blue-500/80">{todo}</Badge>
                          </td>
                          <td className="text-center py-2 px-2">
                            <Badge variant={inProgress > 0 ? "default" : "outline"} className="bg-yellow-500/80">{inProgress}</Badge>
                          </td>
                          <td className="text-center py-2 px-2">
                            <Badge variant="outline" className="text-green-600">{completed}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(!workspaceMembers || workspaceMembers.length === 0) && (
                  <p className="text-center text-muted-foreground py-4">Nenhum membro encontrado</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Task List Section */}
        <Card>
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="text-lg sm:text-xl">Lista de Tarefas</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Visualize todas as tarefas separadas por categoria
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 mb-4 h-auto">
                <TabsTrigger value="all" className="text-[10px] sm:text-sm py-2">
                  Todas ({totalTasks})
                </TabsTrigger>
                <TabsTrigger value="completed" className="text-[10px] sm:text-sm py-2">
                  Concluídas ({completedTasks})
                </TabsTrigger>
                <TabsTrigger value="pending" className="text-[10px] sm:text-sm py-2">
                  Pendentes ({pendingCount})
                </TabsTrigger>
                <TabsTrigger value="overdue" className="text-[10px] sm:text-sm py-2">
                  Atrasadas ({overdueTasks})
                </TabsTrigger>
              </TabsList>

              {["all", "completed", "pending", "overdue"].map(tab => (
                <TabsContent key={tab} value={tab} className="space-y-4 mt-0">
                  {filteredTasks.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma tarefa encontrada
                    </p>
                  ) : (
                    <UnifiedTaskView
                      tasks={filteredTasks.map(t => {
                        const projectInfo = projectTasks?.find(pt => pt.project_id === t.project_id);
                        return {
                          ...t,
                          projects: (t as any).projects || projectInfo?.projects
                        };
                      })}
                      showGrouping={true}
                      showSortToggle={true}
                      queryKeyToInvalidate={["analytics-project-tasks", "analytics-standalone-tasks", "analytics-routine-tasks", "tasks", "my-tasks"]}
                    />
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}