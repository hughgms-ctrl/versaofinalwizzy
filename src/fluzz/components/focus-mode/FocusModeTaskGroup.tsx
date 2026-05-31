import { useState } from "react";
import { ChevronDown, ChevronRight, FolderOpen, Folder, User, RefreshCw, Calendar } from "lucide-react";
import { cn } from "@/fluzz/lib/utils";
import { FocusModeTaskItemWithActions } from "./FocusModeTaskItemWithActions";

interface FocusModeTaskGroupProps {
  title: string;
  icon?: React.ReactNode;
  tasks: any[];
  profiles: any[];
  color?: string;
  defaultExpanded?: boolean;
  onTaskClick: (task: any) => void;
  queryKeyToInvalidate?: string[];
}

export function FocusModeTaskGroup({
  title,
  icon,
  tasks,
  profiles,
  color,
  defaultExpanded = true,
  onTaskClick,
  queryKeyToInvalidate,
}: FocusModeTaskGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  if (tasks.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Group Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-accent/50 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        
        {color && (
          <span 
            className="w-3 h-3 rounded-sm flex-shrink-0"
            style={{ backgroundColor: color }}
          />
        )}
        
        {icon}
        
        <span className="font-medium text-sm flex-1">{title}</span>
        
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </button>

      {/* Tasks List */}
      {isExpanded && (
        <div className="space-y-2 pl-2 sm:pl-4 animate-fade-in">
          {tasks.map((task) => (
            <FocusModeTaskItemWithActions
              key={task.id}
              task={task}
              profiles={profiles}
              onClick={() => onTaskClick(task)}
              queryKeyToInvalidate={queryKeyToInvalidate}
              isDraggable
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Helper to group tasks by date
export function groupTasksByDate(tasks: any[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const groups: Record<string, any[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    thisWeek: [],
    later: [],
    noDueDate: [],
  };

  tasks.forEach((task) => {
    if (!task.due_date) {
      groups.noDueDate.push(task);
      return;
    }

    const dueDate = new Date(task.due_date + "T12:00:00");
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate < today && task.status !== "completed") {
      groups.overdue.push(task);
    } else if (dueDate.getTime() === today.getTime()) {
      groups.today.push(task);
    } else if (dueDate.getTime() === tomorrow.getTime()) {
      groups.tomorrow.push(task);
    } else if (dueDate <= nextWeek) {
      groups.thisWeek.push(task);
    } else {
      groups.later.push(task);
    }
  });

  return groups;
}

// Helper to group tasks by project
export function groupTasksByProject(tasks: any[]) {
  const groups: Record<string, { name: string; color: string | null; tasks: any[] }> = {};
  const personalTasks: any[] = [];
  const routineTasks: any[] = [];

  tasks.forEach((task) => {
    if (task.routine_id || task.recurring_task_id) {
      routineTasks.push(task);
    } else if (!task.project_id) {
      personalTasks.push(task);
    } else {
      const projectId = task.project_id;
      const projectName = task.projects?.name || "Projeto";
      const projectColor = task.projects?.color || null;
      
      if (!groups[projectId]) {
        groups[projectId] = { name: projectName, color: projectColor, tasks: [] };
      }
      groups[projectId].tasks.push(task);
    }
  });

  return { projectGroups: groups, personalTasks, routineTasks };
}
