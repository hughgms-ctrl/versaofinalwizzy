import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/fluzz/components/ui/dialog";
import { Button } from "@/fluzz/components/ui/button";
import { Label } from "@/fluzz/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fluzz/components/ui/select";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { toast } from "sonner";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";

interface AssignUserDialogProps {
  positionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignUserDialog({ positionId, open, onOpenChange }: AssignUserDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();

  const { data: workspaceMembers, isLoading: isLoadingMembers } = useQuery({
    queryKey: ["workspace-members", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      
      // First fetch workspace members
      const { data: members, error: membersError } = await supabase
        .from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", workspace.id);
      
      if (membersError) {
        console.error("Error fetching workspace members:", membersError);
        throw membersError;
      }

      if (!members || members.length === 0) return [];

      // Then fetch profiles for those users
      const userIds = members.map(m => m.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      
      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
        throw profilesError;
      }

      // Combine the data
      const combined = members.map(member => ({
        user_id: member.user_id,
        role: member.role,
        profiles: profiles?.find(p => p.id === member.user_id)
      }));

      console.log("Workspace members loaded:", combined);
      return combined;
    },
    enabled: !!workspace,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Assign user to position
      const { error: assignError } = await supabase.from("user_positions").insert({
        user_id: selectedUserId,
        position_id: positionId,
        assigned_by: user.id,
      });

      if (assignError) throw assignError;

      // Call edge function to generate recurring tasks
      const { error: functionError } = await supabase.functions.invoke("generate-recurring-tasks", {
        body: { userId: selectedUserId, positionId },
      });

      if (functionError) throw functionError;

      toast.success("Usuário atribuído com sucesso! Tarefas recorrentes foram geradas.");
      queryClient.invalidateQueries({ queryKey: ["assigned-users", positionId] });
      queryClient.invalidateQueries({ queryKey: ["assigned-users-count", positionId] });
      setSelectedUserId("");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao atribuir usuário");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atribuir Usuário ao Cargo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user">Selecionar Usuário *</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId} required>
              <SelectTrigger id="user">
                <SelectValue placeholder={
                  isLoadingMembers 
                    ? "Carregando usuários..." 
                    : !workspaceMembers || workspaceMembers.length === 0
                    ? "Nenhum usuário disponível"
                    : "Escolha um usuário"
                } />
              </SelectTrigger>
              <SelectContent>
                {workspaceMembers && workspaceMembers.length > 0 ? (
                  workspaceMembers.map((member: any) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.profiles?.full_name || "Usuário sem nome"} ({member.role})
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    Nenhum membro no workspace
                  </div>
                )}
              </SelectContent>
            </Select>
            {!workspace && (
              <p className="text-xs text-destructive">
                Workspace não encontrado. Recarregue a página.
              </p>
            )}
            {workspace && workspaceMembers && workspaceMembers.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Convide membros para o workspace na seção "Equipe"
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !selectedUserId || isLoadingMembers || !workspaceMembers || workspaceMembers.length === 0}
            >
              {loading ? "Atribuindo..." : "Atribuir"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
