import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";

export function useTaskExternalAssignees(taskId: string | undefined) {
  return useQuery({
    queryKey: ["task-external-assignees", taskId],
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from("task_external_assignees")
        .select("participant_id, created_at")
        .eq("task_id", taskId);
      if (error) throw error;
      return data;
    },
    enabled: !!taskId,
  });
}

export function useMultipleTasksExternalAssignees(taskIds: string[]) {
  return useQuery({
    queryKey: ["task-external-assignees-multiple", taskIds],
    queryFn: async () => {
      if (taskIds.length === 0) return {};
      const { data, error } = await supabase
        .from("task_external_assignees")
        .select("task_id, participant_id")
        .in("task_id", taskIds);
      if (error) throw error;

      const grouped: Record<string, string[]> = {};
      data?.forEach((item) => {
        if (!grouped[item.task_id]) grouped[item.task_id] = [];
        grouped[item.task_id].push(item.participant_id);
      });
      return grouped;
    },
    enabled: taskIds.length > 0,
  });
}

export function useExternalParticipants(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["external-participants", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data, error } = await supabase
        .from("external_participants")
        .select("id, name, phone, email")
        .eq("workspace_id", workspaceId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!workspaceId,
  });
}
