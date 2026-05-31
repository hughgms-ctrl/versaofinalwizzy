import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { TaskFilters } from "@/fluzz/components/tasks/TaskFilters";
import { CreateMyTaskDialog } from "@/fluzz/components/tasks/CreateMyTaskDialog";
import { UnifiedTaskView } from "@/fluzz/components/tasks/UnifiedTaskView";
import { FocusModeView } from "@/fluzz/components/focus-mode/FocusModeView";
import { FocusModeHeader } from "@/fluzz/components/focus-mode/FocusModeHeader";
import { useViewMode } from "@/fluzz/hooks/useViewMode";
import { Card, CardContent } from "@/fluzz/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/fluzz/components/ui/tabs";
import { Button } from "@/fluzz/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/fluzz/components/ui/collapsible";
import { toast } from "sonner";
import { CheckCircle2, Clock, PlayCircle, Plus, FolderOpen, User, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { Switch } from "@/fluzz/components/ui/switch";
import { Label } from "@/fluzz/components/ui/label";
import { MobileFilterDrawer } from "@/fluzz/components/filters/MobileFilterDrawer";
import { parseDateOnly, isTaskOverdue } from "@/fluzz/lib/utils";
import { useIsMobile } from "@/fluzz/hooks/use-mobile";

export default function MyTasks() {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dueDateFilter, setDueDateFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const { viewMode, hideCompleted, setHideCompleted } = useViewMode();
  const showCompleted = !hideCompleted;
  const setShowCompleted = (show: boolean) => setHideCompleted(!show);
  
  // Apply URL filter (and Focus Mode project selection) on mount / URL change
  useEffect(() => {
    const urlFilter = searchParams.get("filter");
    const urlProjectId = searchParams.get("projectId");

    // In Focus Mode, project selection comes from URL (Todoist-like sidebar behavior)
    if (viewMode === "focus") {
      setProjectFilter(urlProjectId ?? "all");
    }

    if (urlFilter) {
      if (urlFilter === "completed") {
        setStatusFilter("completed");
        setShowCompleted(true);
      } else if (urlFilter === "pending") {
        // pending = todo + in_progress
        setStatusFilter("all");
        setShowCompleted(false);
      } else if (urlFilter === "overdue") {
        setDueDateFilter("overdue");
        setShowCompleted(false);
      }

      // Clear only the applied filter param, keep others (ex: projectId)
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("filter");
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams, viewMode]);

  const clearAllFilters = () => {
    setSearchTerm("");
    setPriorityFilter("all");
    setStatusFilter("all");
    setDueDateFilter("all");
    setProjectFilter("all");
    setTypeFilter("all");
    setFilterDrawerOpen(false);
  };

  const activeFiltersCount = [
    searchTerm !== "",
    priorityFilter !== "all",
    statusFilter !== "all",
    dueDateFilter !== "all",
    projectFilter !== "all",
    typeFilter !== "all",
  ].filter(Boolean).length;

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["my-tasks", user?.id, workspace?.id],
    queryFn: async () => {
      if (!user || !workspace) return [];

      // Scope project tasks to the currently selected workspace.
      const { data: wsProjects, error: wsProjectsError } = await supabase
        .from("projects")
        .select("id")
        .eq("workspace_id", workspace.id);
      if (wsProjectsError) throw wsProjectsError;

      const projectIds = (wsProjects || []).map((p) => p.id);
      const selectFields =
        "*, projects(id, name, color, archived, pending_notifications, workspace_id, is_standalone_folder), task_assignees(user_id)";

      // Fetch tasks where user is in task_assignees (multi-assign)
      // Get all task IDs that user is assigned to via task_assignees
      const { data: userAssignedTaskIds, error: userAssignedError } = await supabase
        .from("task_assignees")
        .select("task_id")
        .eq("user_id", user.id);
      if (userAssignedError) throw userAssignedError;
      
      const multiAssignTaskIds = (userAssignedTaskIds || []).map((t) => t.task_id);

      const fetchMultiAssignedProjectTasks = async () => {
        if (projectIds.length === 0 || multiAssignTaskIds.length === 0) return [];
        const { data: tasks, error: tasksError } = await supabase
          .from("tasks")
          .select(selectFields)
          .in("id", multiAssignTaskIds)
          .in("project_id", projectIds)
          .order("created_at", { ascending: false });
        if (tasksError) throw tasksError;
        return tasks || [];
      };

      const fetchMultiAssignedStandaloneTasks = async () => {
        if (multiAssignTaskIds.length === 0) return [];
        const { data: tasks, error: tasksError } = await supabase
          .from("tasks")
          .select(selectFields)
          .in("id", multiAssignTaskIds)
          .is("project_id", null)
          .eq("workspace_id", workspace.id)
          .order("created_at", { ascending: false });
        if (tasksError) throw tasksError;
        return tasks || [];
      };

      // Fetch tasks where user is reviewer (approval_reviewer_id)
      const fetchReviewProjectTasks = async () => {
        if (projectIds.length === 0) return [];
        const { data, error } = await supabase
          .from("tasks")
          .select(selectFields)
          .eq("approval_reviewer_id", user.id)
          .eq("requires_approval", true)
          .in("project_id", projectIds)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      };

      const fetchReviewStandaloneTasks = async () => {
        const { data, error } = await supabase
          .from("tasks")
          .select(selectFields)
          .eq("approval_reviewer_id", user.id)
          .eq("requires_approval", true)
          .is("project_id", null)
          .eq("workspace_id", workspace.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      };

      const [
        multiAssignedProject,
        multiAssignedStandalone,
        reviewProject, 
        reviewStandalone
      ] = await Promise.all([
        fetchMultiAssignedProjectTasks(),
        fetchMultiAssignedStandaloneTasks(),
        fetchReviewProjectTasks(),
        fetchReviewStandaloneTasks(),
      ]);

      // Combine and deduplicate - only use task_assignees as source of truth
      const byId = new Map<string, any>();
      [
        ...multiAssignedProject,
        ...multiAssignedStandalone,
        ...reviewProject, 
        ...reviewStandalone
      ].forEach((t) => {
        byId.set(t.id, t);
      });

      const allTasks = Array.from(byId.values());

      // IMPORTANT: Do NOT show tasks from draft projects (rascunho)
      // A draft project is identified by pending_notifications === true.
      return (
        allTasks
          ?.filter((task) => {
            // Standalone tasks are always visible
            if (!task.project_id) return true;

            // If it's a project task, only show when project is published and not archived
            if (!task.projects) return false;
            if (task.projects.archived) return false;
            if (task.projects.pending_notifications === true) return false;

            return true;
          })
          .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")) || []
      );
    },
    enabled: !!user && !!workspace,
  });

  const { data: projects } = useQuery({
    queryKey: ["my-projects-filter", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, color, archived, pending_notifications")
        .eq("workspace_id", workspace.id)
        .eq("archived", false)
        .neq("pending_notifications", true)
        .order("name");
      if (error) throw error;
      return (data || []).map((p) => ({ id: p.id, name: p.name, color: p.color }));
    },
    enabled: !!workspace,
  });

  // Get current project ID from URL (for Focus Mode)
  const urlProjectId = searchParams.get("projectId");

  // Fetch selected project info for Focus Mode header
  const { data: selectedProjectData } = useQuery({
    queryKey: ["project-for-focus", urlProjectId],
    queryFn: async () => {
      if (!urlProjectId) return null;
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, color")
        .eq("id", urlProjectId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!urlProjectId && viewMode === "focus",
  });

  // Fetch ALL tasks for a project (when viewing a project in Focus Mode)
  const { data: allProjectTasks } = useQuery({
    queryKey: ["project-all-tasks", urlProjectId, workspace?.id],
    queryFn: async () => {
      if (!urlProjectId || !workspace) return [];
      const selectFields =
        "*, projects(id, name, color, archived, pending_notifications, workspace_id, is_standalone_folder), task_assignees(user_id)";
      const { data, error } = await supabase
        .from("tasks")
        .select(selectFields)
        .eq("project_id", urlProjectId)
        .order("task_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!urlProjectId && viewMode === "focus" && !!workspace,
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-tasks", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa excluída com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao excluir tarefa");
    },
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-tasks", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["project"] });
      toast.success("Status atualizado!");
    },
  });

  // Helper function to determine task type
  const getTaskType = (task: any): "project" | "folder" | "personal" | "routine" => {
    if (task.routine_id || task.recurring_task_id) return "routine";
    // Tarefa pessoal = sem project_id
    if (!task.project_id) return "personal";
    // Pasta "Sem Projeto" = project com is_standalone_folder = true
    if (task.projects?.is_standalone_folder) return "folder";
    return "project";
  };

  // Natural sort function
  const naturalSort = (a: string, b: string) => {
    return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
  };

  // Apply filters (moved before conditional return)
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((task) => {
      const matchesSearch =
        searchTerm === "" ||
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesProject = projectFilter === "all" || task.project_id === projectFilter;
      
      const taskType = getTaskType(task);
      const matchesType = typeFilter === "all" || taskType === typeFilter;

      // Hide completed tasks if toggle is off
      const matchesCompletedFilter = showCompleted || task.status !== "completed";

      let matchesDueDate = true;
      if (dueDateFilter !== "all" && task.due_date) {
        const dueDate = parseDateOnly(task.due_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dueDate) {
          if (dueDateFilter === "overdue") {
            matchesDueDate = isTaskOverdue(task.due_date, task.status);
          } else if (dueDateFilter === "today") {
            matchesDueDate = dueDate.toDateString() === today.toDateString();
          } else if (dueDateFilter === "week") {
            const weekFromNow = new Date(today);
            weekFromNow.setDate(today.getDate() + 7);
            matchesDueDate = dueDate >= today && dueDate <= weekFromNow;
          } else if (dueDateFilter === "month") {
            const monthFromNow = new Date(today);
            monthFromNow.setMonth(today.getMonth() + 1);
            matchesDueDate = dueDate >= today && dueDate <= monthFromNow;
          }
        }
      }

      return matchesSearch && matchesPriority && matchesStatus && matchesDueDate && matchesProject && matchesType && matchesCompletedFilter;
    });
  }, [tasks, searchTerm, priorityFilter, statusFilter, dueDateFilter, projectFilter, typeFilter, showCompleted]);

  // Computed values based on filtered tasks
  const todoTasks = useMemo(() => filteredTasks.filter((t) => t.status === "todo"), [filteredTasks]);
  const inProgressTasks = useMemo(() => filteredTasks.filter((t) => t.status === "in_progress"), [filteredTasks]);
  const completedTasks = useMemo(() => filteredTasks.filter((t) => t.status === "completed"), [filteredTasks]);
  const projectTypeTasks = useMemo(() => filteredTasks.filter((t) => getTaskType(t) === "project" || getTaskType(t) === "folder"), [filteredTasks]);
  const personalTasks = useMemo(() => filteredTasks.filter((t) => getTaskType(t) === "personal"), [filteredTasks]);
  const routineTypeTasks = useMemo(() => filteredTasks.filter((t) => getTaskType(t) === "routine"), [filteredTasks]);

  // Determine which tasks to show in Focus Mode:
  // - If a project is selected: show ALL project tasks (not just user's)
  // - If no project selected: show user's tasks (filtered)
  const focusModeTasks = useMemo(() => {
    if (viewMode !== "focus") return filteredTasks;
    
    if (urlProjectId && allProjectTasks) {
      // Show all project tasks, apply completed filter
      return showCompleted 
        ? allProjectTasks 
        : allProjectTasks.filter(t => t.status !== "completed");
    }
    
    // No project selected - show user's filtered tasks
    return filteredTasks;
  }, [viewMode, urlProjectId, allProjectTasks, filteredTasks, showCompleted]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4 md:space-y-6">
        {/* Focus Mode Header */}
        {viewMode === "focus" ? (
          <FocusModeHeader 
            selectedProject={selectedProjectData || null}
            onCreateTask={() => setCreateDialogOpen(true)}
          />
        ) : (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">Minhas Tarefas</h1>
              <p className="text-sm md:text-base text-muted-foreground mt-1">
                Visualize e gerencie todas as tarefas atribuídas a você
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 flex-1 sm:flex-none" size="sm">
                <Plus size={16} />
                <span className="hidden sm:inline">Nova Tarefa</span>
                <span className="sm:hidden">Nova</span>
              </Button>
            </div>
          </div>
        )}

        {/* Focus Mode View */}
        {viewMode === "focus" ? (
          <>
            {/* Toggle show completed for focus mode */}
            <div className="flex items-center justify-end gap-2">
              <Switch
                id="show-completed-focus"
                checked={showCompleted}
                onCheckedChange={setShowCompleted}
              />
              <Label htmlFor="show-completed-focus" className="text-xs sm:text-sm text-muted-foreground cursor-pointer">
                Exibir concluídas
              </Label>
            </div>
            <FocusModeView 
              tasks={focusModeTasks} 
              queryKeyToInvalidate={["my-tasks", "tasks", "project-all-tasks"]}
            />
          </>
        ) : (
          <>
            {/* Summary Cards - Management Mode */}
            <div className="grid gap-3 grid-cols-3">
              <Card className="border-l-4 border-l-chart-1">
                <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
                  <FolderOpen className="h-5 w-5 sm:h-8 sm:w-8 text-chart-1 flex-shrink-0" />
                  <div>
                    <p className="text-lg sm:text-2xl font-bold">{projectTypeTasks.length}</p>
                    <p className="text-[10px] sm:text-sm text-muted-foreground">Projeto</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-chart-4">
                <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
                  <User className="h-5 w-5 sm:h-8 sm:w-8 text-chart-4 flex-shrink-0" />
                  <div>
                    <p className="text-lg sm:text-2xl font-bold">{personalTasks.length}</p>
                    <p className="text-[10px] sm:text-sm text-muted-foreground">Pessoais</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-chart-3">
                <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
                  <RefreshCw className="h-5 w-5 sm:h-8 sm:w-8 text-chart-3 flex-shrink-0" />
                  <div>
                    <p className="text-lg sm:text-2xl font-bold">{routineTypeTasks.length}</p>
                    <p className="text-[10px] sm:text-sm text-muted-foreground">Rotina</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Mobile Filter Drawer */}
            <MobileFilterDrawer
              title="Filtrar Tarefas"
              description="Aplique filtros para encontrar tarefas específicas"
              activeFiltersCount={activeFiltersCount}
              open={filterDrawerOpen}
              onOpenChange={setFilterDrawerOpen}
            >
              <TaskFilters
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                priorityFilter={priorityFilter}
                onPriorityChange={setPriorityFilter}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                dueDateFilter={dueDateFilter}
                onDueDateChange={setDueDateFilter}
                projectFilter={projectFilter}
                onProjectChange={setProjectFilter}
                projects={projects}
                typeFilter={typeFilter}
                onTypeChange={setTypeFilter}
                onClearAll={clearAllFilters}
              />
            </MobileFilterDrawer>

            {/* Desktop Filters - Collapsible */}
            <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen} className="hidden md:block">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 p-0 h-auto font-medium text-sm hover:bg-transparent">
                  {isFiltersOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Filtros
                  {activeFiltersCount > 0 && (
                    <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                      {activeFiltersCount}
                    </span>
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <TaskFilters
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  priorityFilter={priorityFilter}
                  onPriorityChange={setPriorityFilter}
                  statusFilter={statusFilter}
                  onStatusChange={setStatusFilter}
                  dueDateFilter={dueDateFilter}
                  onDueDateChange={setDueDateFilter}
                  projectFilter={projectFilter}
                  onProjectChange={setProjectFilter}
                  projects={projects}
                  typeFilter={typeFilter}
                  onTypeChange={setTypeFilter}
                  onClearAll={clearAllFilters}
                />
              </CollapsibleContent>
            </Collapsible>

            {/* Toggle show completed */}
            <div className="flex items-center justify-end gap-2">
              <Switch
                id="show-completed"
                checked={showCompleted}
                onCheckedChange={setShowCompleted}
              />
              <Label htmlFor="show-completed" className="text-xs sm:text-sm text-muted-foreground cursor-pointer">
                Exibir concluídas
              </Label>
            </div>

            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto gap-1">
                <TabsTrigger value="all" className="text-xs sm:text-sm">
                  Todas <span className="hidden sm:inline">({filteredTasks.length})</span>
                </TabsTrigger>
                <TabsTrigger value="todo" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">A fazer</span>
                  <span className="sm:hidden">Fazer</span>
                  <span className="hidden sm:inline">({todoTasks.length})</span>
                </TabsTrigger>
                <TabsTrigger value="in_progress" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <PlayCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Fazendo</span>
                  <span className="sm:hidden">Fazendo</span>
                  <span className="hidden sm:inline">({inProgressTasks.length})</span>
                </TabsTrigger>
                <TabsTrigger value="completed" className="gap-1 sm:gap-2 text-xs sm:text-sm">
                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Feito</span>
                  <span className="sm:hidden">Feito</span>
                  <span className="hidden sm:inline">({completedTasks.length})</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-4 md:mt-6">
                <UnifiedTaskView 
                  tasks={filteredTasks} 
                  showGrouping={true}
                  queryKeyToInvalidate={["my-tasks", "tasks"]}
                />
              </TabsContent>

              <TabsContent value="todo" className="mt-4 md:mt-6">
                <UnifiedTaskView 
                  tasks={todoTasks} 
                  showGrouping={true}
                  queryKeyToInvalidate={["my-tasks", "tasks"]}
                />
              </TabsContent>

              <TabsContent value="in_progress" className="mt-4 md:mt-6">
                <UnifiedTaskView 
                  tasks={inProgressTasks} 
                  showGrouping={true}
                  queryKeyToInvalidate={["my-tasks", "tasks"]}
                />
              </TabsContent>

              <TabsContent value="completed" className="mt-4 md:mt-6">
                <UnifiedTaskView 
                  tasks={completedTasks} 
                  showGrouping={true}
                  queryKeyToInvalidate={["my-tasks", "tasks"]}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <CreateMyTaskDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultProjectId={viewMode === "focus" && projectFilter !== "all" ? projectFilter : null}
      />
    </AppLayout>
  );
}
