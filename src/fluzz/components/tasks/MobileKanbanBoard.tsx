import React, { useState, useRef, useCallback, useEffect } from "react";
import { TaskCard } from "./TaskCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { ArrowDownAZ, GripVertical } from "lucide-react";

interface MobileKanbanBoardProps {
  tasks: any[];
  onDeleteTask: (taskId: string) => void;
  onUpdateStatus: (taskId: string, status: string) => void;
  onUpdateOrder?: (taskId: string, newOrder: number, status: string) => void;
  sortMode: "manual" | "az";
  onSortModeChange: (mode: "manual" | "az") => void;
}

const columns = [
  { id: "todo", title: "A fazer", color: "border-l-4 border-l-status-todo" },
  { id: "in_progress", title: "Fazendo", color: "border-l-4 border-l-status-in-progress" },
  { id: "completed", title: "Feito", color: "border-l-4 border-l-status-completed" },
];

export const MobileKanbanBoard = ({
  tasks,
  onDeleteTask,
  onUpdateStatus,
  onUpdateOrder,
  sortMode,
  onSortModeChange,
}: MobileKanbanBoardProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [draggedTask, setDraggedTask] = useState<any>(null);
  const [draggedElement, setDraggedElement] = useState<HTMLDivElement | null>(null);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);
  const [isLongPress, setIsLongPress] = useState(false);
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);
  const [hoveredTaskIndex, setHoveredTaskIndex] = useState<{ column: string; index: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollRef = useRef<number | null>(null);
  const touchOffsetRef = useRef({ x: 0, y: 0 });

  // Natural sort function
  const naturalSort = (a: string, b: string) => {
    return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
  };

  const getTasksByStatus = (status: string) => {
    const filtered = tasks.filter((task) => task.status === status);
    
    if (sortMode === "az") {
      return filtered.sort((a, b) => naturalSort(a.title, b.title));
    }
    
    return filtered.sort((a, b) => (a.task_order || 0) - (b.task_order || 0));
  };

  // Auto-scroll logic when dragging near edges
  const handleAutoScroll = useCallback((clientX: number) => {
    if (!scrollContainerRef.current || !draggedTask) return;

    const container = scrollContainerRef.current;
    const rect = container.getBoundingClientRect();
    const scrollSpeed = 8;
    const edgeThreshold = 60;

    // Clear previous auto-scroll
    if (autoScrollRef.current) {
      cancelAnimationFrame(autoScrollRef.current);
    }

    const scroll = () => {
      if (!scrollContainerRef.current || !draggedTask) return;
      
      const relativeX = clientX - rect.left;
      
      if (relativeX < edgeThreshold) {
        // Scroll left
        container.scrollLeft -= scrollSpeed;
        autoScrollRef.current = requestAnimationFrame(scroll);
      } else if (relativeX > rect.width - edgeThreshold) {
        // Scroll right
        container.scrollLeft += scrollSpeed;
        autoScrollRef.current = requestAnimationFrame(scroll);
      }
    };

    scroll();
  }, [draggedTask]);

  // Determine which column the touch is over
  const getColumnAtPosition = useCallback((clientX: number, clientY: number) => {
    const columnElements = document.querySelectorAll('[data-column-id]');
    for (const el of columnElements) {
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return el.getAttribute('data-column-id');
      }
    }
    return null;
  }, []);

  // Determine task insertion index
  const getTaskIndexAtPosition = useCallback((columnId: string, clientY: number) => {
    const taskElements = document.querySelectorAll(`[data-column-id="${columnId}"] [data-task-id]`);
    let insertIndex = 0;
    
    for (let i = 0; i < taskElements.length; i++) {
      const el = taskElements[i];
      const rect = el.getBoundingClientRect();
      const taskMidpoint = rect.top + rect.height / 2;
      
      if (clientY > taskMidpoint) {
        insertIndex = i + 1;
      }
    }
    
    return insertIndex;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent, task: any) => {
    const touch = e.touches[0];
    setTouchStartPos({ x: touch.clientX, y: touch.clientY });
    
    // Get the task card element
    const taskElement = e.currentTarget as HTMLDivElement;
    const rect = taskElement.getBoundingClientRect();
    
    // Store offset from touch point to element top-left
    touchOffsetRef.current = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };

    // Start long press timer (1000ms to activate drag)
    longPressTimerRef.current = setTimeout(() => {
      setIsLongPress(true);
      setDraggedTask(task);
      setDraggedElement(taskElement);
      setDragPosition({ x: touch.clientX, y: touch.clientY });
      
      // Haptic feedback (if supported)
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 1000);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    
    // If not in drag mode yet, check if moved too much (cancel long press)
    if (!isLongPress && touchStartPos) {
      const dx = Math.abs(touch.clientX - touchStartPos.x);
      const dy = Math.abs(touch.clientY - touchStartPos.y);
      
      if (dx > 10 || dy > 10) {
        // Moved too much, cancel long press
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        return;
      }
    }

    if (isLongPress && draggedTask) {
      e.preventDefault();
      
      setDragPosition({ x: touch.clientX, y: touch.clientY });
      
      // Auto-scroll when near edges
      handleAutoScroll(touch.clientX);
      
      // Determine hovered column
      const columnId = getColumnAtPosition(touch.clientX, touch.clientY);
      setHoveredColumn(columnId);
      
      if (columnId) {
        const index = getTaskIndexAtPosition(columnId, touch.clientY);
        setHoveredTaskIndex({ column: columnId, index });
      } else {
        setHoveredTaskIndex(null);
      }
    }
  }, [isLongPress, draggedTask, touchStartPos, handleAutoScroll, getColumnAtPosition, getTaskIndexAtPosition]);

  const handleTouchEnd = useCallback(() => {
    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // Clear auto-scroll
    if (autoScrollRef.current) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }

    if (isLongPress && draggedTask && hoveredColumn) {
      const newStatus = hoveredColumn;
      const oldStatus = draggedTask.status;

      if (newStatus !== oldStatus) {
        // Moving to different column - update status
        onUpdateStatus(draggedTask.id, newStatus);
      } else if (sortMode === "manual" && onUpdateOrder && hoveredTaskIndex) {
        // Same column reordering
        onUpdateOrder(draggedTask.id, hoveredTaskIndex.index, newStatus);
      }
    }

    // Reset state
    setDraggedTask(null);
    setDraggedElement(null);
    setIsLongPress(false);
    setTouchStartPos(null);
    setHoveredColumn(null);
    setHoveredTaskIndex(null);
  }, [isLongPress, draggedTask, hoveredColumn, hoveredTaskIndex, onUpdateStatus, onUpdateOrder, sortMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Sort Toggle */}
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

      {/* Horizontal scrollable container */}
      <div 
        ref={scrollContainerRef}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 scrollbar-hide"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
      >
        {columns.map((column) => {
          const columnTasks = getTasksByStatus(column.id);
          const isHovered = hoveredColumn === column.id;
          
          return (
            <Card 
              key={column.id}
              data-column-id={column.id}
              className={`
                ${column.color} 
                flex-shrink-0 
                w-[85vw] 
                max-w-[320px] 
                snap-center
                transition-all 
                duration-200
                ${isHovered ? 'ring-2 ring-primary ring-offset-2 bg-accent/50 scale-[1.02]' : ''}
              `}
            >
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span>{column.title}</span>
                  <span className="text-xs font-normal text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                    {columnTasks.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2 min-h-[200px]">
                {columnTasks.length === 0 ? (
                  <div className={`
                    flex items-center justify-center 
                    h-24 
                    border-2 border-dashed border-muted 
                    rounded-lg 
                    text-sm text-muted-foreground
                    ${isHovered ? 'border-primary bg-primary/5' : ''}
                  `}>
                    Arraste tarefas aqui
                  </div>
                ) : (
                  columnTasks.map((task, index) => {
                    const isDragged = draggedTask?.id === task.id;
                    const showInsertIndicator = 
                      hoveredTaskIndex?.column === column.id && 
                      hoveredTaskIndex?.index === index &&
                      draggedTask?.id !== task.id;
                    const showInsertIndicatorAfter = 
                      hoveredTaskIndex?.column === column.id && 
                      hoveredTaskIndex?.index === index + 1 &&
                      draggedTask?.id !== task.id &&
                      index === columnTasks.length - 1;

                    return (
                      <div key={task.id}>
                        {/* Insert indicator before */}
                        {showInsertIndicator && (
                          <div className="h-1 bg-primary rounded-full mb-2 animate-pulse" />
                        )}
                        
                        <div
                          data-task-id={task.id}
                          onTouchStart={(e) => handleTouchStart(e, task)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          className={`
                            touch-none
                            transition-all
                            duration-200
                            ${isDragged ? 'opacity-30 scale-95' : ''}
                          `}
                        >
                          <TaskCard
                            task={task}
                            onDelete={() => onDeleteTask(task.id)}
                            isDraggable
                          />
                        </div>

                        {/* Insert indicator after last item */}
                        {showInsertIndicatorAfter && (
                          <div className="h-1 bg-primary rounded-full mt-2 animate-pulse" />
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Drag overlay - floating card that follows finger */}
      {isLongPress && draggedTask && (
        <div
          className="fixed pointer-events-none z-50"
          style={{
            left: dragPosition.x - touchOffsetRef.current.x,
            top: dragPosition.y - touchOffsetRef.current.y,
            width: 'calc(85vw - 24px)',
            maxWidth: '296px',
            transform: 'rotate(3deg) scale(1.05)',
          }}
        >
          <div className="shadow-2xl rounded-lg opacity-95">
            <TaskCard
              task={draggedTask}
              onDelete={() => {}}
              isDraggable
            />
          </div>
        </div>
      )}

      {/* Overlay to prevent scrolling during drag */}
      {isLongPress && (
        <div 
          className="fixed inset-0 z-40" 
          style={{ touchAction: 'none' }}
          onTouchMove={(e) => {
            e.preventDefault();
            handleTouchMove(e);
          }}
          onTouchEnd={handleTouchEnd}
        />
      )}
    </div>
  );
};
