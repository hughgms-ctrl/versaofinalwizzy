import { Card } from "@/fluzz/components/ui/card";
import { Badge } from "@/fluzz/components/ui/badge";
import { Input } from "@/fluzz/components/ui/input";
import { Calendar, Briefcase, Shield } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/fluzz/components/ui/dropdown-menu";
import { formatDateBR, isTaskOverdue, isTaskDueSoon } from "@/fluzz/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface TaskCardProps {
  task: any;
  onDelete: () => void;
  isDraggable?: boolean;
}

export const TaskCard = ({ task, onDelete, isDraggable = false }: TaskCardProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [taskTitle, setTaskTitle] = useState(task.title);
  const [isDragging, setIsDragging] = useState(false);
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null);
  const [clickTimeout, setClickTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const { data: subtasks } = useQuery({
    queryKey: ["subtasks", task.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subtasks")
        .select("*")
        .eq("task_id", task.id);
      if (error) throw error;
      return data;
    },
  });

  const { data: sectorData } = useQuery({
    queryKey: ["position", task.setor, workspace?.id],
    queryFn: async () => {
      if (!task.setor || !workspace) return null;
      
      // Check if setor is a valid UUID format
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(task.setor);
      
      if (isUUID) {
        const { data, error } = await supabase
          .from("positions")
          .select("id, name")
          .eq("id", task.setor)
          .single();
        if (!error && data) return data;
      }
      
      // Fallback: try to find by name
      const { data, error } = await supabase
        .from("positions")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .eq("name", task.setor)
        .single();
      if (error) return { id: task.setor, name: task.setor };
      return data;
    },
    enabled: !!task.setor && !!workspace,
  });

  const totalSubtasks = subtasks?.length || 0;
  const completedSubtasks = subtasks?.filter((s) => s.completed).length || 0;
  const subtaskProgress = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;

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
    completed: "Feito",
  };

  const statusColors = {
    todo: "bg-status-todo text-status-todo-foreground",
    in_progress: "bg-status-in-progress text-status-in-progress-foreground",
    completed: "bg-status-completed text-status-completed-foreground",
  };

  const updateTitleMutation = useMutation({
    mutationFn: async (newTitle: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ title: newTitle })
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Título atualizado!");
      setIsEditingTitle(false);
    },
    onError: () => {
      toast.error("Erro ao atualizar título");
      setTaskTitle(task.title);
    },
  });

  const updatePriorityMutation = useMutation({
    mutationFn: async (priority: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ priority })
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Prioridade atualizada!");
    },
  });

  const handleStatusChange = async (newStatus: string) => {
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ status: newStatus })
        .eq("id", task.id);
      
      if (error) {
        toast.error("Erro ao atualizar status");
        return;
      }
      
      toast.success("Status atualizado!");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["project"] });
    } catch (err) {
      toast.error("Erro ao atualizar status");
    }
  };

  const isOverdue = isTaskOverdue(task.due_date, task.status);
  const isDueSoon = isTaskDueSoon(task.due_date, task.status);

  const handleTitleBlur = () => {
    if (taskTitle.trim() && taskTitle !== task.title) {
      updateTitleMutation.mutate(taskTitle.trim());
    } else {
      setIsEditingTitle(false);
      setTaskTitle(task.title);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Não navegar se clicou em elementos interativos
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'BUTTON' ||
      target.closest('[role="menu"]') ||
      target.closest('button') ||
      target.closest('[data-radix-popper-content-wrapper]') ||
      target.closest('[data-title-area]')
    ) {
      e.stopPropagation();
      return;
    }

    // Se está arrastando, não navegar
    if (isDragging) {
      return;
    }
    
    navigate(`/tools/wizzy-flow/tasks/${task.id}`);
  };

  const handleTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Clear any existing timeout
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
      // This is a double click - enter edit mode
      setIsEditingTitle(true);
    } else {
      // Set a timeout for single click
      const timeout = setTimeout(() => {
        setClickTimeout(null);
        // Single click - navigate to task
        navigate(`/tools/wizzy-flow/tasks/${task.id}`);
      }, 250);
      setClickTimeout(timeout);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isDraggable) {
      setMouseDownPos({ x: e.clientX, y: e.clientY });
      setIsDragging(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggable && mouseDownPos) {
      const dx = Math.abs(e.clientX - mouseDownPos.x);
      const dy = Math.abs(e.clientY - mouseDownPos.y);
      if (dx > 5 || dy > 5) {
        setIsDragging(true);
      }
    }
  };

  const handleMouseUp = () => {
    setMouseDownPos(null);
    // Reset isDragging after a short delay to allow click to process
    setTimeout(() => setIsDragging(false), 100);
  };

  return (
    <Card 
      className={`p-3 hover:shadow-md transition-shadow ${isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} group`}
      onClick={handleCardClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          {isEditingTitle ? (
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTitleBlur();
                if (e.key === "Escape") {
                  setTaskTitle(task.title);
                  setIsEditingTitle(false);
                }
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-sm h-7 flex-1"
              autoFocus
            />
          ) : (
            <h3 
              data-title-area
              className="font-medium text-sm text-foreground flex-1 cursor-text hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
              onClick={handleTitleClick}
              title="Clique duplo para editar"
            >
              {task.title}
            </h3>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                type="button"
                className="focus:outline-none"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
              >
                <Badge 
                  variant={priorityColors[task.priority as keyof typeof priorityColors] as any}
                  className="cursor-pointer text-xs px-2 py-0 h-5 hover:opacity-80"
                >
                  {priorityLabels[task.priority as keyof typeof priorityLabels]}
                </Badge>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="start" 
              className="z-50 bg-popover"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <DropdownMenuItem onSelect={() => updatePriorityMutation.mutate("high")}>
                Alta
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => updatePriorityMutation.mutate("medium")}>
                Média
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => updatePriorityMutation.mutate("low")}>
                Baixa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                type="button"
                className="focus:outline-none"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
              >
                <Badge className={`cursor-pointer text-xs px-2 py-0 h-5 hover:opacity-80 ${statusColors[task.status as keyof typeof statusColors]}`}>
                  {statusLabels[task.status as keyof typeof statusLabels]}
                </Badge>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="start" 
              className="z-50 bg-popover"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <DropdownMenuItem onSelect={() => handleStatusChange("todo")}>
                A fazer
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleStatusChange("in_progress")}>
                Fazendo
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleStatusChange("completed")}>
                Feito
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {task.due_date && (
            <div className={`flex items-center gap-1 text-xs ${isOverdue ? "text-destructive" : isDueSoon ? "text-amber-500 dark:text-amber-400" : "text-muted-foreground"}`}>
              <Calendar size={10} />
              {formatDateBR(task.due_date).slice(0, 5)}
            </div>
          )}

          {sectorData && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Briefcase size={10} />
              {sectorData.name}
            </div>
          )}

          {task.requires_approval && task.approval_status === "pending" && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-300">
              <Shield size={10} />
              Validação Pendente
            </Badge>
          )}
          
          {task.requires_approval && task.approval_status === "approved" && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 border-emerald-300">
              <Shield size={10} />
              Aprovada
            </Badge>
          )}
          
          {task.requires_approval && task.approval_status === "rejected" && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 gap-1 bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200 border-rose-300">
              <Shield size={10} />
              Ajuste Solicitado
            </Badge>
          )}
        </div>

        {totalSubtasks > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <div className="h-1.5 flex-1 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${subtaskProgress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {completedSubtasks}/{totalSubtasks}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
};
