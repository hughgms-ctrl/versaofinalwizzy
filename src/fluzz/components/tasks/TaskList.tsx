import { useState } from "react";
import { TaskCard } from "./TaskCard";
import { Card, CardContent } from "@/fluzz/components/ui/card";
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
  closestCenter,
} from "@dnd-kit/core";
import { 
  SortableContext, 
  verticalListSortingStrategy, 
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface TaskListProps {
  tasks: any[];
  onDeleteTask: (taskId: string) => void;
  onUpdateOrder?: (taskId: string, newOrder: number) => void;
  sortMode?: "manual" | "az";
  onSortModeChange?: (mode: "manual" | "az") => void;
}

// Natural sort function - recognizes numbers in strings
const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
};

function SortableTaskItem({ task, onDelete, sortMode }: { task: any; onDelete: () => void; sortMode: "manual" | "az" }) {
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

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      {...attributes}
      {...listeners}
      className={sortMode === "manual" ? (isDragging ? 'z-50 cursor-grabbing' : 'cursor-grab') : ''}
    >
      <TaskCard
        task={task}
        onDelete={onDelete}
        isDraggable={sortMode === "manual"}
      />
    </div>
  );
}

export const TaskList = ({ 
  tasks, 
  onDeleteTask, 
  onUpdateOrder,
  sortMode = "az",
  onSortModeChange
}: TaskListProps) => {
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

  // Sort tasks based on mode
  const sortedTasks = [...tasks].sort((a, b) => {
    if (sortMode === "az") {
      return naturalSort(a.title, b.title);
    }
    // Manual order - sort by task_order
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

  const handleDragCancel = () => {
    setActiveTask(null);
  };

  return (
    <div className="space-y-4">
      {/* Sort Toggle - only show if onSortModeChange is provided */}
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

      <Card>
        <CardContent className="p-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={sortedTasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {sortedTasks.length > 0 ? (
                  sortedTasks.map((task) => (
                    <SortableTaskItem
                      key={task.id}
                      task={task}
                      onDelete={() => onDeleteTask(task.id)}
                      sortMode={sortMode}
                    />
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma tarefa encontrada
                  </p>
                )}
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={{
              duration: 200,
              easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
            }}>
              {activeTask ? (
                <div className="rotate-1 shadow-2xl scale-105 opacity-90">
                  <TaskCard
                    task={activeTask}
                    onDelete={() => {}}
                    isDraggable
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </CardContent>
      </Card>
    </div>
  );
};
