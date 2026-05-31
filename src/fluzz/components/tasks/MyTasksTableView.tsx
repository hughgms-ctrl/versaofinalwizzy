import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/fluzz/components/ui/input";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { Button } from "@/fluzz/components/ui/button";
import { Badge } from "@/fluzz/components/ui/badge";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/fluzz/components/ui/tooltip";
import { 
  ChevronRight, 
  ChevronDown, 
  User, 
  FolderOpen,
  Folder,
  RefreshCw,
} from "lucide-react";
import { formatDateBR, isTaskOverdue, isTaskDueSoon } from "@/fluzz/lib/utils";
import { toast } from "sonner";
import { MultiAssigneeAvatars } from "./MultiAssigneeAvatars";
import { MultiAssigneeDialog } from "./MultiAssigneeDialog";
import { useMultipleTasksAssignees } from "@/fluzz/hooks/useTaskAssignees";

interface MyTasksTableViewProps {
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

// Colors for group accent bars
const groupColors = {
  project: [
    "hsl(217, 91%, 60%)",
    "hsl(142, 71%, 45%)",
    "hsl(280, 65%, 60%)",
    "hsl(25, 95%, 53%)",
    "hsl(340, 82%, 52%)",
    "hsl(47, 95%, 50%)",
    "hsl(173, 80%, 40%)",
    "hsl(315, 70%, 50%)",
  ],
  personal: "hsl(280, 65%, 60%)",
  folder: "hsl(200, 70%, 50%)",
  routine: "hsl(142, 71%, 45%)",
};

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
  return groupColors.project[Math.abs(hash) % groupColors.project.length];
}

function getTaskType(task: any): "project" | "folder" | "personal" | "routine" {
  if (task.routine_id || task.recurring_task_id) return "routine";
  // Tarefa pessoal = sem project_id
  if (!task.project_id) return "personal";
  // Pasta "Sem Projeto" = project com is_standalone_folder = true
  if (task.projects?.is_standalone_folder) return "folder";
  return "project";
}

