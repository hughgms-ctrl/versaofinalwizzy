import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { Progress } from "@/fluzz/components/ui/progress";
import { Badge } from "@/fluzz/components/ui/badge";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/fluzz/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/fluzz/components/ui/dropdown-menu";
import { 
  ArrowDownAZ, 
  GripVertical, 
  User,
} from "lucide-react";
import { formatDateBR, isTaskOverdue, isTaskDueSoon } from "@/fluzz/lib/utils";
import { toast } from "sonner";
import { 
  DndContext, 
  DragEndEvent, 
  DragOverlay, 
  DragStartEvent, 
  PointerSensor, 
  TouchSensor,
  useSensor, 
  useSensors, 
  closestCenter,
} from "@dnd-kit/core";
import { 
  SortableContext, 
  verticalListSortingStrategy, 
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MultiAssigneeAvatars } from "./MultiAssigneeAvatars";
import { MultiAssigneeDialog } from "./MultiAssigneeDialog";
import { useMultipleTasksAssignees } from "@/fluzz/hooks/useTaskAssignees";

interface TaskTableViewProps {
  tasks: any[];
  onDeleteTask: (taskId: string) => void;
  onUpdateOrder?: (taskId: string, newOrder: number) => void;
  sortMode?: "manual" | "az";
  onSortModeChange?: (mode: "manual" | "az") => void;
}

const statusConfig = {
  todo: { 
    label: "A fazer", 
    className: "bg-status-todo text-status-todo-foreground hover:bg-status-todo/90" 
  },
  in_progress: { 
    label: "Fazendo", 
    className: "bg-status-in-progress text-status-in-progress-foreground hover:bg-status-in-progress/90" 
  },
  completed: { 
    label: "Feito", 
    className: "bg-status-completed text-status-completed-foreground hover:bg-status-completed/90" 
  },
};

const priorityConfig = {
  high: { label: "Alta", className: "bg-[hsl(250,60%,45%)] text-white hover:bg-[hsl(250,60%,40%)]" },
  medium: { label: "Média", className: "bg-[hsl(250,50%,60%)] text-white hover:bg-[hsl(250,50%,55%)]" },
  low: { label: "Baixa", className: "bg-[hsl(260,60%,65%)] text-white hover:bg-[hsl(260,60%,60%)]" },
};

// Natural sort function
const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
};

