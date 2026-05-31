import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { FileText, ListTodo, FolderKanban, UserPlus, Plus } from "lucide-react";
import { Badge } from "@/fluzz/components/ui/badge";
import { useState, useMemo } from "react";
import { CreateStandaloneTaskDialog } from "@/fluzz/components/tasks/CreateStandaloneTaskDialog";
import { toast } from "sonner";
import { isTaskOverdue } from "@/fluzz/lib/utils";
import { useViewMode } from "@/fluzz/hooks/useViewMode";

export default function Home() {
  const navigate = useNavigate();
  const {
    workspace,
    canCreateTasks,
    permissions,
    isAdmin,
    isGestor
  } = useWorkspace();
  const {
    user
  } = useAuth();
  const [showCreateTask, setShowCreateTask] = useState(false);
  const { viewMode } = useViewMode();

  const {
    data: projects,
    isLoading: projectsLoading
  } = useQuery({
    queryKey: ["projects", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const {
        data,
        error
      } = await supabase.from("projects").select("*").eq("workspace_id", workspace.id).order("created_at", {
        ascending: false
      });
      if (error) throw error;
      return data;
    },
    enabled: !!workspace
  });

  // Filter only active (non-archived) projects that are NOT standalone folders and NOT drafts (pending_notifications = true means draft)
  // Sort by updated_at descending to show most recently updated first
  const activeProjectsList = useMemo(() => 
    (projects?.filter(p => !p.archived && !p.is_standalone_folder && p.pending_notifications !== true) || [])
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()), 
    [projects]
  );

  // Fetch ALL tasks for admin/gestor, or only user's tasks for members
  const {
    data: allTasks,
    isLoading: tasksLoading
  } = useQuery({
    queryKey: ["home-tasks", workspace?.id, user?.id, isAdmin, isGestor],
    queryFn: async () => {
      if (!workspace) return [];
      
      // Get workspace members for admin/gestor
      const { data: members } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspace.id);
      
      if (!members || members.length === 0) return [];
      const memberIds = members.map(m => m.user_id);

      // Get active projects (non-archived, not drafts)
      const { data: projectsData } = await supabase
        .from("projects")
        .select("id")
        .eq("workspace_id", workspace.id)
        .eq("archived", false)
        .neq("pending_notifications", true); // Exclude drafts
      
      const projectIds = projectsData?.map(p => p.id) || [];

      let allTasksResult: any[] = [];

      if (isAdmin || isGestor) {
        // 1. Project tasks from active projects
        if (projectIds.length > 0) {
          const { data: projectTasks } = await supabase
            .from("tasks")
            .select("*")
            .in("project_id", projectIds);
          allTasksResult = [...(projectTasks || [])];
        }
        
        // 2. Standalone tasks from this workspace
        const { data: standaloneTasks } = await supabase
          .from("tasks")
          .select("*")
          .is("project_id", null)
          .is("routine_id", null)
          .eq("workspace_id", workspace.id);
        allTasksResult = [...allTasksResult, ...(standaloneTasks || [])];
        
        // 3. Routine tasks from this workspace
        const { data: routineTasks } = await supabase
          .from("tasks")
          .select("*")
          .not("routine_id", "is", null)
          .eq("workspace_id", workspace.id);
        allTasksResult = [...allTasksResult, ...(routineTasks || [])];

      } else {
        // Member: get only tasks assigned to them
        // 1. Project tasks
        if (projectIds.length > 0) {
          const { data: projectTasks } = await supabase
            .from("tasks")
            .select("*")
            .in("project_id", projectIds)
            .eq("assigned_to", user?.id);
          allTasksResult = [...(projectTasks || [])];
        }
        
        // 2. Standalone tasks from this workspace assigned to current user
        const { data: standaloneTasks } = await supabase
          .from("tasks")
          .select("*")
          .is("project_id", null)
          .is("routine_id", null)
          .eq("workspace_id", workspace.id)
          .eq("assigned_to", user?.id);
        allTasksResult = [...allTasksResult, ...(standaloneTasks || [])];
        
        // 3. Routine tasks from this workspace assigned to current user
        const { data: routineTasks } = await supabase
          .from("tasks")
          .select("*")
          .not("routine_id", "is", null)
          .eq("workspace_id", workspace.id)
          .eq("assigned_to", user?.id);
        allTasksResult = [...allTasksResult, ...(routineTasks || [])];
      }

      return allTasksResult;
    },
    enabled: !!workspace && !!user
  });

  const activeProjects = activeProjectsList.length;
  const completedTasks = (allTasks || []).filter(t => t.status === "completed").length;
  const pendingTasks = (allTasks || []).filter(t => t.status !== "completed").length;
  const overdueTasks = (allTasks || []).filter(t => isTaskOverdue(t.due_date, t.status)).length;

  // Handle card clicks based on role
  const handleCardClick = (type: "projects" | "completed" | "pending" | "overdue") => {
    if (isAdmin || isGestor) {
      // Navigate to Analytics with appropriate filter
      navigate(`/tools/wizzy-flow/analytics?filter=${type}`);
    } else {
      // Navigate to My Tasks with appropriate filter
      switch (type) {
        case "projects":
          navigate("/tools/wizzy-flow/my-tasks");
          break;
        case "completed":
          navigate("/tools/wizzy-flow/my-tasks?filter=completed");
          break;
        case "pending":
          navigate("/tools/wizzy-flow/my-tasks?filter=pending");
          break;
        case "overdue":
          navigate("/tools/wizzy-flow/my-tasks?filter=overdue");
          break;
      }
    }
  };

  // Quick access items with permission checks
  const quickAccessItems = useMemo(() => {
    const items = [
      {
        label: "Minhas Tarefas",
        icon: ListTodo,
        path: "/tools/wizzy-flow/my-tasks",
        show: isAdmin || isGestor || permissions.can_view_tasks
      },
      {
        label: "Ver Todos os Projetos",
        icon: FolderKanban,
        path: "/tools/wizzy-flow/projects",
        show: isAdmin || isGestor || permissions.can_view_projects
      },
      {
        label: "Setores",
        icon: UserPlus,
        path: "/tools/wizzy-flow/positions",
        show: isAdmin || isGestor || permissions.can_view_positions
      },
      {
        label: "Workspace",
        icon: FileText,
        path: "/tools/wizzy-flow/workspace",
        show: true // Always visible
      }
    ];
    return items.filter(item => item.show);
  }, [isAdmin, isGestor, permissions]);

  if (projectsLoading || tasksLoading) {
    return <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        </div>
      </AppLayout>;
  }

  return <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Home</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1 sm:mt-2">
              {isAdmin || isGestor 
                ? "Visão geral de todos os projetos e tarefas do workspace"
                : "Visão geral dos seus projetos e tarefas"}
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {(isAdmin || isGestor) && (
              <Button onClick={() => setShowCreateTask(true)} size="sm" className="flex-1 sm:flex-none text-xs sm:text-sm">
                <Plus className="mr-1 sm:mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Nova Tarefa</span>
                <span className="sm:hidden">Criar</span>
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <Card 
            className="hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-primary" 
            onClick={() => handleCardClick("projects")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                Projetos Ativos
              </CardTitle>
              <FolderKanban className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">{activeProjects}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Clique para ver todos
              </p>
            </CardContent>
          </Card>

          <Card 
            className="hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-primary"
            onClick={() => handleCardClick("completed")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                Tarefas Concluídas
              </CardTitle>
              <ListTodo className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">{completedTasks}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Total de tarefas finalizadas
              </p>
            </CardContent>
          </Card>

          <Card 
            className="hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-primary" 
            onClick={() => handleCardClick("pending")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                Tarefas Pendentes
              </CardTitle>
              <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">{pendingTasks}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Clique para ver {isAdmin || isGestor ? "todas" : "suas tarefas"}
              </p>
            </CardContent>
          </Card>

          <Card 
            className={`hover:shadow-lg transition-all cursor-pointer border-l-4 ${overdueTasks > 0 ? "border-l-destructive" : "border-l-primary"}`}
            onClick={() => handleCardClick("overdue")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className={`text-xs sm:text-sm font-medium ${overdueTasks > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                Tarefas Atrasadas
              </CardTitle>
              <UserPlus className={`h-4 w-4 sm:h-5 sm:w-5 ${overdueTasks > 0 ? "text-destructive" : "text-primary"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl sm:text-3xl font-bold ${overdueTasks > 0 ? "text-destructive" : "text-foreground"}`}>
                {overdueTasks}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {overdueTasks > 0 ? "Requer atenção imediata" : "Tudo em dia!"}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <FolderKanban className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Projetos Recentes
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Seus projetos mais recentes</CardDescription>
            </CardHeader>
            <CardContent>
              {activeProjectsList.length === 0 ? <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">Nenhum projeto ativo</p>
                  <Button onClick={() => navigate("/tools/wizzy-flow/projects")}>
                    Criar Primeiro Projeto
                  </Button>
                </div> : <div className="space-y-3">
                  {activeProjectsList.slice(0, 5).map(project => <div key={project.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => {
                      if (viewMode === "focus") {
                        navigate(`/tools/wizzy-flow/my-tasks?projectId=${project.id}`);
                      } else {
                        navigate(`/tools/wizzy-flow/projects/${project.id}`);
                      }
                    }}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {project.name}
                        </p>
                        {project.description && <p className="text-sm text-muted-foreground truncate">
                            {project.description}
                          </p>}
                      </div>
                      <Badge variant={project.status === "completed" ? "default" : project.status === "active" ? "secondary" : "outline"}>
                        {project.status === "completed" ? "Concluído" : project.status === "active" ? "Ativo" : "Pausado"}
                      </Badge>
                    </div>)}
                  {activeProjectsList.length > 5 && <Button variant="outline" className="w-full mt-2" onClick={() => navigate(viewMode === "focus" ? "/focus-projects" : "/projects")}>
                      Ver Todos os Projetos ({activeProjectsList.length})
                    </Button>}
                </div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <ListTodo className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Acesso Rápido
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Links úteis para seu trabalho</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {quickAccessItems.map(item => (
                  <Button 
                    key={item.path}
                    variant="outline" 
                    className="w-full justify-start" 
                    onClick={() => navigate(item.path)}
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <CreateStandaloneTaskDialog open={showCreateTask} onOpenChange={setShowCreateTask} />
    </AppLayout>;
}