function StatusSummaryBar({ tasks }: { tasks: any[] }) {
  const statusCounts = {
    completed: tasks.filter(t => t.status === "completed").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    todo: tasks.filter(t => t.status === "todo" || !t.status).length,
  };
  
  const total = tasks.length;
  if (total === 0) return <span className="text-muted-foreground/50 text-center block">-</span>;

  return (
    <TooltipProvider>
      <div className="flex h-6 w-full rounded-sm overflow-hidden">
        {Object.entries(statusCounts).map(([status, count]) => {
          if (count === 0) return null;
          const config = statusConfig[status as keyof typeof statusConfig];
          const percentage = (count / total) * 100;
          
          return (
            <Tooltip key={status}>
              <TooltipTrigger asChild>
                <div 
                  className="h-full cursor-pointer transition-opacity hover:opacity-80"
                  style={{ 
                    width: `${percentage}%`, 
                    backgroundColor: config.color,
                    minWidth: count > 0 ? '10px' : 0,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>{config.label}: {count}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function ProgressSummary({ tasks }: { tasks: any[] }) {
  const total = tasks.length;
  if (total === 0) return <span className="text-muted-foreground/50 text-center block">-</span>;
  
  const completed = tasks.filter(t => t.status === "completed").length;
  const percentage = Math.round((completed / total) * 100);

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-300 rounded-full ${
            percentage === 100 
              ? "bg-status-completed" 
              : percentage > 0 
                ? "bg-primary" 
                : "bg-transparent"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={`text-sm font-medium min-w-[40px] text-right ${
        percentage === 100 
          ? "text-status-completed" 
          : "text-muted-foreground"
      }`}>
        {percentage}%
      </span>
    </div>
  );
}

function TaskTableRow({ 
  task, 
  assignees,
}: { 
  task: any;
  assignees: { user_id: string }[];
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
    <TableRow className="hover:bg-muted/30 bg-background/50">
      <TableCell className="w-8 px-2"></TableCell>
      <TableCell className="font-medium pl-8">
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
            className="line-clamp-1 cursor-pointer hover:text-primary transition-colors"
            onClick={handleTitleClick}
          >
            {task.title}
          </span>
        )}
      </TableCell>
      <TableCell className="w-[80px]">
        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
          <MultiAssigneeAvatars
            taskId={task.id}
            assignees={assignees}
            size="sm"
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
      <TableCell className="w-[120px]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              className="w-full px-2 py-1 text-xs font-medium rounded-sm text-center transition-all text-white"
              style={{ backgroundColor: status.color }}
              onClick={(e) => e.stopPropagation()}
            >
              {status.label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-[100px]">
            {Object.entries(statusConfig).map(([key, config]) => (
              <DropdownMenuItem 
                key={key} 
                onSelect={() => handleStatusChange(key)}
                className="justify-center"
              >
                <span 
                  className="px-2 py-0.5 rounded-sm text-xs font-medium text-white"
                  style={{ backgroundColor: config.color }}
                >
                  {config.label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
      <TableCell className="w-[90px] text-center">
        {task.due_date ? (
          <span className={`text-xs ${
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
      <TableCell className="w-[100px]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              className="w-full px-2 py-1 text-xs font-medium rounded-sm text-center transition-all text-white"
              style={{ backgroundColor: priority.color }}
              onClick={(e) => e.stopPropagation()}
            >
              {priority.label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-[80px]">
            {Object.entries(priorityConfig).map(([key, config]) => (
              <DropdownMenuItem 
                key={key} 
                onSelect={() => handlePriorityChange(key)}
                className="justify-center"
              >
                <span 
                  className="px-2 py-0.5 rounded-sm text-xs font-medium text-white"
                  style={{ backgroundColor: config.color }}
                >
                  {config.label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function TaskGroupRow({ 
  group,
  taskAssignees,
}: { 
  group: {
    id: string;
    name: string;
    tasks: any[];
    type: "project" | "folder" | "personal" | "routine";
    color: string;
  };
  taskAssignees: Record<string, { user_id: string }[]>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();
  const { isAdmin, isGestor } = useWorkspace();

  const canClickGroup = group.type === "project" || (group.type === "folder" && (isAdmin || isGestor));

  const tasks = group.tasks || [];
  const taskCount = tasks.length;

  const GroupIcon = group.type === "routine" 
    ? RefreshCw 
    : group.type === "personal" 
      ? User 
      : group.type === "folder"
        ? Folder
        : FolderOpen;

  return (
    <>
      {/* Group Row */}
      <TableRow className="bg-card hover:bg-muted/50 border-b border-border">
        <TableCell 
          className="px-2 align-top pt-4 border-l-4 rounded-l-sm"
          style={{ borderLeftColor: group.color }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((v) => !v);
            }}
            aria-label={isExpanded ? "Recolher grupo" : "Expandir grupo"}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </TableCell>

        <TableCell
          className={`font-semibold py-4 ${canClickGroup ? "cursor-pointer hover:opacity-80" : ""} transition-opacity`}
          onClick={() => canClickGroup ? navigate(`/tools/wizzy-flow/projects/${group.id}`) : setIsExpanded((v) => !v)}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <GroupIcon className="h-4 w-4" style={{ color: group.color }} />
            <span className="text-base font-semibold" style={{ color: group.color }}>{group.name}</span>
          </div>
          <p className="text-xs text-muted-foreground font-normal mt-1">
            {taskCount} {taskCount === 1 ? "Tarefa" : "Tarefas"}
          </p>
        </TableCell>

        <TableCell className="align-middle">
          <StatusSummaryBar tasks={tasks} />
        </TableCell>

        <TableCell className="text-center align-middle">
          <span className="text-muted-foreground/50">-</span>
        </TableCell>

        <TableCell className="align-middle">
          <ProgressSummary tasks={tasks} />
        </TableCell>
      </TableRow>

      {/* Expanded content (nested table to keep alignment) */}
      {isExpanded && (
        <TableRow className="bg-background">
          <TableCell colSpan={5} className="p-0">
            <div className="border-t border-border bg-muted/10">
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30 text-xs">
                    <TableHead className="w-10 px-2"></TableHead>
                    <TableHead className="font-medium text-muted-foreground pl-8">Tarefa</TableHead>
                    <TableHead className="w-[80px] text-center font-medium text-muted-foreground">Pessoa</TableHead>
                    <TableHead className="w-[120px] text-center font-medium text-muted-foreground">Status</TableHead>
                    <TableHead className="w-[90px] text-center font-medium text-muted-foreground">Data</TableHead>
                    <TableHead className="w-[100px] text-center font-medium text-muted-foreground">Prioridade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.length > 0 ? (
                    tasks.map((task: any) => (
                      <TaskTableRow
                        key={task.id}
                        task={task}
                        assignees={taskAssignees[task.id] || []}
                      />
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-4 text-muted-foreground text-sm"
                      >
                        Nenhuma tarefa neste grupo
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function MyTasksTableView({ tasks }: MyTasksTableViewProps) {
  // Fetch all task assignees
  const taskIds = tasks.map(t => t.id);
  const { data: allTaskAssignees } = useMultipleTasksAssignees(taskIds, tasks);

  // Group tasks by project/type
  const groups = (() => {
    const groupMap: { [key: string]: { name: string; tasks: any[]; type: "project" | "folder" | "personal" | "routine"; color: string } } = {};
    
    tasks.forEach((task) => {
      const taskType = getTaskType(task);
      
      if (taskType === "personal") {
        if (!groupMap["personal"]) {
          groupMap["personal"] = { 
            name: "Tarefas Pessoais", 
            tasks: [], 
            type: "personal",
            color: groupColors.personal,
          };
        }
        groupMap["personal"].tasks.push(task);
      } else if (taskType === "folder") {
        // Tarefas de pastas "Sem Projeto" - agrupa por pasta
        const folderKey = task.project_id;
        if (!groupMap[folderKey]) {
          groupMap[folderKey] = { 
            name: task.projects?.name || "Sem Projeto", 
            tasks: [], 
            type: "folder",
            color: groupColors.folder,
          };
        }
        groupMap[folderKey].tasks.push(task);
      } else if (taskType === "routine") {
        if (!groupMap["routine"]) {
          groupMap["routine"] = { 
            name: "Tarefas de Rotina", 
            tasks: [], 
            type: "routine",
            color: groupColors.routine,
          };
        }
        groupMap["routine"].tasks.push(task);
      } else if (task.project_id) {
        const projectKey = task.project_id;
        if (!groupMap[projectKey]) {
          groupMap[projectKey] = { 
            name: task.projects?.name || "Projeto", 
            tasks: [], 
            type: "project",
            color: getProjectColor(projectKey, task.projects?.color),
          };
        }
        groupMap[projectKey].tasks.push(task);
      }
    });
    
    return Object.entries(groupMap)
      .sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }))
      .map(([id, group]) => ({ id, ...group }));
  })();

  if (tasks.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">
          Nenhuma tarefa atribuída a você ainda.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <Table className="w-full table-fixed">
        <colgroup>
          <col className="w-[50px]" />
          <col />
          <col className="w-[160px]" />
          <col className="w-[140px]" />
          <col className="w-[180px]" />
        </colgroup>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="px-2"></TableHead>
            <TableHead>Projeto / Grupo</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className="text-center">Data</TableHead>
            <TableHead className="text-center">Acompanhamento</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TaskGroupRow
              key={group.id}
              group={group}
              taskAssignees={allTaskAssignees || {}}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
