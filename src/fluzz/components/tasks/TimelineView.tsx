import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { format, addDays, differenceInDays, isToday, startOfDay, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowDownAZ, GripVertical, GripHorizontal, User } from "lucide-react";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { cn } from "@/fluzz/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useMultipleTasksAssignees } from "@/fluzz/hooks/useTaskAssignees";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ScrollArea, ScrollBar } from "@/fluzz/components/ui/scroll-area";
import { useIsMobile } from "@/fluzz/hooks/use-mobile";
import { 
  DndContext, 
  DragEndEvent, 
  DragOverlay, 
  DragStartEvent, 
  PointerSensor, 
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

interface Task {
  id: string;
  title: string;
  start_date?: string | null;
  due_date?: string | null;
  status?: string | null;
  priority?: string | null;
  assigned_to?: string | null;
  approval_reviewer_id?: string | null;
  task_order?: number | null;
  setor?: string | null;
}

interface TimelineViewProps {
  tasks: Task[];
  onUpdateTaskDates: (taskId: string, startDate: string | null, dueDate: string | null) => void;
  onUpdateOrder?: (taskId: string, newOrder: number) => void;
  sortMode?: "az" | "manual";
  onSortModeChange?: (mode: "az" | "manual") => void;
  setorNames?: Record<string, string>;
  projectId?: string;
}

type DragMode = 'move' | 'resize-start' | 'resize-end' | null;

// Natural sort function - recognizes numbers in strings
const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
};

