import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { Skeleton } from "@/fluzz/components/ui/skeleton";
import { RoutineTaskCard } from "./RoutineTaskCard";

interface RoutineTasksListProps {
  routineId: string;
}

export function RoutineTasksList({ routineId }: RoutineTasksListProps) {
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["routine-tasks", routineId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routine_tasks")
        .select("*, projects(id, name), process_documentation(id, title)")
        .eq("routine_id", routineId)
        .order("task_order");
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-md">
        Nenhuma tarefa adicionada ainda
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <RoutineTaskCard key={task.id} task={task} />
      ))}
    </div>
  );
}
