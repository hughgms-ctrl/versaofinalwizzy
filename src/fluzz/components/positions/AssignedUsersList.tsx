import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Avatar, AvatarFallback } from "@/fluzz/components/ui/avatar";
import { UserMinus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";
import { Skeleton } from "@/fluzz/components/ui/skeleton";
import { formatDateBR } from "@/fluzz/lib/utils";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";

interface AssignedUsersListProps {
  positionId: string;
}

interface AssignmentWithProfile {
  id: string;
  user_id: string;
  assigned_at: string;
  profile: {
    id: string;
    full_name: string | null;
  } | null;
}

export function AssignedUsersList({ positionId }: AssignedUsersListProps) {
  const queryClient = useQueryClient();
  const { isAdmin, isGestor } = useWorkspace();
  const canEdit = isAdmin || isGestor;

  const { data: assignedUsers, isLoading } = useQuery<AssignmentWithProfile[]>({
    queryKey: ["assigned-users", positionId],
    queryFn: async () => {
      const { data: assignments, error } = await supabase
        .from("user_positions")
        .select("id, user_id, assigned_at")
        .eq("position_id", positionId)
        .order("assigned_at", { ascending: false });

      if (error) throw error;
      if (!assignments || assignments.length === 0) return [];

      const userIds = assignments.map((assignment) => assignment.user_id);

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, user_id, full_name")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      return assignments.map((assignment) => ({
        ...assignment,
        profile: profiles?.find((profile) => profile.user_id === assignment.user_id) || null,
      }));
    },
  });

  const handleUnassign = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from("user_positions")
        .delete()
        .eq("id", assignmentId);

      if (error) throw error;

      toast.success("Usuário removido do cargo");
      queryClient.invalidateQueries({ queryKey: ["assigned-users", positionId] });
      queryClient.invalidateQueries({ queryKey: ["assigned-users-count", positionId] });
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover usuário");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  if (!assignedUsers || assignedUsers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nenhum usuário atribuído</CardTitle>
          <CardDescription>
            Atribua usuários para gerar automaticamente suas tarefas recorrentes
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {assignedUsers.map((assignment) => (
        <Card key={assignment.id}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>
                  {assignment.profile?.full_name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">
                  {assignment.profile?.full_name || "Usuário sem nome"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Atribuído em {formatDateBR(assignment.assigned_at)}
                </p>
              </div>
            </div>
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleUnassign(assignment.id)}
              >
                <UserMinus className="h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
