import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/fluzz/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { Badge } from "@/fluzz/components/ui/badge";
import { 
  ChevronDown, 
  ChevronRight, 
  User, 
  FolderOpen,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { formatDateShort, isTaskOverdue, isTaskDueSoon, formatUserName } from "@/fluzz/lib/utils";

interface AnalyticsMobileTaskListProps {
  groupedTasks: {
    projects: { [key: string]: { name: string; color?: string | null; tasks: any[] } };
    standalone: any[];
    routine: any[];
  };
  profiles: any[];
  onTaskClick?: (taskId: string) => void;
}

const statusConfig = {
  todo: { 
    label: "A Fazer", 
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
  high: { label: "Alta", color: "hsl(0, 84%, 60%)" },
  medium: { label: "Média", color: "hsl(43, 96%, 56%)" },
  low: { label: "Baixa", color: "hsl(142, 76%, 36%)" },
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

function TaskMobileCard({ 
  task, 
  profiles,
  onClick,
}: { 
  task: any;
  profiles: any[];
  onClick?: () => void;
}) {
  const assignedUser = task.assigned_to 
    ? profiles?.find(p => p.id === task.assigned_to) 
    : null;

  const status = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.todo;
  const priority = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.medium;
  const isOverdue = isTaskOverdue(task.due_date, task.status);
  const isDueSoon = isTaskDueSoon(task.due_date, task.status);

  return (
    <div 
      className="bg-background rounded-lg p-3 mb-2 last:mb-0 border border-border active:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      {/* Title */}
      <p className={`font-medium text-sm mb-2 ${
        isOverdue 
          ? "text-destructive" 
          : isDueSoon 
            ? "text-amber-500" 
            : "text-foreground"
      }`}>
        {task.title}
      </p>
      
      {/* Info row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Priority badge */}
        <span 
          className="px-2 py-0.5 text-[10px] font-semibold rounded text-white"
          style={{ backgroundColor: priority.color }}
        >
          {priority.label}
        </span>
        
        {/* Status badge */}
        <span 
          className="px-2 py-0.5 text-[10px] font-semibold rounded text-white"
          style={{ backgroundColor: status.color }}
        >
          {status.label}
        </span>
        
        {/* Due date */}
        {task.due_date && (
          <span className={`flex items-center gap-1 text-xs ${
            isOverdue 
              ? "text-destructive" 
              : isDueSoon 
                ? "text-amber-500" 
                : "text-muted-foreground"
          }`}>
            <Calendar className="h-3 w-3" />
            {formatDateShort(task.due_date)}
          </span>
        )}
        
        {/* Assigned user */}
        <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
          {formatUserName(assignedUser?.full_name) || "Não atribuído"}
        </span>
      </div>
    </div>
  );
}

function TaskGroupMobile({ 
  title,
  icon: Icon,
  iconColor,
  borderColor,
  tasks,
  profiles,
  onTaskClick,
}: { 
  title: string;
  icon: any;
  iconColor: string;
  borderColor: string;
  tasks: any[];
  profiles: any[];
  onTaskClick?: (taskId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (tasks.length === 0) return null;

  // Sort tasks by title
  const sortedTasks = [...tasks].sort((a, b) => 
    a.title.localeCompare(b.title, 'pt-BR', { numeric: true, sensitivity: 'base' })
  );

  return (
    <div className="mb-4">
      {/* Group Header */}
      <div 
        className="flex items-center gap-2 mb-2 cursor-pointer py-2"
        onClick={() => setIsExpanded(v => !v)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <Icon className="h-4 w-4 shrink-0" style={{ color: iconColor }} />
        <span 
          className="font-semibold text-sm flex-1 line-clamp-1"
          style={{ color: iconColor }}
        >
          {title}
        </span>
        <Badge variant="secondary" className="text-xs">
          {tasks.length}
        </Badge>
      </div>

      {/* Tasks List */}
      {isExpanded && (
        <Card 
          className="overflow-hidden bg-muted/30" 
          style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
        >
          <CardContent className="p-2">
            {sortedTasks.map((task) => (
              <TaskMobileCard
                key={task.id}
                task={task}
                profiles={profiles}
                onClick={() => onTaskClick?.(task.id)}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function AnalyticsMobileTaskList({ 
  groupedTasks, 
  profiles,
  onTaskClick,
}: AnalyticsMobileTaskListProps) {
  const navigate = useNavigate();
  
  const handleTaskClick = (taskId: string) => {
    if (onTaskClick) {
      onTaskClick(taskId);
    } else {
      navigate(`/tools/wizzy-flow/tasks/${taskId}`);
    }
  };

  const hasAnyTasks = 
    Object.values(groupedTasks.projects).some(g => g.tasks.length > 0) ||
    groupedTasks.standalone.length > 0 ||
    groupedTasks.routine.length > 0;

  if (!hasAnyTasks) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">Nenhuma tarefa encontrada</p>
      </div>
    );
  }

  // Sort projects alphabetically
  const sortedProjects = Object.entries(groupedTasks.projects)
    .sort(([, a], [, b]) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }));

  return (
    <div className="space-y-2">
      {/* Projects */}
      {sortedProjects.map(([projectId, group]) => (
        <TaskGroupMobile
          key={projectId}
          title={group.name}
          icon={FolderOpen}
          iconColor={getProjectColor(projectId, group.color)}
          borderColor={getProjectColor(projectId, group.color)}
          tasks={group.tasks}
          profiles={profiles}
          onTaskClick={handleTaskClick}
        />
      ))}

      {/* Standalone Tasks */}
      <TaskGroupMobile
        title="Tarefas Pessoais"
        icon={User}
        iconColor="hsl(280, 65%, 60%)"
        borderColor="hsl(280, 65%, 60%)"
        tasks={groupedTasks.standalone}
        profiles={profiles}
        onTaskClick={handleTaskClick}
      />

      {/* Routine Tasks */}
      <TaskGroupMobile
        title="Tarefas de Rotina"
        icon={RefreshCw}
        iconColor="hsl(142, 71%, 45%)"
        borderColor="hsl(142, 71%, 45%)"
        tasks={groupedTasks.routine}
        profiles={profiles}
        onTaskClick={handleTaskClick}
      />
    </div>
  );
}