// Sortable task row component for vertical drag
function SortableTaskNameRow({ 
  task, 
  sortMode, 
  onClick,
  setorNames = {}
}: { 
  task: Task; 
  sortMode: "az" | "manual";
  onClick: () => void;
  setorNames?: Record<string, string>;
}) {
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
    zIndex: isDragging ? 50 : 1,
  };

  const setorName = task.setor ? (setorNames[task.setor] || task.setor) : null;
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(task.title);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isEditing) setEditedTitle(task.title);
  }, [task.title, isEditing]);

  const handleTitleSave = async () => {
    setIsEditing(false);
    const trimmed = editedTitle.trim();
    if (!trimmed || trimmed === task.title) {
      setEditedTitle(task.title);
      return;
    }
    const { error } = await supabase
      .from("tasks")
      .update({ title: trimmed })
      .eq("id", task.id);
    if (error) {
      toast.error("Erro ao atualizar título");
      setEditedTitle(task.title);
      return;
    }
    toast.success("Título atualizado!");
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
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
        onClick();
      }, 250);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "h-12 p-2 border-b flex items-center gap-2 hover:bg-muted/30 transition-colors",
        isDragging && "bg-muted shadow-lg"
      )}
    >
      {sortMode === "manual" && (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab hover:text-primary flex-shrink-0"
        >
          <GripHorizontal size={14} className="text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
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
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="h-7 text-sm"
          />
        ) : (
          <div
            className="cursor-pointer hover:text-primary"
            onClick={handleTitleClick}
            title="Clique duplo para editar"
          >
            <span className="text-sm truncate block">
              {task.title}
            </span>
            {setorName && (
              <span className="text-[10px] text-muted-foreground/60 truncate block">
                {setorName}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const parseTaskDate = (value: string) => {
  // Avoid JS Date UTC parsing for YYYY-MM-DD (causes off-by-one in many timezones)
  if (value.includes("T")) return startOfDay(new Date(value));
  return startOfDay(parse(value, "yyyy-MM-dd", new Date()));
};

const formatTaskDate = (date: Date) => format(startOfDay(date), "yyyy-MM-dd");

export const TimelineView = ({
  tasks,
  onUpdateTaskDates,
  onUpdateOrder,
  sortMode = "az",
  onSortModeChange,
  setorNames = {},
  projectId
}: TimelineViewProps) => {
  const navigate = useNavigate();
  const [verticalDraggedTask, setVerticalDraggedTask] = useState<Task | null>(null);
  const today = startOfDay(new Date());
  
  // Responsáveis reais de cada tarefa vêm de task_assignees (mesma fonte usada em
  // Lista/Kanban); assigned_to/approval_reviewer_id na própria task podem estar
  // desatualizados em relação ao que foi definido em "Gerenciar Responsáveis".
  const taskIds = useMemo(() => tasks.map(t => t.id), [tasks]);
  const { data: taskAssigneesMap } = useMultipleTasksAssignees(taskIds, tasks);

  // Collect all user IDs from tasks (assigned_to + approval_reviewer_id + task_assignees)
  const allUserIds = useMemo(() => {
    const ids = new Set<string>();
    tasks.forEach(task => {
      if (task.assigned_to) ids.add(task.assigned_to);
      if (task.approval_reviewer_id) ids.add(task.approval_reviewer_id);
    });
    if (taskAssigneesMap) {
      Object.values(taskAssigneesMap).forEach(entries => {
        entries.forEach(a => ids.add(a.user_id));
      });
    }
    return Array.from(ids);
  }, [tasks, taskAssigneesMap]);

  // Fetch profiles for all assignees
  const { data: profiles } = useQuery({
    queryKey: ["timeline-profiles", allUserIds],
    queryFn: async () => {
      if (allUserIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, avatar_url")
        .in("user_id", allUserIds);
      if (error) throw error;
      return data || [];
    },
    enabled: allUserIds.length > 0,
  });
  
  // View spans ~4 years: 2 years before today, 2 years after (730 days each)
  const totalDays = 1461; // ~4 years
  const viewStart = addDays(today, -730);
  const viewEnd = addDays(viewStart, totalDays - 1);
  
  const days = useMemo(() => {
    return Array.from({ length: totalDays }, (_, i) => addDays(viewStart, i));
  }, [viewStart, totalDays]);

  const [dragState, setDragState] = useState<{
    taskId: string;
    mode: DragMode;
    startX: number;
    initialStartDate: string | null;
    initialDueDate: string | null;
    currentDaysDelta: number;
  } | null>(null);
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // All tasks sorted - including those without dates
  const allTasksSorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (sortMode === "az") {
        return naturalSort(a.title, b.title);
      }
      // Manual - by task_order
      return (a.task_order || 0) - (b.task_order || 0);
    });
  }, [tasks, sortMode]);

  // Vertical drag sensors - for reordering tasks
  const verticalSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleVerticalDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    setVerticalDraggedTask(task || null);
  };

  const handleVerticalDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setVerticalDraggedTask(null);

    if (!over || active.id === over.id) return;

    if (sortMode === "manual" && onUpdateOrder) {
      const activeId = active.id as string;
      const overId = over.id as string;
      
      const oldIndex = allTasksSorted.findIndex(t => t.id === activeId);
      const newIndex = allTasksSorted.findIndex(t => t.id === overId);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        onUpdateOrder(activeId, newIndex);
      }
    }
  };

  const handleVerticalDragCancel = () => {
    setVerticalDraggedTask(null);
  };

  // Show ALL tasks in the timeline - getTaskBar handles hiding bars outside visible range
  const visibleTasks = allTasksSorted;

  const dayWidth = 40; // Fixed pixel width per day for smooth scrolling

  // Get task bar position and width - with optional drag offset
  const getTaskBar = (task: Task, dragInfo: { offset: number; mode: DragMode; initialStart: string | null; initialEnd: string | null } | null) => {
    // Use initial dates from drag state if dragging, otherwise use task dates
    let startDateStr = task.start_date;
    let endDateStr = task.due_date;
    
    if (dragInfo) {
      // Use the initial dates from when drag started
      startDateStr = dragInfo.initialStart;
      endDateStr = dragInfo.initialEnd;
    }
    
    // If we have neither date, return null (ghost bar will be shown instead)
    if (!startDateStr && !endDateStr) return null;
    
    // Handle cases with only one date - use that date for both start and end
    let startDate = startDateStr ? parseTaskDate(startDateStr) : parseTaskDate(endDateStr!);
    let endDate = endDateStr ? parseTaskDate(endDateStr) : parseTaskDate(startDateStr!);

    // Apply drag offset based on mode
    if (dragInfo && dragInfo.offset !== 0) {
      if (dragInfo.mode === 'move') {
        startDate = addDays(startDate, dragInfo.offset);
        endDate = addDays(endDate, dragInfo.offset);
      } else if (dragInfo.mode === 'resize-start') {
        const newStart = addDays(startDate, dragInfo.offset);
        startDate = newStart > endDate ? endDate : newStart;
      } else if (dragInfo.mode === 'resize-end') {
        const newEnd = addDays(endDate, dragInfo.offset);
        endDate = newEnd < startDate ? startDate : newEnd;
      }
    }

    // Compute real positions - no clamping, tasks outside range still render
    const left = differenceInDays(startDate, viewStart) * dayWidth;
    const duration = differenceInDays(endDate, startDate) + 1;
    const width = Math.max(duration * dayWidth, dayWidth);

    return { left, width };
  };

  // Handle drag start
  const handleDragStart = (e: React.MouseEvent, taskId: string, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    setDragState({
      taskId,
      mode,
      startX: e.clientX,
      initialStartDate: task.start_date || null,
      initialDueDate: task.due_date || null,
      currentDaysDelta: 0,
    });
  };

  // Handle drag move - update visual state in real-time
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState) return;

    const deltaX = e.clientX - dragState.startX;
    const daysDelta = Math.round(deltaX / dayWidth);

    // Update visual state immediately
    setDragState(prev => prev ? { ...prev, currentDaysDelta: daysDelta } : null);
  }, [dragState, dayWidth]);

  // Handle drag end - commit changes
  const handleMouseUp = useCallback(() => {
    if (!dragState || dragState.currentDaysDelta === 0) {
      setDragState(null);
      return;
    }

    const initialStartStr = dragState.initialStartDate;
    const initialEndStr = dragState.initialDueDate;
    const daysDelta = dragState.currentDaysDelta;

    // Handle cases where we only have one date
    const initialStart = initialStartStr ? parseTaskDate(initialStartStr) : initialEndStr ? parseTaskDate(initialEndStr) : null;
    const initialEnd = initialEndStr ? parseTaskDate(initialEndStr) : initialStartStr ? parseTaskDate(initialStartStr) : null;

    if (!initialStart || !initialEnd) {
      setDragState(null);
      return;
    }

    let newStartDate = initialStart;
    let newDueDate = initialEnd;

    if (dragState.mode === 'move') {
      newStartDate = addDays(initialStart, daysDelta);
      newDueDate = addDays(initialEnd, daysDelta);
    } else if (dragState.mode === 'resize-start') {
      newStartDate = addDays(initialStart, daysDelta);
      if (newStartDate > newDueDate) {
        newStartDate = newDueDate;
      }
    } else if (dragState.mode === 'resize-end') {
      newDueDate = addDays(initialEnd, daysDelta);
      if (newDueDate < newStartDate) {
        newDueDate = newStartDate;
      }
    }

    onUpdateTaskDates(
      dragState.taskId,
      formatTaskDate(newStartDate),
      formatTaskDate(newDueDate)
    );

    setDragState(null);
  }, [dragState, onUpdateTaskDates]);

  useEffect(() => {
    if (dragState) {
      document.body.style.cursor = dragState.mode === 'move' ? 'grabbing' : 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  // Get status color - considers overdue and due today
  const getTaskColor = (task: Task) => {
    // Completed tasks are always green
    if (task.status === 'completed') return 'bg-green-500';
    
    // Check due date for overdue or due today
    if (task.due_date) {
      const dueDate = parseTaskDate(task.due_date);
      const todayStart = startOfDay(new Date());
      
      // Due today - golden yellow
      if (dueDate.getTime() === todayStart.getTime()) {
        return 'bg-amber-500';
      }
      
      // Overdue - red
      if (dueDate < todayStart) {
        return 'bg-red-500';
      }
    }
    
    // In progress - blue
    if (task.status === 'in_progress') return 'bg-blue-500';
    
    // Default (pending/todo) - slate gray (works in both light and dark modes)
    return 'bg-slate-500';
  };

  // Get day of week abbreviation in Portuguese
  const getDayOfWeek = (date: Date) => {
    const dayIndex = date.getDay();
    const weekDays = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    return weekDays[dayIndex];
  };

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const scrollToDay = useCallback((dayOffset: number, smooth = true) => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        const scrollPosition = dayOffset * dayWidth - (viewport.clientWidth / 2) + (dayWidth / 2);
        viewport.scrollTo({ left: Math.max(0, scrollPosition), behavior: smooth ? 'smooth' : 'auto' });
      }
    }
  }, [dayWidth]);

  const goToToday = () => {
    // Today is at index 730 (730 days from viewStart)
    scrollToDay(730);
  };

  // Scroll to today on mount
  useEffect(() => {
    setTimeout(() => scrollToDay(730, false), 100);
  }, [scrollToDay]);

  // Calculate today indicator position
  const todayIndex = differenceInDays(today, viewStart);
  const todayPosition = todayIndex * dayWidth;
  const showTodayLine = todayIndex >= 0 && todayIndex < totalDays;

  const isMobile = useIsMobile();

  // Resizable column state - persistido por projeto, para não precisar reajustar
  // toda vez que a página é recarregada. Cai no padrão (menor no mobile) só quando
  // ainda não há uma largura salva para este projeto.
  const columnWidthStorageKey = projectId ? `timeline-column-width-${projectId}` : null;
  const [taskColumnWidth, setTaskColumnWidth] = useState(() => {
    if (columnWidthStorageKey) {
      const saved = parseInt(localStorage.getItem(columnWidthStorageKey) || "", 10);
      if (!Number.isNaN(saved)) return saved;
    }
    return isMobile ? 100 : 192;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Persiste a largura escolhida para este projeto.
  useEffect(() => {
    if (columnWidthStorageKey) {
      localStorage.setItem(columnWidthStorageKey, String(taskColumnWidth));
    }
  }, [taskColumnWidth, columnWidthStorageKey]);

  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    resizeStartX.current = clientX;
    resizeStartWidth.current = taskColumnWidth;
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleResizeMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const delta = clientX - resizeStartX.current;
      const minWidth = isMobile ? 60 : 120;
      const maxWidth = isMobile ? 200 : 400;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStartWidth.current + delta));
      setTaskColumnWidth(newWidth);
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
    document.addEventListener("touchmove", handleResizeMove);
    document.addEventListener("touchend", handleResizeEnd);

    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
      document.removeEventListener("touchmove", handleResizeMove);
      document.removeEventListener("touchend", handleResizeEnd);
    };
  }, [isResizing, isMobile]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>
            Hoje
          </Button>
        </div>
        
        {/* Sort Toggle */}
        {onSortModeChange && (
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
        )}
      </div>

      {/* Timeline Container */}
      <div className={cn("border rounded-lg overflow-hidden bg-card", isResizing && "select-none")} ref={containerRef}>
        <div className="flex">
          {/* Task names column - resizable with vertical drag support */}
          <div className="shrink-0 bg-card z-20 relative" style={{ width: taskColumnWidth }}>
            {/* Header */}
            <div className="h-14 p-2 border-b bg-muted/50 font-medium text-sm flex items-center">
              Tarefa
            </div>
            {/* Task rows with drag support */}
            {visibleTasks.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                Nenhuma tarefa
              </div>
            ) : (
              <DndContext
                sensors={verticalSensors}
                collisionDetection={closestCenter}
                onDragStart={handleVerticalDragStart}
                onDragEnd={handleVerticalDragEnd}
                onDragCancel={handleVerticalDragCancel}
              >
                <SortableContext
                  items={visibleTasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {visibleTasks.map(task => (
                    <SortableTaskNameRow
                      key={task.id}
                      task={task}
                      sortMode={sortMode}
                      onClick={() => navigate(`/tools/wizzy-flow/tasks/${task.id}`)}
                      setorNames={setorNames}
                    />
                  ))}
                </SortableContext>
                <DragOverlay dropAnimation={{
                  duration: 200,
                  easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                }}>
                  {verticalDraggedTask ? (
                    <div className="h-12 p-2 border rounded bg-card shadow-xl flex items-center gap-2" style={{ width: taskColumnWidth }}>
                      <GripHorizontal size={14} className="text-muted-foreground" />
                      <span className="text-sm truncate">{verticalDraggedTask.title}</span>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>

          {/* Resize handle - touch-friendly on mobile */}
          <div
            className={cn(
              "shrink-0 cursor-col-resize hover:bg-primary/50 transition-colors z-30 touch-none",
              isResizing ? "bg-primary" : "bg-border",
              isMobile ? "w-3" : "w-1"
            )}
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeStart}
          />

          {/* Scrollable timeline area */}
          <ScrollArea className="flex-1" type="always" ref={scrollAreaRef}>
            <div 
              ref={timelineRef}
              className="relative"
              style={{ width: totalDays * dayWidth }}
            >
              {/* Date header */}
              <div className="h-14 flex border-b bg-muted/50 sticky top-0 z-10">
                {days.map((day, i) => {
                  const isFirstOfMonth = day.getDate() === 1;
                  const monthAbbr = format(day, "MMM", { locale: ptBR });
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex flex-col items-center justify-center border-r text-xs relative",
                        isToday(day) && "bg-primary/10"
                      )}
                      style={{ width: dayWidth }}
                    >
                      {isFirstOfMonth && (
                        <div className="text-[9px] text-muted-foreground/60 font-medium uppercase leading-none">
                          {monthAbbr}
                        </div>
                      )}
                      <div className={cn(
                        "font-medium",
                        isToday(day) && "text-primary font-bold"
                      )}>
                        {format(day, "d")}
                      </div>
                      <div className={cn(
                        "text-[10px] text-muted-foreground",
                        isToday(day) && "text-primary"
                      )}>
                        {getDayOfWeek(day)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Task rows with bars */}
              {visibleTasks.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-muted-foreground">
                  Nenhuma tarefa neste projeto.
                </div>
              ) : (
                visibleTasks.map(task => {
                  const isDragging = dragState?.taskId === task.id;
                  const dragInfo = isDragging ? {
                    offset: dragState.currentDaysDelta,
                    mode: dragState.mode,
                    initialStart: dragState.initialStartDate,
                    initialEnd: dragState.initialDueDate,
                  } : null;
                  const bar = getTaskBar(task, dragInfo);
                  const hasNoDates = !task.start_date && !task.due_date;
                  
                  // For ghost bars - position centered on today
                  const todayIdx = differenceInDays(today, viewStart);
                  const ghostLeft = todayIdx * dayWidth;
                  const ghostWidth = dayWidth * 3; // 3 days default width
                  
                  return (
                    <div 
                      key={task.id} 
                      className="h-12 relative border-b"
                      onClick={(e) => {
                        // Only handle click for tasks without dates
                        if (!hasNoDates || isDragging) return;
                        
                        // Get click position relative to the timeline
                        const rect = e.currentTarget.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const clickedDayIndex = Math.floor(clickX / dayWidth);
                        const clickedDate = addDays(viewStart, clickedDayIndex);
                        
                        // Set dates: clicked date as start, +2 days as end
                        const startDate = format(clickedDate, 'yyyy-MM-dd');
                        const endDate = format(addDays(clickedDate, 2), 'yyyy-MM-dd');
                        onUpdateTaskDates(task.id, startDate, endDate);
                      }}
                      style={{ cursor: hasNoDates && !isDragging ? 'pointer' : 'default' }}
                      >
                      {/* Grid lines - clickable for tasks without dates */}
                      <div className={cn(
                        "absolute inset-0 flex pointer-events-none"
                      )}>
                        {days.map((day, i) => (
                          <div 
                            key={i} 
                            className={cn(
                              "border-r transition-colors",
                              isToday(day) && "bg-primary/5",
                              hasNoDates && !isDragging && "hover:bg-muted/50"
                            )}
                            style={{ width: dayWidth }}
                          />
                        ))}
                      </div>

                      {/* Ghost bar indicator for tasks without dates */}
                      {hasNoDates && !isDragging && (
                        <div
                          className="absolute top-2 h-8 rounded-md flex items-center justify-center pointer-events-none
                            bg-muted/30 border-2 border-dashed border-muted-foreground/20"
                          style={{
                            left: ghostLeft,
                            width: ghostWidth,
                          }}
                        >
                          <span className="text-xs text-muted-foreground/50 select-none">
                            Clique para definir
                          </span>
                        </div>
                      )}

                      {/* Task bar - real or being dragged */}
                      {bar && (
                        <div
                          className={cn(
                            "absolute top-2 h-8 rounded-full flex items-center group transition-all duration-75 pointer-events-auto",
                            getTaskColor(task),
                            isDragging 
                              ? "shadow-xl ring-2 ring-primary/50 opacity-90 scale-[1.02]" 
                              : "shadow-sm hover:shadow-md"
                          )}
                          style={{
                            left: bar.left,
                            width: Math.max(bar.width, dayWidth),
                            zIndex: isDragging ? 40 : 20,
                          }}
                        >
                          {/* Resize handle - start */}
                          <div
                            className={cn(
                              "absolute left-0 top-0 bottom-0 w-4 cursor-col-resize rounded-l-full transition-all z-10",
                              "flex items-center justify-center",
                              "hover:bg-white/30",
                              isDragging && dragInfo?.mode === 'resize-start' && "bg-white/40"
                            )}
                            onMouseDown={(e) => handleDragStart(e, task.id, 'resize-start')}
                          >
                            <div className="w-[2px] h-4 bg-white/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>

                          {/* Move handle - main area with avatars */}
                          <div 
                            className={cn(
                              "flex-1 h-full flex items-center gap-1.5 pl-1 pr-2 cursor-grab",
                              isDragging && dragInfo?.mode === 'move' && "cursor-grabbing"
                            )}
                            onMouseDown={(e) => handleDragStart(e, task.id, 'move')}
                          >
                            {/* Assignee avatars */}
                            {(() => {
                              const assigneeEntries = taskAssigneesMap?.[task.id];
                              const rawEntries = assigneeEntries && assigneeEntries.length > 0
                                ? assigneeEntries
                                : [
                                    ...(task.assigned_to ? [{ user_id: task.assigned_to }] : []),
                                    ...(task.approval_reviewer_id && task.approval_reviewer_id !== task.assigned_to
                                      ? [{ user_id: task.approval_reviewer_id }]
                                      : []),
                                  ];

                              const assignees = rawEntries
                                .map(entry => profiles?.find(p => p.user_id === entry.user_id))
                                .filter((p): p is NonNullable<typeof p> => Boolean(p));

                              if (assignees.length === 0) return null;
                              
                              return (
                                <div className="flex items-center shrink-0 -space-x-1">
                                  {assignees.slice(0, 2).map((user, index) => (
                                    <Avatar 
                                      key={user.id} 
                                      className={cn(
                                        "h-6 w-6 border-2 border-white/50 shrink-0",
                                        index > 0 && "-ml-1"
                                      )}
                                    >
                                      <AvatarImage src={user.avatar_url || undefined} />
                                      <AvatarFallback className="text-[10px] bg-white/30 text-white font-medium">
                                        {user.full_name?.charAt(0)?.toUpperCase() || <User className="h-3 w-3" />}
                                      </AvatarFallback>
                                    </Avatar>
                                  ))}
                                </div>
                              );
                            })()}
                            
                            <span 
                              className="text-xs font-medium text-white whitespace-nowrap select-none"
                              style={{ 
                                WebkitTextStroke: '1.5px black',
                                paintOrder: 'stroke fill'
                              }}
                            >
                              {task.title}
                            </span>
                          </div>

                          {/* Resize handle - end */}
                          <div
                            className={cn(
                              "absolute right-0 top-0 bottom-0 w-4 cursor-col-resize rounded-r-full transition-all z-10",
                              "flex items-center justify-center",
                              "hover:bg-white/30",
                              isDragging && dragInfo?.mode === 'resize-end' && "bg-white/40"
                            )}
                            onMouseDown={(e) => handleDragStart(e, task.id, 'resize-end')}
                          >
                            <div className="w-[2px] h-4 bg-white/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Today indicator line - inside the timeline only */}
              {showTodayLine && (
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-destructive/60 z-30 pointer-events-none"
                  style={{ left: todayPosition + dayWidth / 2 }}
                >
                  <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-destructive rounded-full shadow-sm" />
                </div>
              )}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </div>

      {/* Hint */}
      <p className="text-xs text-muted-foreground text-center">
        Arraste as barras para mover ou redimensione pelas bordas • Clique nas barras tracejadas para definir datas
      </p>
    </div>
  );
};