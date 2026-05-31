import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { Card, CardContent } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Progress } from "@/fluzz/components/ui/progress";
import { ScrollArea, ScrollBar } from "@/fluzz/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/fluzz/components/ui/dropdown-menu";
import { 
  ChevronDown, 
  ChevronRight, 
  FolderOpen,
  Folder,
  RefreshCw,
  FileText,
  ArrowDownAZ,
  GripVertical,
  User,
} from "lucide-react";
import { formatDateBR, isTaskOverdue, isTaskDueSoon } from "@/fluzz/lib/utils";
import { toast } from "sonner";
import { MultiAssigneeAvatars } from "./MultiAssigneeAvatars";
import { MultiAssigneeDialog } from "./MultiAssigneeDialog";
import { useMultipleTasksAssignees } from "@/fluzz/hooks/useTaskAssignees";

interface MyTasksMobileViewProps {
  tasks: any[];
}

const statusConfig = {
  todo: { 
    label: "A fazer", 
    color: "hsl(0, 68%, 72%)",
  },
  in_progress: { 
    label: "Fazendo", 
    color: "hsl(30, 100%, 65%)",
  },
  completed: { 
    label: "Feito", 
    color: "hsl(152, 69%, 53%)",
  },
};

const priorityConfig = {
  high: { label: "Alta", color: "hsl(250, 60%, 45%)" },
  medium: { label: "Média", color: "hsl(250, 50%, 60%)" },
  low: { label: "Baixa", color: "hsl(260, 60%, 65%)" },
};

const groupColors = [
  "hsl(217, 91%, 60%)",
  "hsl(142, 71%, 45%)",
  "hsl(280, 65%, 60%)",
  "hsl(25, 95%, 53%)",
  "hsl(340, 82%, 52%)",
  "hsl(47, 95%, 50%)",
  "hsl(173, 80%, 40%)",
  "hsl(315, 70%, 50%)",
];

// Map color values from database to actual HSL colors
const projectColorByValue: Record<string, string> = {
  primary: "hsl(var(--primary))",
  blue: "hsl(217, 91%, 60%)",
  emerald: "hsl(142, 71%, 45%)",
  amber: "hsl(43, 96%, 56%)",
  purple: "hsl(271, 81%, 56%)",
  pink: "hsl(330, 81%, 60%)",
  cyan: "hsl(188, 94%, 42%)",
  rose: "hsl(346, 77%, 49%)",
  orange: "hsl(25, 95%, 53%)",
  teal: "hsl(173, 80%, 40%)",
};

function getProjectColor(projectId: string, colorValue?: string | null): string {
  // Use the actual project color if available
  const mapped = colorValue ? projectColorByValue[colorValue] : undefined;
  if (mapped) return mapped;

  // Fallback: Use project ID to generate a consistent color (for legacy projects)
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = projectId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return groupColors[Math.abs(hash) % groupColors.length];
}

function getTaskType(task: any): "project" | "folder" | "personal" | "routine" {
  if (task.routine_id || task.recurring_task_id) return "routine";
  // Tarefa pessoal = sem project_id
  if (!task.project_id) return "personal";
  // Pasta "Sem Projeto" = project com is_standalone_folder = true
  if (task.projects?.is_standalone_folder) return "folder";
  return "project";
}

// Natural sort function
const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
};

