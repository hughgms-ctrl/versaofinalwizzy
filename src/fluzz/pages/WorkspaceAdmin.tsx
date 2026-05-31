import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { toast } from "sonner";
import { Users, Building2, UserPlus, Trash2 } from "lucide-react";
import { Badge } from "@/fluzz/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/fluzz/components/ui/alert-dialog";

export default function WorkspaceAdmin() {
  const { workspace, isAdmin } = useWorkspace();
  const queryClient = useQueryClient();
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'gestor' | 'membro'>('membro');

  const { data: members } = useQuery({
    queryKey: ["workspace-members", workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const { data, error } = await supabase
        .from("workspace_members")
        .select(`
          *,
          profiles:user_id (
            id,
            full_name
          )
        `)
        .eq("workspace_id", workspace.id);
      if (error) throw error;
      return data;
    },
    enabled: !!workspace,
  });

  const { data: allUsers } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const addMemberMutation = useMutation({
    mutationFn: async () => {
      if (!workspace) throw new Error("Workspace não encontrado");
      
      // Buscar usuário por email (via auth.users não é acessível diretamente)
      // Precisamos que o email seja de um usuário já cadastrado
      const selectedUser = allUsers?.find(u => newMemberEmail === u.id);
      
      if (!selectedUser) {
        toast.error("Usuário não encontrado. Certifique-se de que o usuário já está cadastrado no sistema.");
        return;
      }

      // Verificar se já é membro
      const { data: existing } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspace.id)
        .eq("user_id", selectedUser.id)
        .single();

      if (existing) {
        toast.error("Este usuário já é membro deste workspace");
        return;
      }

      const { error } = await supabase
        .from("workspace_members")
        .insert({
          workspace_id: workspace.id,
          user_id: selectedUser.id,
          role: newMemberRole,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
      toast.success("Membro adicionado com sucesso!");
      setNewMemberEmail("");
      setNewMemberRole('membro');
    },
    onError: (error: any) => {
      console.error("Erro ao adicionar membro:", error);
      toast.error("Erro ao adicionar membro");
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("workspace_members")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
      toast.success("Membro removido com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao remover membro");
    },
  });

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Administração do Workspace</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie membros e permissões do workspace {workspace?.name}
            </p>
          </div>
        </div>

        {/* Adicionar Membro */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Adicionar Novo Membro
            </CardTitle>
            <CardDescription>
              Adicione um usuário existente ao workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="user-select">Usuário</Label>
                <Select value={newMemberEmail} onValueChange={setNewMemberEmail}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers?.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name || "Sem nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Papel no Workspace</Label>
                <Select value={newMemberRole} onValueChange={(v: any) => setNewMemberRole(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="membro">Membro</SelectItem>
                    <SelectItem value="gestor">Gestor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  <strong>Membro:</strong> Acesso básico<br />
                  <strong>Gestor:</strong> Pode criar tarefas para outros<br />
                  <strong>Admin:</strong> Controle total
                </p>
              </div>
              <Button 
                onClick={() => addMemberMutation.mutate()} 
                disabled={!newMemberEmail || addMemberMutation.isPending}
                className="gap-2"
              >
                <UserPlus size={16} />
                {addMemberMutation.isPending ? "Adicionando..." : "Adicionar Membro"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Membros */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Membros do Workspace ({members?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {members?.map((member: any) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary">
                        {member.profiles?.full_name?.charAt(0).toUpperCase() || "U"}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{member.profiles?.full_name || "Sem nome"}</p>
                      <Badge variant={
                        member.role === 'admin' ? 'default' :
                        member.role === 'gestor' ? 'secondary' : 'outline'
                      }>
                        {member.role === 'admin' ? 'Admin' :
                         member.role === 'gestor' ? 'Gestor' : 'Membro'}
                      </Badge>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 size={16} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover Membro</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja remover {member.profiles?.full_name} do workspace?
                          Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => removeMemberMutation.mutate(member.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
