import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { Button } from "@/fluzz/components/ui/button";
import { Badge } from "@/fluzz/components/ui/badge";
import { Input } from "@/fluzz/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/fluzz/components/ui/popover";
import { Calendar } from "@/fluzz/components/ui/calendar";
import { Plus, ArrowLeft, LayoutGrid, List, BarChart3, FileText, GanttChartSquare, CalendarDays, Bell, FileEdit, ChevronDown, ChevronRight, Palette } from "lucide-react";
import { CreateTaskDialog } from "@/fluzz/components/tasks/CreateTaskDialog";
import { DraggableTaskBoard } from "@/fluzz/components/tasks/DraggableTaskBoard";
import { MobileKanbanBoard } from "@/fluzz/components/tasks/MobileKanbanBoard";
import { useIsMobile } from "@/fluzz/hooks/use-mobile";
import { TaskTableView } from "@/fluzz/components/tasks/TaskTableView";
import { TaskFilters } from "@/fluzz/components/tasks/TaskFilters";
import { MobileFilterDrawer } from "@/fluzz/components/filters/MobileFilterDrawer";
import { ProjectDashboard } from "@/fluzz/components/projects/ProjectDashboard";
import { ProjectNotes } from "@/fluzz/components/projects/ProjectNotes";
import { TimelineView } from "@/fluzz/components/tasks/TimelineView";
import BriefingDebriefingTab from "@/fluzz/components/briefing/BriefingDebriefingTab";
import { toast } from "sonner";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/fluzz/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/fluzz/components/ui/collapsible";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn, parseDateOnly, isTaskOverdue } from "@/fluzz/lib/utils";

