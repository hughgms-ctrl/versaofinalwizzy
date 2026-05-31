import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/fluzz/components/ui/input";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { Button } from "@/fluzz/components/ui/button";
import { Badge } from "@/fluzz/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/fluzz/components/ui/scroll-area";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/fluzz/components/ui/alert-dialog";
import { 
  ChevronRight, 
  ChevronDown, 
  User, 
  MoreVertical, 
  Copy, 
  Archive, 
  ArchiveRestore, 
  Trash2, 
  Bookmark,
  FileEdit,
  Folder,
  CheckCircle2,
} from "lucide-react";
import { formatDateBR, formatDateShort, isTaskOverdue, isTaskDueSoon } from "@/fluzz/lib/utils";
import { toast } from "sonner";
import { useProjectActions } from "@/fluzz/hooks/useProjectActions";
interface ProjectsTableViewProps {
  projects: any[];
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  isArchived?: boolean;
  isStandaloneFolder?: boolean;
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

// Colors for project accent bars (Monday.com style)
const projectColors = [
  "hsl(217 91% 60%)",  // Blue
  "hsl(142 71% 45%)",  // Green
  "hsl(280 65% 60%)",  // Purple
  "hsl(25 95% 53%)",   // Orange
  "hsl(340 82% 52%)",  // Pink/Red
  "hsl(47 95% 50%)",   // Yellow
  "hsl(173 80% 40%)",  // Teal
  "hsl(315 70% 50%)",  // Magenta
];

const projectColorByValue: Record<string, string> = {
  primary: "hsl(var(--primary))",
  blue: "hsl(217 91% 60%)",
  emerald: "hsl(142 71% 45%)",
  amber: "hsl(43 96% 56%)",
  purple: "hsl(271 81% 56%)",
  pink: "hsl(330 81% 60%)",
  cyan: "hsl(188 94% 42%)",
  rose: "hsl(346 77% 49%)",
  orange: "hsl(25 95% 53%)",
  teal: "hsl(173 80% 40%)",
};

function getProjectColor(projectId: string, colorValue?: string | null): string {
  const mapped = colorValue ? projectColorByValue[colorValue] : undefined;
  if (mapped) return mapped;

  // Fallback: Use project ID to generate a consistent color (for legacy projects)
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = projectId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return projectColors[Math.abs(hash) % projectColors.length];
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
  profiles,
  showActions,
}: { 
  task: any;
  profiles: any[];
  showActions?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Get all assignees (assigned_to + approval_reviewer_id) with is_reviewer flag
  const getAssignees = () => {
    const assignees: any[] = [];
    if (task.assigned_to) {
      const user = profiles?.find(p => p.id === task.assigned_to);
      if (user) assignees.push({ ...user, is_reviewer: false });
    }
    if (task.approval_reviewer_id && task.approval_reviewer_id !== task.assigned_to) {
      const reviewer = profiles?.find(p => p.id === task.approval_reviewer_id);
      if (reviewer) assignees.push({ ...reviewer, is_reviewer: true });
    }
    return assignees;
  };
  
  const taskAssignees = getAssignees();

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
      queryClient.invalidateQueries({ queryKey: ["projects"] });
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
      queryClient.invalidateQueries({ queryKey: ["projects"] });
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
        queryClient.invalidateQueries({ queryKey: ["projects"] });
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
      <TableCell className="w-[100px]">
        <div className="flex justify-center items-center">
          {taskAssignees.length > 0 ? (
            <TooltipProvider>
              <div className="flex items-center">
                {taskAssignees.slice(0, 3).map((user, index) => (
                  <Tooltip key={user.id}>
                    <TooltipTrigger asChild>
                      <div className="relative">
                        <Avatar 
                          className={`h-6 w-6 border-2 ${user.is_reviewer ? 'border-amber-400' : 'border-background'} ${index > 0 ? '-ml-2' : ''}`}
                        >
                          <AvatarImage src={user.avatar_url} />
                          <AvatarFallback className={`text-xs ${user.is_reviewer ? 'bg-amber-500/20 text-amber-600' : 'bg-primary/10 text-primary'}`}>
                            {user.full_name?.charAt(0)?.toUpperCase() || <User className="h-3 w-3" />}
                          </AvatarFallback>
                        </Avatar>
                        {user.is_reviewer && (
                          <div className="absolute -bottom-0.5 -right-0.5 bg-amber-500 rounded-full p-0.5">
                            <CheckCircle2 className="h-2 w-2 text-white" />
                          </div>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>{user.full_name || "Usuário"}{user.is_reviewer ? ' (Aprovador)' : ''}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
                {taskAssignees.length > 3 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    +{taskAssignees.length - 3}
                  </span>
                )}
              </div>
            </TooltipProvider>
          ) : (
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs bg-muted">
                <User className="h-3 w-3 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
          )}
        </div>
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
      {showActions && <TableCell className="w-10"></TableCell>}
    </TableRow>
  );
}

function ProjectRow({ 
  project, 
  onDelete, 
  onArchive, 
  isArchived,
  isStandaloneFolder,
  profiles,
}: { 
  project: any;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  isArchived?: boolean;
  isStandaloneFolder?: boolean;
  profiles: any[];
}) {
  const projectColor = getProjectColor(project.id, project.color);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(project.name);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, isGestor } = useWorkspace();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { duplicateProject, saveAsTemplate } = useProjectActions();
  const tasks = project.tasks || [];
  const taskCount = tasks.length;
  
  // Date range
  const formatEventDates = () => {
    if (!project.start_date && !project.end_date) return null;
    const start = project.start_date;
    const end = project.end_date;
    
    if (start && end && start !== end) {
      return `${formatDateShort(start)} - ${formatDateShort(end)}`;
    }
    return formatDateBR(end || start);
  };

  const eventDates = formatEventDates();

  const totalColumns = (isAdmin || isGestor) ? 6 : 5;

  const handleNameSave = async () => {
    if (editedName.trim() && editedName !== project.name) {
      try {
        const { error } = await supabase
          .from("projects")
          .update({ name: editedName.trim() })
          .eq("id", project.id);
        
        if (error) throw error;
        toast.success("Nome atualizado!");
        queryClient.invalidateQueries({ queryKey: ["projects"] });
      } catch (err) {
        toast.error("Erro ao atualizar nome");
        setEditedName(project.name);
      }
    }
    setIsEditingName(false);
  };

  const handleNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      setIsEditingName(true);
    } else {
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        navigate(`/tools/wizzy-flow/projects/${project.id}`);
      }, 250);
    }
  };

  return (
    <>
      {/* Project Row */}
      <TableRow className="bg-card hover:bg-muted/50 border-b border-border">
        <TableCell 
          className="px-2 align-top pt-4 border-l-4 rounded-l-sm"
          style={{ borderLeftColor: projectColor }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((v) => !v);
            }}
            aria-label={isExpanded ? "Recolher projeto" : "Expandir projeto"}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </TableCell>

        <TableCell className="font-semibold py-4 min-w-[280px]">
          <div className="flex items-center gap-2">
            {isStandaloneFolder && <Folder className="h-4 w-4 flex-shrink-0" style={{ color: projectColor }} />}
            {isEditingName ? (
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNameSave();
                  if (e.key === "Escape") {
                    setEditedName(project.name);
                    setIsEditingName(false);
                  }
                }}
                autoFocus
                className="h-7 text-base font-semibold max-w-[300px]"
                style={{ color: projectColor }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span 
                className="text-base font-semibold cursor-pointer hover:opacity-80 transition-opacity whitespace-nowrap"
                style={{ color: projectColor }}
                onClick={handleNameClick}
              >
                {project.name}
              </span>
            )}
            {project.is_draft && (
              <Badge
                variant="outline"
                className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30 flex-shrink-0"
              >
                <FileEdit className="h-3 w-3 mr-1" />
                Rascunho
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-normal mt-1 whitespace-nowrap">
            {taskCount} {taskCount === 1 ? "Tarefa" : "Tarefas"}
          </p>
        </TableCell>

        <TableCell className="align-middle">
          <StatusSummaryBar tasks={tasks} />
        </TableCell>

        <TableCell className="text-center align-middle">
          {eventDates ? (
            <Badge className="text-xs whitespace-nowrap bg-primary/80 text-primary-foreground hover:bg-primary/70">
              {eventDates}
            </Badge>
          ) : (
            <span className="text-muted-foreground/50">-</span>
          )}
        </TableCell>

        <TableCell className="align-middle">
          <ProgressSummary tasks={tasks} />
        </TableCell>

        {(isAdmin || isGestor) && (
          <TableCell className="align-middle">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50 bg-popover">
                <DropdownMenuItem 
                  onClick={() => duplicateProject.mutate(project)}
                  disabled={duplicateProject.isPending}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {duplicateProject.isPending ? "Duplicando..." : "Duplicar"}
                </DropdownMenuItem>
                {!isStandaloneFolder && (
                  <DropdownMenuItem 
                    onClick={() => saveAsTemplate.mutate(project)}
                    disabled={saveAsTemplate.isPending}
                  >
                    <Bookmark className="mr-2 h-4 w-4" />
                    {saveAsTemplate.isPending ? "Salvando..." : "Salvar como Modelo"}
                  </DropdownMenuItem>
                )}
                {!isStandaloneFolder && (
                  <DropdownMenuItem onClick={() => onArchive(project.id)}>
                    {isArchived ? (
                      <>
                        <ArchiveRestore className="mr-2 h-4 w-4" />
                        Restaurar
                      </>
                    ) : (
                      <>
                        <Archive className="mr-2 h-4 w-4" />
                        Arquivar
                      </>
                    )}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        )}
      </TableRow>

      {/* Expanded content (nested table to keep alignment) */}
      {isExpanded && (
        <TableRow className="bg-background">
          <TableCell colSpan={totalColumns} className="p-0">
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
                    {(isAdmin || isGestor) && <TableHead className="w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.length > 0 ? (
                    tasks.map((task: any) => (
                      <TaskTableRow
                        key={task.id}
                        task={task}
                        profiles={profiles}
                        showActions={isAdmin || isGestor}
                      />
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={(isAdmin || isGestor) ? 7 : 6}
                        className="text-center py-4 text-muted-foreground text-sm"
                      >
                        Nenhuma tarefa neste projeto
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Projeto</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza de que deseja excluir permanentemente este projeto? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete(project.id);
                setShowDeleteDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ProjectsTableView({ 
  projects, 
  onDelete, 
  onArchive, 
  isArchived,
  isStandaloneFolder,
}: ProjectsTableViewProps) {
  const { isAdmin, isGestor } = useWorkspace();

  // Fetch all profiles
  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url");
      if (error) throw error;
      return data || [];
    },
  });

  if (projects.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">
          {isArchived 
            ? "Você não tem projetos arquivados." 
            : isStandaloneFolder 
              ? "Você não tem pastas sem projeto."
              : "Nenhum projeto encontrado."
          }
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <ScrollArea className="w-full" type="scroll">
        <div className="min-w-[900px]">
          <Table className="w-full">
            <colgroup>
              <col className="w-[50px]" />
              <col className="w-[320px]" />
              <col className="w-[160px]" />
              <col className="w-[140px]" />
              <col className="w-[180px]" />
              {(isAdmin || isGestor) && <col className="w-[50px]" />}
            </colgroup>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="px-2"></TableHead>
                <TableHead>Projeto</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Data</TableHead>
                <TableHead className="text-center">Acompanhamento</TableHead>
                {(isAdmin || isGestor) && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  onDelete={onDelete}
                  onArchive={onArchive}
                  isArchived={isArchived}
                  isStandaloneFolder={isStandaloneFolder}
                  profiles={profiles || []}
                />
              ))}
            </TableBody>
          </Table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
