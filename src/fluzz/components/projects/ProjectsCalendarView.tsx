import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek, isToday, isSameDay, parseISO, differenceInDays, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/fluzz/components/ui/button";
import { Card } from "@/fluzz/components/ui/card";
import { cn } from "@/fluzz/lib/utils";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/fluzz/hooks/use-mobile";

interface Project {
  id: string;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  is_standalone_folder?: boolean;
  is_draft?: boolean;
  pending_notifications?: boolean;
  color?: string | null;
}

interface ProjectsCalendarViewProps {
  projects: Project[];
  onCreateProject?: (date: Date) => void;
  canEdit?: boolean;
  canSeeDrafts?: boolean;
}

// Parse date string to Date object avoiding timezone issues
const parseDateOnly = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Project color options for user selection
const projectColorOptions = [
  { value: "primary", bg: "bg-primary/20", text: "text-primary", border: "border-primary/40" },
  { value: "blue", bg: "bg-blue-500/20", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/40" },
  { value: "emerald", bg: "bg-emerald-500/20", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/40" },
  { value: "amber", bg: "bg-amber-500/20", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/40" },
  { value: "purple", bg: "bg-purple-500/20", text: "text-purple-600 dark:text-purple-400", border: "border-purple-500/40" },
  { value: "pink", bg: "bg-pink-500/20", text: "text-pink-600 dark:text-pink-400", border: "border-pink-500/40" },
  { value: "cyan", bg: "bg-cyan-500/20", text: "text-cyan-600 dark:text-cyan-400", border: "border-cyan-500/40" },
  { value: "rose", bg: "bg-rose-500/20", text: "text-rose-600 dark:text-rose-400", border: "border-rose-500/40" },
  { value: "orange", bg: "bg-orange-500/20", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/40" },
  { value: "teal", bg: "bg-teal-500/20", text: "text-teal-600 dark:text-teal-400", border: "border-teal-500/40" },
];

// Get project color based on color value or fallback to index
const getProjectColor = (colorValue?: string | null, index: number = 0) => {
  if (colorValue) {
    const found = projectColorOptions.find(c => c.value === colorValue);
    if (found) return found;
  }
  return projectColorOptions[index % projectColorOptions.length];
};

export { projectColorOptions, getProjectColor };

export const ProjectsCalendarView = ({ 
  projects, 
  onCreateProject,
  canEdit = false,
  canSeeDrafts = false
}: ProjectsCalendarViewProps) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { locale: ptBR });
  const calendarEnd = endOfWeek(monthEnd, { locale: ptBR });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Process projects to identify multi-day events
  const processedProjects = useMemo(() => {
    return projects
      .filter(p => !p.is_standalone_folder && (p.start_date || p.end_date))
      .map((project, index) => {
        const startDate = project.start_date ? parseDateOnly(project.start_date) : null;
        const endDate = project.end_date ? parseDateOnly(project.end_date) : null;
        
        // If only one date, use it for both
        const effectiveStart = startDate || endDate!;
        const effectiveEnd = endDate || startDate!;
        
        const duration = differenceInDays(effectiveEnd, effectiveStart) + 1;
        const isMultiDay = duration > 1;
        
        // Check if this is a draft project
        const isDraft = project.is_draft || project.pending_notifications;
        
        return {
          ...project,
          effectiveStart,
          effectiveEnd,
          duration,
          isMultiDay,
          colorIndex: index,
          isDraft,
          colors: getProjectColor(project.color, index),
        };
      });
  }, [projects, canSeeDrafts]);

  // Get projects for a specific day
  const getProjectsForDay = (day: Date) => {
    return processedProjects.filter(project => {
      return isWithinInterval(day, { 
        start: project.effectiveStart, 
        end: project.effectiveEnd 
      });
    });
  };

  // Check if this is the start day for a project
  const isProjectStart = (project: typeof processedProjects[0], day: Date) => {
    return isSameDay(day, project.effectiveStart);
  };

  // Check if this is the end day for a project
  const isProjectEnd = (project: typeof processedProjects[0], day: Date) => {
    return isSameDay(day, project.effectiveEnd);
  };

  const weekDays = isMobile 
    ? ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
    : ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const goToToday = () => setCurrentMonth(new Date());

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-base sm:text-lg font-semibold capitalize ml-2">
            {format(currentMonth, isMobile ? "MMM yyyy" : "MMMM yyyy", { locale: ptBR })}
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={goToToday}>
          Hoje
        </Button>
      </div>

      {/* Calendar Grid */}
      <Card className="overflow-hidden">
        {/* Week day headers */}
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {weekDays.map((day, i) => (
            <div key={i} className="p-1.5 sm:p-2 text-center text-xs sm:text-sm font-medium text-muted-foreground">
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const dayProjects = getProjectsForDay(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isTodayDate = isToday(day);

            return (
              <div
                key={index}
                className={cn(
                  "min-h-[70px] sm:min-h-[100px] border-b border-r p-0.5 sm:p-1 transition-colors relative",
                  !isCurrentMonth && "bg-muted/30",
                  canEdit && "cursor-pointer hover:bg-muted/50"
                )}
                onClick={() => canEdit && onCreateProject?.(day)}
              >
                {/* Day number */}
                <div className={cn(
                  "text-xs sm:text-sm font-medium mb-0.5 sm:mb-1 w-5 h-5 sm:w-7 sm:h-7 flex items-center justify-center rounded-full mx-auto sm:mx-0",
                  !isCurrentMonth && "text-muted-foreground",
                  isTodayDate && "bg-primary text-primary-foreground"
                )}>
                  {format(day, "d")}
                </div>
                
                {/* Projects */}
                <div className="space-y-0.5 sm:space-y-1">
                  {dayProjects.slice(0, isMobile ? 2 : 3).map(project => {
                    const colors = project.colors;
                    const isStart = isProjectStart(project, day);
                    const isEnd = isProjectEnd(project, day);
                    const isSingleDay = !project.isMultiDay;
                    // Draft projects are not clickable for members
                    const isClickable = !project.isDraft || canSeeDrafts;
                    
                    return (
                      <div
                        key={`${project.id}-${format(day, 'yyyy-MM-dd')}`}
                        className={cn(
                          "text-[10px] sm:text-xs truncate py-0.5 transition-colors",
                          isClickable ? "cursor-pointer" : "cursor-default opacity-60",
                          colors.bg,
                          colors.text,
                          // Single day: full rounded
                          isSingleDay && "px-1 sm:px-1.5 rounded",
                          // Multi-day: bar style with rounded ends
                          !isSingleDay && "px-0.5 sm:px-1",
                          !isSingleDay && isStart && "rounded-l ml-0.5 sm:ml-1 pl-1 sm:pl-1.5",
                          !isSingleDay && isEnd && "rounded-r mr-0.5 sm:mr-1 pr-1 sm:pr-1.5",
                          !isSingleDay && !isStart && !isEnd && "-mx-0.5 sm:-mx-1",
                          isClickable && `hover:${colors.bg.replace('/20', '/30')}`
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (isClickable) {
                            // Use setTimeout to avoid React Router state issues
                            setTimeout(() => {
                              navigate(`/tools/wizzy-flow/projects/${project.id}`);
                            }, 0);
                          }
                        }}
                      >
                        {/* Show name only on start day or single day */}
                        {(isStart || isSingleDay) ? (
                          <span className="font-medium">{project.name}</span>
                        ) : (
                          <span className="invisible">.</span>
                        )}
                      </div>
                    );
                  })}
                  {dayProjects.length > (isMobile ? 2 : 3) && (
                    <div className="text-[10px] sm:text-xs text-muted-foreground px-1 sm:px-1.5">
                      +{dayProjects.length - (isMobile ? 2 : 3)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Legend/hint */}
      {canEdit && (
        <p className="text-xs text-muted-foreground text-center">
          Clique em um dia para criar um novo projeto
        </p>
      )}
    </div>
  );
};