function SortableTableRow({ 
  task, 
  onStatusChange, 
  onPriorityChange,
  sortMode,
  assignees,
  subtaskProgress,
  onNavigate,
}: { 
  task: any; 
  onStatusChange: (taskId: string, status: string) => void;
  onPriorityChange: (taskId: string, priority: string) => void;
  sortMode: "manual" | "az";
  assignees: { user_id: string }[];
  subtaskProgress: { completed: number; total: number };
  onNavigate: (taskId: string) => void;
}) {
  const [assigneeDialogOpen, setAssigneeDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: task.id,
    disabled: sortMode === "az",
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const status = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.todo;
  const priority = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.medium;
  const progress = subtaskProgress.total > 0 
    ? Math.round((subtaskProgress.completed / subtaskProgress.total) * 100) 
    : 0;

  const isOverdue = isTaskOverdue(task.due_date, task.status);
  const isDueSoon = isTaskDueSoon(task.due_date, task.status);

  const handleTitleSave = async () => {
    if (editedTitle.trim() && editedTitle !== task.title) {
      try {
        const { error } = await supabase
          .from("tasks")
          .update({ title: editedTitle.trim() })
          .eq("id", task.id);
        
        if (error) throw error;
        toast.success("Título atualizado!");
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
        queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      } catch (err) {
        toast.error("Erro ao atualizar título");
        setEditedTitle(task.title);
      }
    }
    setIsEditing(false);
  };

  const handleTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      setIsEditing(true);
    } else {
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        onNavigate(task.id);
      }, 250);
    }
  };

  return (
    <TableRow 
      ref={setNodeRef} 
      style={style}
      className={`group hover:bg-muted/50 ${sortMode === "manual" ? "cursor-grab active:cursor-grabbing" : ""}`}
      {...(sortMode === "manual" ? { ...attributes, ...listeners } : {})}
    >
      {/* Drag handle column */}
      <TableCell className="w-10 px-3">
        {sortMode === "manual" && (
          <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </TableCell>

      {/* Title column */}
      <TableCell className="min-w-[200px]">
        {isEditing ? (
          <Input
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTitleSave();
              if (e.key === "Escape") {
                setEditedTitle(task.title);
                setIsEditing(false);
              }
            }}
            autoFocus
            className="h-7 text-sm"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span 
            className="font-medium cursor-pointer hover:text-primary transition-colors line-clamp-1"
            onClick={handleTitleClick}
          >
            {task.title}
          </span>
        )}
      </TableCell>

      {/* Person column */}
      <TableCell className="w-[100px]">
        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
          <MultiAssigneeAvatars
            taskId={task.id}
            assignees={assignees}
            size="md"
            maxDisplay={2}
            showAddButton
            onAddClick={() => setAssigneeDialogOpen(true)}
          />
        </div>
        <MultiAssigneeDialog
          open={assigneeDialogOpen}
          onOpenChange={setAssigneeDialogOpen}
          taskId={task.id}
          currentAssignees={assignees}
        />
      </TableCell>

      {/* Status column */}
      <TableCell className="w-[140px]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              className={`w-full px-3 py-1.5 text-sm font-medium rounded-sm text-center transition-all ${status.className}`}
              onClick={(e) => e.stopPropagation()}
            >
              {status.label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-[120px]">
            {Object.entries(statusConfig).map(([key, config]) => (
              <DropdownMenuItem 
                key={key} 
                onSelect={() => onStatusChange(task.id, key)}
                className="justify-center"
              >
                <span className={`px-3 py-1 rounded-sm text-sm font-medium ${config.className}`}>
                  {config.label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>

      {/* Date column */}
      <TableCell className="w-[100px] text-center">
        {task.due_date ? (
          <span className={`text-sm ${
            isOverdue 
              ? "text-destructive font-medium" 
              : isDueSoon 
                ? "text-amber-500 dark:text-amber-400" 
                : "text-muted-foreground"
          }`}>
            {formatDateBR(task.due_date).slice(0, 5)}
          </span>
        ) : (
          <span className="text-muted-foreground/50">-</span>
        )}
      </TableCell>

      {/* Priority column */}
      <TableCell className="w-[120px]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              className={`w-full px-3 py-1.5 text-sm font-medium rounded-sm text-center transition-all ${priority.className}`}
              onClick={(e) => e.stopPropagation()}
            >
              {priority.label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-[100px]">
            {Object.entries(priorityConfig).map(([key, config]) => (
              <DropdownMenuItem 
                key={key} 
                onSelect={() => onPriorityChange(task.id, key)}
                className="justify-center"
              >
                <span className={`px-3 py-1 rounded-sm text-sm font-medium ${config.className}`}>
                  {config.label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>

      {/* Progress column */}
      <TableCell className="w-[140px]">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 rounded-full ${
                progress === 100 
                  ? "bg-status-completed" 
                  : progress > 0 
                    ? "bg-primary" 
                    : "bg-transparent"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className={`text-xs min-w-[35px] text-right ${
            progress === 100 
              ? "text-status-completed font-medium" 
              : "text-muted-foreground"
          }`}>
            {progress}%
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function TaskTableView({ 
  tasks, 
  onDeleteTask, 
  onUpdateOrder,
  sortMode = "az",
  onSortModeChange
}: TaskTableViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const [activeTask, setActiveTask] = useState<any>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 1000,
        tolerance: 5,
      },
    })
  );

  // Fetch subtasks for all tasks
  const taskIds = tasks.map(t => t.id);
  
  // Fetch assignees for all tasks
  const { data: allTaskAssignees } = useMultipleTasksAssignees(taskIds, tasks);
  
  const { data: allSubtasks } = useQuery({
    queryKey: ["all-subtasks", taskIds],
    queryFn: async () => {
      if (taskIds.length === 0) return [];
      const { data, error } = await supabase
        .from("subtasks")
        .select("task_id, completed")
        .in("task_id", taskIds);
      if (error) throw error;
      return data;
    },
    enabled: taskIds.length > 0,
  });

  // Sort tasks based on mode
  const sortedTasks = [...tasks].sort((a, b) => {
    if (sortMode === "az") {
      return naturalSort(a.title, b.title);
    }
    return (a.task_order || 0) - (b.task_order || 0);
  });

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over || active.id === over.id) return;

    if (sortMode === "manual" && onUpdateOrder) {
      const activeId = active.id as string;
      const overId = over.id as string;
      
      const oldIndex = sortedTasks.findIndex(t => t.id === activeId);
      const newIndex = sortedTasks.findIndex(t => t.id === overId);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        onUpdateOrder(activeId, newIndex);
      }
    }
  };

  const handleStatusChange = async (taskId: string, status: string) => {
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ status })
        .eq("id", taskId);
      
      if (error) {
        toast.error("Erro ao atualizar status");
        return;
      }
      
      toast.success("Status atualizado!");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    } catch (err) {
      toast.error("Erro ao atualizar status");
    }
  };

  const handlePriorityChange = async (taskId: string, priority: string) => {
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ priority })
        .eq("id", taskId);
      
      if (error) {
        toast.error("Erro ao atualizar prioridade");
        return;
      }
      
      toast.success("Prioridade atualizada!");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    } catch (err) {
      toast.error("Erro ao atualizar prioridade");
    }
  };

  const getTaskAssignees = (taskId: string): { user_id: string }[] => {
    return allTaskAssignees?.[taskId] || [];
  };

  const getSubtaskProgress = (taskId: string) => {
    if (!allSubtasks) return { completed: 0, total: 0 };
    const taskSubtasks = allSubtasks.filter(s => s.task_id === taskId);
    return {
      total: taskSubtasks.length,
      completed: taskSubtasks.filter(s => s.completed).length,
    };
  };

  return (
    <div className="space-y-4">
      {/* Sort Toggle */}
      {onSortModeChange && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSortModeChange(sortMode === "manual" ? "az" : "manual")}
            className="gap-2"
          >
            {sortMode === "az" ? (
              <>
                <ArrowDownAZ size={16} />
                A-Z
              </>
            ) : (
              <>
                <GripVertical size={16} />
                Manual
              </>
            )}
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-10 px-3"></TableHead>
                <TableHead className="min-w-[200px]">Elemento</TableHead>
                <TableHead className="w-[100px] text-center">Pessoa</TableHead>
                <TableHead className="w-[140px] text-center">Status</TableHead>
                <TableHead className="w-[100px] text-center">Data</TableHead>
                <TableHead className="w-[120px] text-center">Prioridade</TableHead>
                <TableHead className="w-[140px]">Acompanhamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext
                items={sortedTasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                {sortedTasks.length > 0 ? (
                  sortedTasks.map((task) => (
                    <SortableTableRow
                      key={task.id}
                      task={task}
                      onStatusChange={handleStatusChange}
                      onPriorityChange={handlePriorityChange}
                      sortMode={sortMode}
                      assignees={getTaskAssignees(task.id)}
                      subtaskProgress={getSubtaskProgress(task.id)}
                      onNavigate={(taskId) => navigate(`/tools/wizzy-flow/tasks/${taskId}`)}
                    />
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Nenhuma tarefa encontrada
                    </TableCell>
                  </TableRow>
                )}
              </SortableContext>
            </TableBody>
          </Table>
        </DndContext>
      </div>
    </div>
  );
}