function TaskRow({ 
  task, 
  assignees,
  groupColor,
  subtasks,
}: { 
  task: any;
  assignees: { user_id: string }[];
  groupColor: string;
  subtasks: { completed: boolean }[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [assigneeDialogOpen, setAssigneeDialogOpen] = useState(false);

  const status = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.todo;
  const priority = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.medium;
  const isOverdue = isTaskOverdue(task.due_date, task.status);
  const isDueSoon = isTaskDueSoon(task.due_date, task.status);

  // Subtask progress
  const totalSubtasks = subtasks.length;
  const completedSubtasks = subtasks.filter(s => s.completed).length;
  const subtaskProgress = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;

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
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    } catch (err) {
      toast.error("Erro ao atualizar status");
    }
  };

  const handlePriorityChange = async (newPriority: string) => {
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ priority: newPriority })
        .eq("id", task.id);
      
      if (error) {
        toast.error("Erro ao atualizar prioridade");
        return;
      }
      
      toast.success("Prioridade atualizada!");
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    } catch (err) {
      toast.error("Erro ao atualizar prioridade");
    }
  };

  const handleTitleSave = async () => {
    if (editedTitle.trim() && editedTitle !== task.title) {
      try {
        const { error } = await supabase
          .from("tasks")
          .update({ title: editedTitle.trim() })
          .eq("id", task.id);
        
        if (error) throw error;
        toast.success("Título atualizado!");
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
        navigate(`/tools/wizzy-flow/tasks/${task.id}`);
      }, 250);
    }
  };

  return (
    <div 
      className="flex items-center border-b border-border last:border-b-0"
      style={{ borderLeftWidth: 3, borderLeftColor: groupColor }}
    >
      {/* Task title - fixed column */}
      <div className="w-[180px] min-w-[180px] py-3 px-2 shrink-0">
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
          <p 
            className="font-medium text-sm line-clamp-2 cursor-pointer hover:text-primary transition-colors"
            onClick={handleTitleClick}
          >
            {task.title}
          </p>
        )}
      </div>

      {/* Assignees */}
      <div className="w-[80px] min-w-[80px] py-3 flex justify-center shrink-0" onClick={(e) => e.stopPropagation()}>
        <MultiAssigneeAvatars
          taskId={task.id}
          assignees={assignees}
          size="sm"
          maxDisplay={2}
          showAddButton
          onAddClick={() => setAssigneeDialogOpen(true)}
        />
        <MultiAssigneeDialog
          open={assigneeDialogOpen}
          onOpenChange={setAssigneeDialogOpen}
          taskId={task.id}
          currentAssignees={assignees}
        />
      </div>

      {/* Status dropdown */}
      <div className="w-[100px] min-w-[100px] py-3 flex justify-center shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              className="px-3 py-1.5 text-xs font-semibold rounded text-white w-full text-center"
              style={{ backgroundColor: status.color }}
              onClick={(e) => e.stopPropagation()}
            >
              {status.label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-[120px]">
            {Object.entries(statusConfig).map(([key, config]) => (
              <DropdownMenuItem 
                key={key} 
                onSelect={() => handleStatusChange(key)}
                className="justify-center"
              >
                <span 
                  className="px-3 py-1 rounded text-xs font-semibold text-white w-full text-center"
                  style={{ backgroundColor: config.color }}
                >
                  {config.label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Due date */}
      <div className="w-[70px] min-w-[70px] py-3 text-center shrink-0">
        {task.due_date ? (
          <span className={`text-xs font-medium ${
            isOverdue 
              ? "text-destructive" 
              : isDueSoon 
                ? "text-amber-500" 
                : "text-muted-foreground"
          }`}>
            {formatDateBR(task.due_date).slice(0, 5)}
          </span>
        ) : (
          <span className="text-muted-foreground/50 text-xs">-</span>
        )}
      </div>

      {/* Priority dropdown */}
      <div className="w-[90px] min-w-[90px] py-3 flex justify-center shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              className="px-3 py-1.5 text-xs font-semibold rounded text-white w-full text-center"
              style={{ backgroundColor: priority.color }}
              onClick={(e) => e.stopPropagation()}
            >
              {priority.label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-[100px]">
            {Object.entries(priorityConfig).map(([key, config]) => (
              <DropdownMenuItem 
                key={key} 
                onSelect={() => handlePriorityChange(key)}
                className="justify-center"
              >
                <span 
                  className="px-3 py-1 rounded text-xs font-semibold text-white w-full text-center"
                  style={{ backgroundColor: config.color }}
                >
                  {config.label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Progress (subtasks) */}
      <div className="w-[100px] min-w-[100px] py-3 px-2 shrink-0">
        {totalSubtasks > 0 ? (
          <div className="flex items-center gap-1">
            <Progress value={subtaskProgress} className="h-2 flex-1" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {completedSubtasks}/{totalSubtasks}
            </span>
          </div>
        ) : (
          <div className="h-2 bg-muted/50 rounded-full" />
        )}
      </div>
    </div>
  );
}

function TaskGroupCard({ 
  group,
  taskAssignees,
  taskSubtasks,
  sortMode,
}: { 
  group: {
    id: string;
    name: string;
    tasks: any[];
    type: "project" | "folder" | "personal" | "routine";
    color: string;
  };
  taskAssignees: Record<string, { user_id: string }[]>;
  taskSubtasks: Record<string, { completed: boolean }[]>;
  sortMode: "manual" | "az";
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const navigate = useNavigate();
  const { isAdmin, isGestor } = useWorkspace();

  const canClickGroup = group.type === "project" || (group.type === "folder" && (isAdmin || isGestor));

  // Sort tasks based on mode
  const sortedTasks = [...(group.tasks || [])].sort((a, b) => {
    if (sortMode === "az") {
      return naturalSort(a.title, b.title);
    }
    return (a.task_order || 0) - (b.task_order || 0);
  });

  const GroupIcon = group.type === "routine" 
    ? RefreshCw 
    : group.type === "personal" 
      ? User 
      : group.type === "folder"
        ? Folder
        : FolderOpen;

  return (
    <div className="mb-4">
      {/* Group Header */}
      <div 
        className="flex items-center gap-2 mb-2 cursor-pointer"
        onClick={() => setIsExpanded(v => !v)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <GroupIcon className="h-4 w-4 shrink-0" style={{ color: group.color }} />
        <h3 
          className={`font-semibold text-sm flex-1 line-clamp-1 ${canClickGroup ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
          style={{ color: group.color }}
          onClick={(e) => {
            if (canClickGroup) {
              e.stopPropagation();
              navigate(`/tools/wizzy-flow/projects/${group.id}`);
            }
          }}
        >
          {group.name}
        </h3>
        <span className="text-xs text-muted-foreground shrink-0">
          {sortedTasks.length} {sortedTasks.length === 1 ? "tarefa" : "tarefas"}
        </span>
      </div>

      {/* Tasks List - Horizontally scrollable table */}
      {isExpanded && sortedTasks.length > 0 && (
        <Card className="overflow-hidden">
          <ScrollArea className="w-full" type="scroll">
            <div className="min-w-[620px]">
              {/* Table header */}
              <div className="flex items-center bg-muted/30 border-b border-border text-xs text-muted-foreground font-medium">
                <div className="w-[180px] min-w-[180px] py-2 px-2 shrink-0">Elemento</div>
                <div className="w-[80px] min-w-[80px] py-2 text-center shrink-0">Pessoa</div>
                <div className="w-[100px] min-w-[100px] py-2 text-center shrink-0">Status</div>
                <div className="w-[70px] min-w-[70px] py-2 text-center shrink-0">Data</div>
                <div className="w-[90px] min-w-[90px] py-2 text-center shrink-0">Prioridade</div>
                <div className="w-[100px] min-w-[100px] py-2 px-2 shrink-0">Acompanha</div>
              </div>
              {/* Task rows */}
              {sortedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  assignees={taskAssignees[task.id] || []}
                  subtasks={taskSubtasks[task.id] || []}
                  groupColor={group.color}
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}

export function MyTasksMobileView({ tasks }: MyTasksMobileViewProps) {
  const [sortMode, setSortMode] = useState<"manual" | "az">("az");
  
  // Fetch all task assignees
  const taskIds = tasks.map(t => t.id);
  const { data: taskAssignees = {} } = useMultipleTasksAssignees(taskIds, tasks);

  // Fetch subtasks for all tasks
  const { data: allSubtasks = {} } = useQuery({
    queryKey: ["subtasks-multiple", taskIds],
    queryFn: async () => {
      if (taskIds.length === 0) return {};
      const { data, error } = await supabase
        .from("subtasks")
        .select("task_id, completed")
        .in("task_id", taskIds);
      if (error) throw error;
      
      // Group by task_id
      const grouped: Record<string, { completed: boolean }[]> = {};
      data?.forEach(item => {
        if (!grouped[item.task_id]) {
          grouped[item.task_id] = [];
        }
        grouped[item.task_id].push({ completed: item.completed || false });
      });
      return grouped;
    },
    enabled: taskIds.length > 0,
  });

  // Group tasks by project/routine/folder/personal
  const groupedTasks = tasks.reduce((acc, task) => {
    const type = getTaskType(task);
    let groupId: string;
    let groupName: string;
    let color: string;

    if (type === "project" && task.project_id) {
      groupId = task.project_id;
      groupName = task.projects?.name || "Projeto sem nome";
      color = getProjectColor(task.project_id, task.projects?.color);
    } else if (type === "folder" && task.project_id) {
      // Pasta "Sem Projeto"
      groupId = task.project_id;
      groupName = task.projects?.name || "Sem Projeto";
      color = "hsl(200, 70%, 50%)";
    } else if (type === "routine") {
      groupId = "routine";
      groupName = "Tarefas de Rotina";
      color = "hsl(142, 71%, 45%)";
    } else {
      groupId = "personal";
      groupName = "Tarefas Pessoais";
      color = "hsl(280, 65%, 60%)";
    }

    if (!acc[groupId]) {
      acc[groupId] = {
        id: groupId,
        name: groupName,
        tasks: [],
        type,
        color,
      };
    }
    acc[groupId].tasks.push(task);
    return acc;
  }, {} as Record<string, { id: string; name: string; tasks: any[]; type: "project" | "folder" | "personal" | "routine"; color: string; }>);

  type TaskGroup = { id: string; name: string; tasks: any[]; type: "project" | "folder" | "personal" | "routine"; color: string; };
  const groups: TaskGroup[] = Object.values(groupedTasks);

  // Sort: projects first, then folders, then routines, then personal
  groups.sort((a, b) => {
    const typeOrder = { project: 0, folder: 1, routine: 2, personal: 3 };
    return typeOrder[a.type] - typeOrder[b.type];
  });

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">Nenhuma tarefa encontrada</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Sort Toggle */}
      <div className="flex justify-end mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortMode(sortMode === "manual" ? "az" : "manual")}
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

      {groups.map((group) => (
        <TaskGroupCard
          key={group.id}
          group={group}
          taskAssignees={taskAssignees}
          taskSubtasks={allSubtasks}
          sortMode={sortMode}
        />
      ))}
    </div>
  );
}
