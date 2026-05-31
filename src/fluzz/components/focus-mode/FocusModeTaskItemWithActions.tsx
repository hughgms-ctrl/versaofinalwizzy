import { useState } from "react";
import { Check, Calendar, ChevronRight, Pencil, CalendarDays, MessageSquare, User, MoreHorizontal, GripVertical } from "lucide-react";
import { cn, formatDateBR, isTaskOverdue, isTaskDueSoon } from "@/fluzz/lib/utils";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/fluzz/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/fluzz/components/ui/popover";
import { Calendar as CalendarComponent } from "@/fluzz/components/ui/calendar";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/fluzz/components/ui/dropdown-menu";

interface FocusModeTaskItemWithActionsProps {
  task: any;
  profiles: any[];
  onClick: () => void;
  queryKeyToInvalidate?: string[];
  isDraggable?: boolean;
}

const priorityBorderColors = {
  high: "border-destructive",
  medium: "border-warning",
  low: "border-info",
};

export function FocusModeTaskItemWithActions({ 
  task, 
  profiles, 
  onClick,
  queryKeyToInvalidate = ["my-tasks", "tasks"],
  isDraggable = false,
}: FocusModeTaskItemWithActionsProps) {
  const queryClient = useQueryClient();
  const [isCompleting, setIsCompleting] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  
  const isCompleted = task.status === "completed";
  const isOverdue = isTaskOverdue(task.due_date, task.status);
  const isDueSoon = isTaskDueSoon(task.due_date, task.status);
  
  // Get assignees
  const taskAssignees = task.task_assignees || [];
  const assignedProfiles = taskAssignees
    .map((ta: any) => profiles?.find(p => p.id === ta.user_id))
    .filter(Boolean);
  const firstAssignee = assignedProfiles[0];

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

  const handleDateChange = async (date: Date | undefined) => {
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ due_date: date ? format(date, "yyyy-MM-dd") : null })
        .eq("id", task.id);
      
      if (error) throw error;
      
      queryKeyToInvalidate.forEach(key => 
        queryClient.invalidateQueries({ queryKey: [key] })
      );
      toast.success("Data atualizada!");
      setDateOpen(false);
    } catch (error) {
      toast.error("Erro ao atualizar data");
    }
  };

  const handleAssigneeToggle = async (userId: string) => {
    const isAssigned = taskAssignees.some((ta: any) => ta.user_id === userId);
    
    try {
      if (isAssigned) {
        const { error } = await supabase
          .from("task_assignees")
          .delete()
          .eq("task_id", task.id)
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("task_assignees")
          .insert({ task_id: task.id, user_id: userId });
        if (error) throw error;
      }
      
      queryKeyToInvalidate.forEach(key => 
        queryClient.invalidateQueries({ queryKey: [key] })
      );
      toast.success(isAssigned ? "Responsável removido" : "Responsável adicionado");
    } catch (error) {
      toast.error("Erro ao atualizar responsável");
    }
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", task.id);
      
      if (error) throw error;
      
      queryKeyToInvalidate.forEach(key => 
        queryClient.invalidateQueries({ queryKey: [key] })
      );
      toast.success("Tarefa excluída!");
    } catch (error) {
      toast.error("Erro ao excluir tarefa");
    }
  };

  const priorityLevel = task.priority || "medium";

  return (
    <div
      className={cn(
        "group flex items-center gap-2 p-3 rounded-lg border bg-card transition-all duration-200",
        "hover:bg-accent/30 hover:border-accent",
        isCompleted && "opacity-60"
      )}
    >
      {/* Drag Handle */}
      {isDraggable && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab touch-none">
          <GripVertical className="h-4 w-4 text-muted-foreground/50" />
        </div>
      )}

      {/* Circular Checkbox */}
      <button
        onClick={handleCheckClick}
        disabled={isCompleting}
        className={cn(
          "flex-shrink-0 w-5 h-5 rounded-full border-2 transition-all duration-200",
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

      {/* Task Content */}
      <div 
        onClick={onClick}
        className="flex-1 min-w-0 cursor-pointer"
      >
        <p className={cn(
          "font-medium text-sm leading-snug",
          isCompleted && "line-through text-muted-foreground"
        )}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {task.due_date && (
            <span className={cn(
              "text-xs flex items-center gap-1",
              isOverdue && "text-destructive font-medium",
              isDueSoon && !isOverdue && "text-warning",
              !isOverdue && !isDueSoon && "text-muted-foreground"
            )}>
              <Calendar className="h-3 w-3" />
              {formatDateBR(task.due_date)}
            </span>
          )}
          {task.projects?.name && (
            <span className="text-xs text-muted-foreground/70 truncate max-w-[140px]">
              {task.projects.name}
            </span>
          )}
        </div>
      </div>

      {/* Action Buttons - Visible on Hover, desktop only */}
      <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Edit Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>

        {/* Date Picker */}
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => e.stopPropagation()}
            >
              <CalendarDays className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end" onClick={(e) => e.stopPropagation()}>
            <CalendarComponent
              mode="single"
              selected={task.due_date ? new Date(task.due_date) : undefined}
              onSelect={handleDateChange}
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>

        {/* Comments (placeholder - opens detail) */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </Button>

        {/* Assignee Picker */}
        <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => e.stopPropagation()}
            >
              {firstAssignee ? (
                <Avatar className="h-5 w-5">
                  <AvatarImage src={firstAssignee.avatar_url} />
                  <AvatarFallback className="text-[10px]">
                    {firstAssignee.full_name?.charAt(0)?.toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <User className="h-3.5 w-3.5" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground mb-2">Responsáveis</p>
              {profiles?.map((profile: any) => {
                const isAssigned = taskAssignees.some((ta: any) => ta.user_id === profile.id);
                return (
                  <button
                    key={profile.id}
                    onClick={() => handleAssigneeToggle(profile.id)}
                    className={cn(
                      "w-full flex items-center gap-2 p-2 rounded-md text-sm transition-colors",
                      isAssigned ? "bg-primary/10" : "hover:bg-accent"
                    )}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={profile.avatar_url} />
                      <AvatarFallback className="text-xs">
                        {profile.full_name?.charAt(0)?.toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 text-left truncate">{profile.full_name || "Sem nome"}</span>
                    {isAssigned && <Check className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* More Options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={onClick}>
              Editar detalhes
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              Excluir tarefa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Arrow - Mobile */}
      <ChevronRight 
        onClick={onClick}
        className="h-4 w-4 text-muted-foreground/40 transition-colors flex-shrink-0 cursor-pointer sm:hidden" 
      />
    </div>
  );
}
