import React, { useState } from "react";
import { TaskCard } from "./TaskCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { ArrowDownAZ, GripVertical } from "lucide-react";
import { 
  DndContext, 
  DragEndEvent, 
  DragOverlay, 
  DragStartEvent, 
  PointerSensor, 
  TouchSensor,
  useSensor, 
  useSensors, 
  rectIntersection,
  useDroppable,
  Active,
  Over
} from "@dnd-kit/core";
import { 
  SortableContext, 
  verticalListSortingStrategy, 
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface DraggableTaskBoardProps {
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

function DroppableColumn({ column, children, taskCount }: { column: any; children: React.ReactNode; taskCount: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  return (
    <Card 
      ref={setNodeRef} 
      className={`${column.color} transition-all duration-200 min-w-[120px] ${isOver ? 'ring-2 ring-primary ring-offset-2 bg-accent/50' : ''}`}
    >
      <CardHeader className="p-2 md:p-4">
        <CardTitle className="text-xs sm:text-sm md:text-lg flex items-center justify-between gap-1">
          <span className="truncate">{column.title}</span>
          <span className="text-xs font-normal text-muted-foreground flex-shrink-0">
            {taskCount}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 md:p-3 space-y-2 min-h-[150px] md:min-h-[200px]">
        {children}
      </CardContent>
    </Card>
  );
}

function SortableTask({ task, onDelete }: { task: any; onDelete: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: task.id,
    data: {
      type: 'task',
      task,
      status: task.status,
    }
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      {...attributes}
      {...listeners}
      className={`${isDragging ? 'z-50 cursor-grabbing' : 'cursor-grab'}`}
    >
      <TaskCard
        task={task}
        onDelete={onDelete}
        isDraggable
      />
    </div>
  );
}

export const DraggableTaskBoard = ({ 
  tasks, 
  onDeleteTask, 
  onUpdateStatus, 
  onUpdateOrder,
  sortMode,
  onSortModeChange 
}: DraggableTaskBoardProps) => {
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

  // Natural sort function - recognizes numbers in strings
  const naturalSort = (a: string, b: string) => {
    return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
  };

  const getTasksByStatus = (status: string) => {
    const filtered = tasks.filter((task) => task.status === status);
    
    if (sortMode === "az") {
      return filtered.sort((a, b) => naturalSort(a.title, b.title));
    }
    
    // Manual order - sort by task_order
    return filtered.sort((a, b) => (a.task_order || 0) - (b.task_order || 0));
  };

  const handleDragStart = (event: DragStartEvent) => {
    console.log("Drag start:", event.active.id);
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task);
  };

  // Find which column an item belongs to
  const findColumn = (id: string | undefined): string | null => {
    if (!id) return null;
    
    // Check if it's a column ID
    const isColumn = columns.find((c) => c.id === id);
    if (isColumn) return id;
    
    // Check if it's a task ID
    const task = tasks.find((t) => t.id === id);
    if (task) return task.status;
    
    return null;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveTask(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const draggedTask = tasks.find((t) => t.id === activeId);
    if (!draggedTask) return;

    // Check if dropped on a column directly
    const overColumn = columns.find((c) => c.id === overId);
    if (overColumn) {
      if (draggedTask.status !== overColumn.id) {
        onUpdateStatus(draggedTask.id, overColumn.id);
      }
      return;
    }

    // Check if dropped on another task
    const overTask = tasks.find((t) => t.id === overId);
    if (!overTask) return;

    // If different status, move to new column
    if (draggedTask.status !== overTask.status) {
      onUpdateStatus(draggedTask.id, overTask.status);
      return;
    }

    // Same column reordering
    if (sortMode === "manual" && onUpdateOrder) {
      const columnTasks = tasks
        .filter(t => t.status === draggedTask.status)
        .sort((a, b) => (a.task_order || 0) - (b.task_order || 0));
      
      const oldIndex = columnTasks.findIndex(t => t.id === activeId);
      const newIndex = columnTasks.findIndex(t => t.id === overId);
      
      if (oldIndex !== newIndex) {
        onUpdateOrder(draggedTask.id, newIndex, draggedTask.status);
      }
    }
  };

  const handleDragCancel = () => {
    setActiveTask(null);
  };

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

      <DndContext
        sensors={sensors}
        collisionDetection={rectIntersection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
      <div className="grid grid-cols-3 gap-2 md:gap-4 overflow-x-auto min-w-0">
        {/* Note: On mobile, columns are side by side with horizontal scroll if needed */}
        {columns.map((column) => {
          const columnTasks = getTasksByStatus(column.id);
          return (
            <DroppableColumn key={column.id} column={column} taskCount={columnTasks.length}>
              <SortableContext
                items={columnTasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                {columnTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Arraste tarefas aqui
                  </p>
                ) : (
                  columnTasks.map((task) => (
                    <SortableTask
                      key={task.id}
                      task={task}
                      onDelete={() => onDeleteTask(task.id)}
                    />
                  ))
                )}
              </SortableContext>
            </DroppableColumn>
          );
        })}
      </div>
      <DragOverlay dropAnimation={{
        duration: 200,
        easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
      }}>
        {activeTask ? (
          <div className="rotate-2 shadow-2xl scale-105 opacity-90">
            <TaskCard
              task={activeTask}
              onDelete={() => {}}
              isDraggable
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
    </div>
  );
};
