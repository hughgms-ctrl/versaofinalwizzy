import { useState } from "react";
import { Check, Calendar, ChevronRight } from "lucide-react";
import { cn, formatDateBR, isTaskOverdue, isTaskDueSoon } from "@/fluzz/lib/utils";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface FocusModeTaskItemProps {
  task: any;
  profiles: any[];
  onClick: () => void;
  queryKeyToInvalidate?: string[];
}

const priorityColors = {
  high: "border-destructive bg-destructive/10",
  medium: "border-warning bg-warning/10", 
  low: "border-info bg-info/10",
};

const priorityBorderColors = {
  high: "border-destructive",
  medium: "border-warning",
  low: "border-info",
};

export function FocusModeTaskItem({ 
  task, 
  profiles, 
  onClick,
  queryKeyToInvalidate = ["my-tasks", "tasks"]
}: FocusModeTaskItemProps) {
  const queryClient = useQueryClient();
  const [isCompleting, setIsCompleting] = useState(false);
  
  const isCompleted = task.status === "completed";
  const isOverdue = isTaskOverdue(task.due_date, task.status);
  const isDueSoon = isTaskDueSoon(task.due_date, task.status);
  
  // Get first assignee for display
  const taskAssignees = task.task_assignees || [];
  const firstAssignee = taskAssignees.length > 0 
    ? profiles?.find(p => p.id === taskAssignees[0].user_id)
    : null;

  const handleCheckClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCompleting(true);
    
    const newStatus = isCompleted ? "todo" : "completed";
    
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ status: newStatus })
        .eq("id", task.id);
      
      if (error) throw error;
      
      queryKeyToInvalidate.forEach(key => 
        queryClient.invalidateQueries({ queryKey: [key] })
      );
      
      toast.success(newStatus === "completed" ? "Tarefa concluída!" : "Tarefa reaberta");
    } catch (error) {
      toast.error("Erro ao atualizar tarefa");
    } finally {
      setIsCompleting(false);
    }
  };

  const priorityLevel = task.priority || "medium";

  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-start gap-3 py-3 px-2 border-b border-border/50 bg-card transition-all duration-200 cursor-pointer",
        "hover:bg-accent/30",
        isCompleted && "opacity-60"
      )}
    >
      {/* Circular Checkbox - Todoist style */}
      <button
        onClick={handleCheckClick}
        disabled={isCompleting}
        className={cn(
          "flex-shrink-0 w-5 h-5 rounded-full border-2 transition-all duration-200 mt-0.5",
          "flex items-center justify-center",
          isCompleted 
            ? "bg-primary border-primary" 
            : cn(
                "border-muted-foreground/40 hover:border-primary",
                priorityBorderColors[priorityLevel as keyof typeof priorityBorderColors]
              ),
          isCompleting && "animate-pulse"
        )}
      >
        {isCompleted && (
          <Check className="h-3 w-3 text-primary-foreground" />
        )}
      </button>

      {/* Task Content - Todoist style: title wraps, date below */}
      <div className="flex-1 min-w-0">
        {/* Title - Full display, wraps to multiple lines */}
        <p className={cn(
          "font-medium text-sm leading-snug",
          isCompleted && "line-through text-muted-foreground"
        )}>
          {task.title}
        </p>

        {/* Due Date + Project - Below title */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {task.due_date && (
            <span className={cn(
              "flex items-center gap-1 text-xs",
              isOverdue && "text-destructive font-medium",
              isDueSoon && !isOverdue && "text-warning",
              !isOverdue && !isDueSoon && "text-muted-foreground"
            )}>
              <Calendar className="h-3 w-3" />
              {formatDateBR(task.due_date).slice(0, 5)}
            </span>
          )}
          {task.projects?.name && (
            <span className="text-xs text-muted-foreground/70 truncate max-w-[140px]">
              {task.projects.name}
            </span>
          )}
        </div>
      </div>

      {/* Arrow Indicator */}
      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors flex-shrink-0 mt-0.5" />
    </div>
  );
}
