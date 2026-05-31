import { TaskCard } from "./TaskCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";

interface TaskBoardProps {
  tasks: any[];
  onDeleteTask: (taskId: string) => void;
  onUpdateStatus: (taskId: string, status: string) => void;
}

const columns = [
  { id: "todo", title: "A fazer", color: "border-l-4 border-l-status-todo" },
  { id: "in_progress", title: "Fazendo", color: "border-l-4 border-l-status-in-progress" },
  { id: "completed", title: "Feito", color: "border-l-4 border-l-status-completed" },
];

export const TaskBoard = ({ tasks, onDeleteTask, onUpdateStatus }: TaskBoardProps) => {
  const getTasksByStatus = (status: string) => {
    return tasks.filter((task) => task.status === status);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {columns.map((column) => {
        const columnTasks = getTasksByStatus(column.id);
        return (
          <Card key={column.id} className={`${column.color}`}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                {column.title}
                <span className="text-sm font-normal text-muted-foreground">
                  {columnTasks.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
              {columnTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma tarefa
                </p>
              ) : (
                columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onDelete={() => onDeleteTask(task.id)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};