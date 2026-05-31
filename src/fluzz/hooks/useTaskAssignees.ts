import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";

export function useTaskAssignees(taskId: string | undefined) {
  return useQuery({
    queryKey: ["task-assignees", taskId],
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from("task_assignees")
        .select("user_id, created_at")
        .eq("task_id", taskId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!taskId,
  });
}

export function useMultipleTasksAssignees(taskIds: string[], tasks?: any[]) {
  return useQuery({
    queryKey: ["task-assignees-multiple", taskIds, tasks?.map(t => t.approval_reviewer_id).join(',')],
    queryFn: async () => {
      if (taskIds.length === 0) return {};
      const { data, error } = await supabase
        .from("task_assignees")
        .select("task_id, user_id")
        .in("task_id", taskIds);
      if (error) throw error;
      
      // Group by task_id with role info
      const grouped: Record<string, { user_id: string; is_reviewer?: boolean }[]> = {};
      data?.forEach(item => {
        if (!grouped[item.task_id]) {
          grouped[item.task_id] = [];
        }
        grouped[item.task_id].push({ user_id: item.user_id, is_reviewer: false });
      });
      
      // Add approval_reviewer_id from tasks if available
      if (tasks) {
        tasks.forEach(task => {
          if (task.approval_reviewer_id) {
            if (!grouped[task.id]) {
              grouped[task.id] = [];
            }
            // Check if reviewer is already in the list
            const alreadyExists = grouped[task.id].some(
              a => a.user_id === task.approval_reviewer_id
            );
            if (!alreadyExists) {
              grouped[task.id].push({ user_id: task.approval_reviewer_id, is_reviewer: true });
            }
          }
        });
      }
      
      return grouped;
    },
    enabled: taskIds.length > 0,
  });
}
