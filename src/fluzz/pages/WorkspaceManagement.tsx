import { useState } from "react";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Badge } from "@/fluzz/components/ui/badge";
import { Input } from "@/fluzz/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/fluzz/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/fluzz/components/ui/dialog";
import { Building2, Crown, Trash2, Archive, Users, Pencil } from "lucide-react";
import { toast } from "sonner";

interface WorkspaceWithDetails {
  id: string;
  name: string;
  created_at: string;
  created_by: string | null;
  role: string;
  member_count: number;
  is_owner: boolean;
}

export default function WorkspaceManagement() {
  const { user } = useAuth();
  const { workspace: currentWorkspace, refetchWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [editingWorkspace, setEditingWorkspace] = useState<WorkspaceWithDetails | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ["workspace-management", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get all workspace memberships
      const { data: memberships, error: memberError } = await supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", user.id);

      if (memberError) throw memberError;

      if (!memberships || memberships.length === 0) return [];

      // Get workspace details
      const workspaceIds = memberships.map((m) => m.workspace_id);
      const { data: workspacesData, error: workspaceError } = await supabase
        .from("workspaces")
        .select("*")
        .in("id", workspaceIds);

      if (workspaceError) throw workspaceError;

      // Get member counts for each workspace
      const { data: memberCounts, error: countError } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .in("workspace_id", workspaceIds);

      if (countError) throw countError;

      // Count members per workspace
      const counts = memberCounts?.reduce((acc, member) => {
        acc[member.workspace_id] = (acc[member.workspace_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Merge data
      const result = workspacesData?.map((workspace) => {
        const membership = memberships.find((m) => m.workspace_id === workspace.id);
        return {
          ...workspace,
          role: membership?.role || "membro",
          member_count: counts?.[workspace.id] || 0,
          is_owner: workspace.created_by === user.id,
        };
      }) || [];

      return result as WorkspaceWithDetails[];
    },
    enabled: !!user?.id,
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      // Only owners can delete workspaces
      const workspace = workspaces?.find((w) => w.id === workspaceId);
      if (!workspace?.is_owner) {
        throw new Error("Apenas o proprietário pode excluir o workspace");
      }

      const { error } = await supabase
        .from("workspaces")
        .delete()
        .eq("id", workspaceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-management"] });
      refetchWorkspace();
      toast.success("Workspace excluído com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir workspace");
    },
  });

  const leaveWorkspaceMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const { error } = await supabase
        .from("workspace_members")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("user_id", user!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-management"] });
      refetchWorkspace();
      toast.success("Você saiu do workspace!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao sair do workspace");
    },
  });

  const renameWorkspaceMutation = useMutation({
    mutationFn: async ({ workspaceId, name }: { workspaceId: string; name: string }) => {
      const { error } = await supabase
        .from("workspaces")
        .update({ name })
        .eq("id", workspaceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-management"] });
      refetchWorkspace();
      setEditingWorkspace(null);
      setNewWorkspaceName("");
      toast.success("Nome do workspace atualizado!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao renomear workspace");
    },
  });

  const handleEditClick = (workspace: WorkspaceWithDetails) => {
    setEditingWorkspace(workspace);
    setNewWorkspaceName(workspace.name);
  };

  const handleSaveRename = () => {
    if (!editingWorkspace || !newWorkspaceName.trim()) return;
    renameWorkspaceMutation.mutate({
      workspaceId: editingWorkspace.id,
      name: newWorkspaceName.trim(),
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando workspaces...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Meus Workspaces</h1>
          <p className="text-muted-foreground mt-2">
            Gerencie todos os workspaces dos quais você faz parte
          </p>
        </div>

        {workspaces && workspaces.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Você ainda não faz parte de nenhum workspace</p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {workspaces?.map((workspace) => (
            <Card key={workspace.id} className={workspace.id === currentWorkspace?.id ? "border-primary" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        {workspace.name}
                      </CardTitle>
                      {workspace.id === currentWorkspace?.id && (
                        <Badge variant="default">Ativo</Badge>
                      )}
                      {workspace.is_owner && (
                        <Badge variant="secondary" className="gap-1">
                          <Crown className="h-3 w-3" />
                          Proprietário
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {workspace.role === "admin" ? "Administrador" : workspace.role === "gestor" ? "Gestor" : "Membro"}
                      </Badge>
                      {(workspace.is_owner || workspace.role === "admin") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleEditClick(workspace)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <CardDescription className="mt-2 flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {workspace.member_count} {workspace.member_count === 1 ? "membro" : "membros"}
                      </span>
                      <span className="text-xs">
                        Criado em {new Date(workspace.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  {workspace.is_owner ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" className="gap-2">
                          <Trash2 className="h-4 w-4" />
                          Excluir Workspace
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir Workspace</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja excluir o workspace "{workspace.name}"?
                            Esta ação é permanente e todos os dados associados (projetos, tarefas, etc.) serão perdidos.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteWorkspaceMutation.mutate(workspace.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Archive className="h-4 w-4" />
                          Sair do Workspace
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Sair do Workspace</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja sair do workspace "{workspace.name}"?
                            Você perderá acesso a todos os projetos e tarefas deste workspace.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => leaveWorkspaceMutation.mutate(workspace.id)}
                          >
                            Sair
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Rename Dialog */}
        <Dialog open={!!editingWorkspace} onOpenChange={(open) => !open && setEditingWorkspace(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Renomear Workspace</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder="Nome do workspace"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingWorkspace(null)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSaveRename}
                disabled={!newWorkspaceName.trim() || renameWorkspaceMutation.isPending}
              >
                {renameWorkspaceMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