// task_order é uma ordenação global única por projeto. Para reordenar dentro de um
// subconjunto (ex: uma coluna do Kanban, ou a lista filtrada), a tarefa arrastada é
// reposicionada dentro da lista completa usando os vizinhos do subconjunto como
// âncoras, e a lista inteira é renumerada sequencialmente. Isso mantém a ordem
// consistente entre as visualizações de lista, kanban e cronograma, que compartilham
// a mesma coluna task_order.
function reorderWithinSubset(
  allTasks: any[],
  taskId: string,
  newIndexInSubset: number,
  isInSubset: (task: any) => boolean
): any[] | null {
  const sorted = [...allTasks].sort((a, b) => (a.task_order || 0) - (b.task_order || 0));
  const fromIndex = sorted.findIndex((t) => t.id === taskId);
  if (fromIndex === -1) return null;

  const [movedTask] = sorted.splice(fromIndex, 1);
  const subsetIds = sorted.filter(isInSubset).map((t) => t.id);
  const anchorId = subsetIds[newIndexInSubset];

  let insertAt: number;
  if (anchorId) {
    insertAt = sorted.findIndex((t) => t.id === anchorId);
  } else if (subsetIds.length > 0) {
    insertAt = sorted.findIndex((t) => t.id === subsetIds[subsetIds.length - 1]) + 1;
  } else {
    insertAt = sorted.length;
  }

  sorted.splice(insertAt, 0, movedTask);
  return sorted;
}

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { permissions, isAdmin, isGestor } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "tasks" | "notes" | "briefing">("tasks");
  const [view, setView] = useState<"board" | "list" | "timeline">("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dueDateFilter, setDueDateFilter] = useState("all");
  const [setorFilter, setSetorFilter] = useState("all");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  
  
  // Load sort mode from localStorage for this project - default to Manual (drag-and-drop)
  const [sortMode, setSortMode] = useState<"manual" | "az">(() => {
    const saved = localStorage.getItem(`project-sort-mode-${id}`);
    return (saved === "az" || saved === "manual") ? saved : "manual";
  });

  // Persist sort mode changes to localStorage
  const handleSortModeChange = (mode: "manual" | "az") => {
    setSortMode(mode);
    localStorage.setItem(`project-sort-mode-${id}`, mode);
  };

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      setProjectName(data.name);
      setProjectDescription(data.description || "");
      return data;
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({ name, description, start_date, end_date, color }: { 
      name?: string; 
      description?: string; 
      start_date?: string | null;
      end_date?: string | null;
      color?: string | null;
    }) => {
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description || null;
      if (start_date !== undefined) updates.start_date = start_date;
      if (end_date !== undefined) updates.end_date = end_date;
      if (color !== undefined) updates.color = color;
      
      const { error } = await supabase
        .from("projects")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Projeto atualizado!");
      setIsEditingName(false);
      setIsEditingDescription(false);
    },
    onError: () => {
      toast.error("Erro ao atualizar projeto");
      setProjectName(project?.name || "");
      setProjectDescription(project?.description || "");
    },
  });

  // Mutation para notificar responsáveis (quando o usuário termina de editar)
  const notifyResponsiblesMutation = useMutation({
    mutationFn: async () => {
      if (!project || !id) throw new Error("Projeto não encontrado");

      // Buscar todas as tarefas do projeto com assigned_to
      const { data: tasksToNotify, error: tasksError } = await supabase
        .from("tasks")
        .select("id, title, assigned_to")
        .eq("project_id", id)
        .not("assigned_to", "is", null);

      if (tasksError) throw tasksError;

      // Agrupar tarefas por usuário
      const assignedUserTasks: Record<string, { taskId: string; taskTitle: string }[]> = {};
      
      tasksToNotify?.forEach((task) => {
        if (task.assigned_to) {
          if (!assignedUserTasks[task.assigned_to]) {
            assignedUserTasks[task.assigned_to] = [];
          }
          assignedUserTasks[task.assigned_to].push({
            taskId: task.id,
            taskTitle: task.title,
          });
        }
      });

      // Criar notificações
      const notifications = Object.entries(assignedUserTasks).map(([userId, userTasks]) => ({
        user_id: userId,
        workspace_id: project.workspace_id,
        type: 'task_assigned',
        title: 'Novas tarefas atribuídas',
        message: userTasks.length === 1
          ? `Você foi atribuído à tarefa "${userTasks[0].taskTitle}" no projeto ${project.name}`
          : `Você foi atribuído a ${userTasks.length} tarefas no projeto ${project.name}`,
        link: `/projects/${id}`,
        data: {
          project_id: id,
          project_name: project.name,
          tasks: userTasks,
        },
      }));

      // Notificar responsáveis é best-effort: uma falha aqui (ex: RLS na tabela
      // notifications) não pode impedir a publicação do projeto.
      if (notifications.length > 0) {
        const { error: notifError } = await supabase
          .from("notifications")
          .insert(notifications);

        if (notifError) console.error("Erro ao notificar responsáveis:", notifError);
      }

      // Marcar projeto como publicado (is_draft = false, pending_notifications = false)
      const { error: updateError } = await supabase
        .from("projects")
        .update({
          pending_notifications: false,
          is_draft: false
        })
        .eq("id", id);

      if (updateError) throw updateError;

      return notifications.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      if (count > 0) {
        toast.success(`Projeto publicado! ${count} responsável(eis) notificado(s).`);
      } else {
        toast.success("Projeto publicado!");
      }
    },
    onError: (error) => {
      console.error("Erro ao publicar projeto:", error);
      toast.error("Erro ao publicar projeto");
    },
  });

  const parseDateOnly = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
    return new Date(y, (m || 1) - 1, d || 1);
  };

  const handleStartDateChange = (date: Date | undefined) => {
    if (!date) {
      updateProjectMutation.mutate({ start_date: null });
      return;
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    
    // If end_date is before new start_date, update end_date too
    if (project?.end_date && dateStr > project.end_date) {
      updateProjectMutation.mutate({ start_date: dateStr, end_date: dateStr });
    } else {
      updateProjectMutation.mutate({ start_date: dateStr });
    }
  };

  const handleEndDateChange = (date: Date | undefined) => {
    if (!date) {
      updateProjectMutation.mutate({ end_date: null });
      return;
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    updateProjectMutation.mutate({ end_date: dateStr });
  };

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Real-time updates for tasks
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel('project-tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `project_id=eq.${id}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["tasks", id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", id] });
      toast.success("Tarefa excluída com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao excluir tarefa");
    },
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      console.log("ProjectDetail - Atualizando status:", { taskId, status });
      const { data, error } = await supabase
        .from("tasks")
        .update({ status })
        .eq("id", taskId)
        .select();
      if (error) {
        console.error("ProjectDetail - Erro Supabase:", error);
        throw error;
      }
      console.log("ProjectDetail - Resposta Supabase:", data);
      return data;
    },
    onSuccess: (data) => {
      console.log("ProjectDetail - onSuccess:", data);
      queryClient.invalidateQueries({ queryKey: ["tasks", id] });
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      toast.success("Status atualizado!");
    },
    onError: (error) => {
      console.error("ProjectDetail - onError:", error);
      toast.error("Erro ao atualizar status");
    },
  });

  // Reordenação (Kanban, Lista, Cronograma): o subconjunto (coluna do Kanban ou
  // lista filtrada) é decidido no local da chamada; aqui só persistimos a ordem
  // global já recalculada. Atualização otimista (onMutate) resolve o "salto" visual
  // (a tarefa voltar para o lugar original antes de ir pro destino) instantaneamente;
  // os updates em paralelo (em vez de N chamadas sequenciais aguardadas uma a uma)
  // reduzem a demora até a confirmação do servidor.
  const reorderTasksMutation = useMutation({
    mutationFn: async ({ reordered }: { reordered: any[] }) => {
      const results = await Promise.all(
        reordered
          .map((t, i) => ({ id: t.id, task_order: i }))
          .filter((t, i) => (reordered[i].task_order || 0) !== t.task_order)
          .map((t) =>
            supabase.from("tasks").update({ task_order: t.task_order }).eq("id", t.id)
          )
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onMutate: async ({ reordered }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks", id] });
      const previous = queryClient.getQueryData<any[]>(["tasks", id]);
      queryClient.setQueryData(
        ["tasks", id],
        reordered.map((t, i) => ({ ...t, task_order: i }))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["tasks", id], context.previous);
      toast.error("Erro ao reordenar tarefa");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", id] });
    },
  });

  // Apply filters
  const filteredTasks = tasks?.filter((task) => {
    const matchesSearch =
      searchTerm === "" ||
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    const matchesSetor = setorFilter === "all" || task.setor === setorFilter;

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

    return matchesSearch && matchesPriority && matchesStatus && matchesDueDate && matchesSetor;
  }) || [];

  // Reordenar dentro de uma coluna do Kanban (subconjunto = mesmo status).
  const handleColumnReorder = (taskId: string, newOrder: number, status: string) => {
    const reordered = reorderWithinSubset(tasks || [], taskId, newOrder, (t) => t.status === status);
    if (reordered) reorderTasksMutation.mutate({ reordered });
  };

  // Reordenar na Lista/Cronograma (subconjunto = tarefas atualmente visíveis com os filtros ativos).
  const handleListReorder = (taskId: string, newOrder: number) => {
    const visibleIds = new Set(filteredTasks.map((t) => t.id));
    const reordered = reorderWithinSubset(tasks || [], taskId, newOrder, (t) => visibleIds.has(t.id));
    if (reordered) reorderTasksMutation.mutate({ reordered });
  };

  // Fetch positions to get sector names
  const { data: positions } = useQuery({
    queryKey: ["positions-for-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("id, name");
      if (error) throw error;
      return data;
    },
  });

  // Map sector IDs to names
  const getSetorName = (setorId: string) => {
    const position = positions?.find(p => p.id === setorId);
    return position?.name || setorId;
  };

  // Get unique sectors with their names
  const uniqueSetoresIds = Array.from(new Set(tasks?.filter(t => t.setor).map(t => t.setor))) as string[];
  const setoresWithNames = uniqueSetoresIds.map(id => ({
    id,
    name: getSetorName(id)
  }));

  const isOwner = project?.user_id === user?.id;

  const activeFiltersCount = [
    searchTerm !== "",
    priorityFilter !== "all",
    statusFilter !== "all",
    dueDateFilter !== "all",
    setorFilter !== "all",
  ].filter(Boolean).length;

  const handleClearAllFilters = () => {
    setSearchTerm("");
    setPriorityFilter("all");
    setStatusFilter("all");
    setDueDateFilter("all");
    setSetorFilter("all");
  };

  const handleNameBlur = () => {
    if (projectName.trim() && projectName !== project?.name) {
      updateProjectMutation.mutate({ name: projectName.trim() });
    } else {
      setIsEditingName(false);
      setProjectName(project?.name || "");
    }
  };

  const handleDescriptionBlur = () => {
    if (projectDescription !== (project?.description || "")) {
      updateProjectMutation.mutate({ description: projectDescription.trim() });
    } else {
      setIsEditingDescription(false);
      setProjectDescription(project?.description || "");
    }
  };

  const handleDashboardFilterClick = (filterType: string, filterValue: string) => {
    setActiveTab("tasks");
    if (filterType === "status") {
      setStatusFilter(filterValue);
    } else if (filterType === "dueDate") {
      setDueDateFilter(filterValue);
    }
  };

  if (projectLoading || tasksLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">Projeto não encontrado</p>
          <Button onClick={() => navigate("/tools/wizzy-flow/projects")}>Voltar aos Projetos</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-2 sm:gap-4 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/tools/wizzy-flow/projects")}
              className="flex-shrink-0 mt-1"
            >
              <ArrowLeft size={20} />
            </Button>
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onBlur={handleNameBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleNameBlur();
                    if (e.key === "Escape") {
                      setProjectName(project?.name || "");
                      setIsEditingName(false);
                    }
                  }}
                  className="text-xl sm:text-2xl md:text-3xl font-bold h-auto py-1 max-w-full"
                  autoFocus
                />
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 
                    className={cn(
                      "text-xl sm:text-2xl md:text-3xl font-bold transition-colors cursor-pointer break-words",
                      project.color === "blue" && "text-blue-500",
                      project.color === "emerald" && "text-emerald-500",
                      project.color === "amber" && "text-amber-500",
                      project.color === "purple" && "text-purple-500",
                      project.color === "pink" && "text-pink-500",
                      project.color === "cyan" && "text-cyan-500",
                      project.color === "rose" && "text-rose-500",
                      project.color === "orange" && "text-orange-500",
                      project.color === "teal" && "text-teal-500",
                      (project.color === "primary" || !project.color) && "text-primary"
                    )}
                    onClick={() => setIsEditingName(true)}
                  >
                    {project.name}
                  </h1>
                  {project.is_draft && (
                    <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                      <FileEdit className="h-3 w-3 mr-1" />
                      Rascunho
                    </Badge>
                  )}
                </div>
              )}
              {isEditingDescription ? (
                <Input
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  onBlur={handleDescriptionBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleDescriptionBlur();
                    if (e.key === "Escape") {
                      setProjectDescription(project?.description || "");
                      setIsEditingDescription(false);
                    }
                  }}
                  className="text-sm text-muted-foreground mt-1 max-w-full"
                  placeholder="Adicione uma descrição..."
                  autoFocus
                />
              ) : (
                <p 
                  className="text-xs sm:text-sm text-muted-foreground mt-1 hover:text-foreground transition-colors cursor-pointer line-clamp-2"
                  onClick={() => setIsEditingDescription(true)}
                >
                  {project.description || "Clique para adicionar descrição..."}
                </p>
              )}
              
              {/* Project Dates */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "gap-1.5 text-xs justify-start h-7 px-2",
                        !project.start_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarDays size={14} />
                      {project.start_date
                        ? format(parseDateOnly(project.start_date), "dd/MM/yyyy", { locale: ptBR })
                        : "Início"
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={project.start_date ? parseDateOnly(project.start_date) : undefined}
                      onSelect={handleStartDateChange}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <span className="text-xs text-muted-foreground">→</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "gap-1.5 text-xs justify-start h-7 px-2",
                        !project.end_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarDays size={14} />
                      {project.end_date
                        ? format(parseDateOnly(project.end_date), "dd/MM/yyyy", { locale: ptBR })
                        : "Fim"
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={project.end_date ? parseDateOnly(project.end_date) : undefined}
                      onSelect={handleEndDateChange}
                      disabled={(date) => project.start_date ? date < parseDateOnly(project.start_date) : false}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                {/* Project Color Picker - only for admin/gestor */}
                {(isAdmin || isGestor) && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs h-7 px-2"
                    >
                      <div 
                        className={cn(
                          "w-3 h-3 rounded-full",
                          project.color === "primary" && "bg-primary",
                          project.color === "blue" && "bg-blue-500",
                          project.color === "emerald" && "bg-emerald-500",
                          project.color === "amber" && "bg-amber-500",
                          project.color === "purple" && "bg-purple-500",
                          project.color === "pink" && "bg-pink-500",
                          project.color === "cyan" && "bg-cyan-500",
                          project.color === "rose" && "bg-rose-500",
                          project.color === "orange" && "bg-orange-500",
                          project.color === "teal" && "bg-teal-500",
                          !project.color && "bg-primary"
                        )}
                      />
                      <Palette size={14} className="text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3" align="start">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Cor do Projeto</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: "primary", bg: "bg-primary" },
                          { value: "blue", bg: "bg-blue-500" },
                          { value: "emerald", bg: "bg-emerald-500" },
                          { value: "amber", bg: "bg-amber-500" },
                          { value: "purple", bg: "bg-purple-500" },
                          { value: "pink", bg: "bg-pink-500" },
                          { value: "cyan", bg: "bg-cyan-500" },
                          { value: "rose", bg: "bg-rose-500" },
                          { value: "orange", bg: "bg-orange-500" },
                          { value: "teal", bg: "bg-teal-500" },
                        ].map((color) => (
                          <button
                            key={color.value}
                            onClick={() => updateProjectMutation.mutate({ color: color.value })}
                            className={cn(
                              "w-6 h-6 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary",
                              color.bg,
                              (project.color === color.value || (!project.color && color.value === "primary")) && "ring-2 ring-offset-2 ring-foreground"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Botão de Publicar - só aparece quando is_draft = true */}
            {project.is_draft && (
              <Button
                onClick={() => notifyResponsiblesMutation.mutate()}
                disabled={notifyResponsiblesMutation.isPending}
                className="gap-2 flex-1 sm:flex-initial text-xs sm:text-sm bg-amber-500 hover:bg-amber-600 text-white"
                size="sm"
              >
                <Bell size={14} className="sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">
                  {notifyResponsiblesMutation.isPending ? "Publicando..." : "Publicar"}
                </span>
                <span className="sm:hidden">
                  {notifyResponsiblesMutation.isPending ? "..." : "Publicar"}
                </span>
              </Button>
            )}
            <Button onClick={() => setIsCreateOpen(true)} className="gap-2 flex-1 sm:flex-initial text-xs sm:text-sm" size="sm">
              <Plus size={14} className="sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Nova Tarefa</span>
              <span className="sm:hidden">Nova</span>
            </Button>
          </div>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "dashboard" | "tasks" | "notes" | "briefing")}>
          <TabsList className={`grid w-full max-w-3xl ${permissions?.can_view_briefings ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <TabsTrigger value="tasks" className="gap-2">
              <LayoutGrid size={16} />
              <span className="hidden sm:inline">Tarefas</span>
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-2">
              <BarChart3 size={16} />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-2">
              <FileText size={16} />
              <span className="hidden sm:inline">Notas</span>
            </TabsTrigger>
            {permissions?.can_view_briefings && (
              <TabsTrigger value="briefing" className="gap-2">
                <LayoutGrid size={16} />
                <span className="hidden sm:inline">Briefing</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <ProjectDashboard 
              tasks={tasks || []} 
              onFilterClick={handleDashboardFilterClick}
            />
          </TabsContent>

          <TabsContent value="tasks" className="mt-6 space-y-4">
            {/* Mobile Filter Drawer */}
            <MobileFilterDrawer
              title="Filtrar Tarefas"
              description="Filtre as tarefas por diferentes critérios"
              activeFiltersCount={activeFiltersCount}
              open={isFilterDrawerOpen}
              onOpenChange={setIsFilterDrawerOpen}
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
                setorFilter={setorFilter}
                onSetorChange={setSetorFilter}
                setores={setoresWithNames}
                onClearAll={handleClearAllFilters}
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
                  setorFilter={setorFilter}
                  onSetorChange={setSetorFilter}
                  setores={setoresWithNames}
                  onClearAll={handleClearAllFilters}
                />
              </CollapsibleContent>
            </Collapsible>

            {/* View Toggle - available on all devices, kanban hidden on mobile */}
            <div className="flex justify-end">
              <Tabs value={view} onValueChange={(v) => setView(v as "board" | "list" | "timeline")}>
                <TabsList>
                  <TabsTrigger value="list" className="gap-2">
                    <List size={16} />
                    <span className="hidden sm:inline">Lista</span>
                  </TabsTrigger>
                  {!isMobile && (
                    <TabsTrigger value="board" className="gap-2">
                      <LayoutGrid size={16} />
                      <span className="hidden sm:inline">Kanban</span>
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="timeline" className="gap-2">
                    <GanttChartSquare size={16} />
                    <span className="hidden sm:inline">Cronograma</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {filteredTasks && filteredTasks.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-muted-foreground mb-4">
                  {tasks && tasks.length > 0
                    ? "Nenhuma tarefa corresponde aos filtros aplicados."
                    : "Nenhuma tarefa neste projeto. Comece criando uma!"}
                </p>
                {(!tasks || tasks.length === 0) && (
                  <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                    <Plus size={20} />
                    Criar Primeira Tarefa
                  </Button>
                )}
              </div>
            ) : (
              <>
                {view === "timeline" ? (
                  <TimelineView
                    projectId={id}
                    tasks={filteredTasks || []}
                    onUpdateTaskDates={async (taskId, startDate, dueDate) => {
                      const { error } = await supabase
                        .from("tasks")
                        .update({ start_date: startDate, due_date: dueDate })
                        .eq("id", taskId);
                      if (error) {
                        toast.error("Erro ao atualizar datas");
                      } else {
                        queryClient.invalidateQueries({ queryKey: ["tasks", id] });
                        queryClient.invalidateQueries({ queryKey: ["task", taskId] });
                      }
                    }}
                    onUpdateOrder={handleListReorder}
                    sortMode={sortMode}
                    onSortModeChange={handleSortModeChange}
                    setorNames={positions?.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {}) || {}}
                  />
                ) : view === "board" ? (
                  isMobile ? (
                    <MobileKanbanBoard
                      tasks={filteredTasks || []}
                      onDeleteTask={(taskId) => deleteTaskMutation.mutate(taskId)}
                      onUpdateStatus={(taskId, status) =>
                        updateTaskStatusMutation.mutate({ taskId, status })
                      }
                      onUpdateOrder={handleColumnReorder}
                      sortMode={sortMode}
                      onSortModeChange={handleSortModeChange}
                    />
                  ) : (
                    <DraggableTaskBoard
                      tasks={filteredTasks || []}
                      onDeleteTask={(taskId) => deleteTaskMutation.mutate(taskId)}
                      onUpdateStatus={(taskId, status) =>
                        updateTaskStatusMutation.mutate({ taskId, status })
                      }
                      onUpdateOrder={handleColumnReorder}
                      sortMode={sortMode}
                      onSortModeChange={handleSortModeChange}
                    />
                  )
                ) : (
                  <TaskTableView
                    tasks={filteredTasks || []}
                    onDeleteTask={(taskId) => deleteTaskMutation.mutate(taskId)}
                    onUpdateOrder={handleListReorder}
                    sortMode={sortMode}
                    onSortModeChange={handleSortModeChange}
                  />
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="notes" className="mt-6">
            <ProjectNotes projectId={id!} tasks={tasks || []} />
          </TabsContent>

          <TabsContent value="briefing" className="mt-6">
            <BriefingDebriefingTab projectId={id!} />
          </TabsContent>
        </Tabs>
      </div>

      <CreateTaskDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        projectId={id!}
      />
    </AppLayout>
  );
}