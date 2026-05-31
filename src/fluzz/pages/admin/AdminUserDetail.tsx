import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AdminLayout } from "@/fluzz/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Badge } from "@/fluzz/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/fluzz/components/ui/tabs";
import { Label } from "@/fluzz/components/ui/label";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { Skeleton } from "@/fluzz/components/ui/skeleton";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/fluzz/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/fluzz/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
import { 
  ArrowLeft, 
  Building2, 
  Users, 
  CreditCard, 
  Key,
  Ban,
  Trash2,
  Plus,
  Shield,
  Mail,
  Calendar,
  Clock,
  RefreshCw,
  UserPlus
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AdminUserWorkspaces } from "@/fluzz/components/admin/AdminUserWorkspaces";
import { AdminUserSubscription } from "@/fluzz/components/admin/AdminUserSubscription";

const AdminUserDetail = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");

  const { data: userDetails, isLoading } = useQuery({
    queryKey: ["admin-user-detail", userId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-get-user-details", {
        body: { userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    enabled: !!userId,
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-reset-user-password", {
        body: { userId, newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Senha alterada com sucesso");
      setPasswordDialogOpen(false);
      setNewPassword("");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao alterar senha");
    },
  });

  const createWorkspaceMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-create-workspace-for-user", {
        body: { userId, workspaceName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Workspace criado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
      setWorkspaceDialogOpen(false);
      setWorkspaceName("");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao criar workspace");
    },
  });

  const blockUserMutation = useMutation({
    mutationFn: async () => {
      const { data: existing } = await supabase
        .from("user_account_management")
        .select("id")
        .eq("user_id", userId)
        .single();

      if (existing) {
        const { error } = await supabase
          .from("user_account_management")
          .update({
            status: "blocked",
            blocked_at: new Date().toISOString(),
            blocked_reason: blockReason,
          })
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_account_management")
          .insert({
            user_id: userId,
            status: "blocked",
            blocked_at: new Date().toISOString(),
            blocked_reason: blockReason,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Usuário bloqueado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
      setBlockDialogOpen(false);
      setBlockReason("");
    },
    onError: () => {
      toast.error("Erro ao bloquear usuário");
    },
  });

  const unblockUserMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("user_account_management")
        .update({
          status: "active",
          blocked_at: null,
          blocked_reason: null,
        })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Usuário desbloqueado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
    },
    onError: () => {
      toast.error("Erro ao desbloquear usuário");
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "blocked":
        return <Badge variant="destructive">Bloqueado</Badge>;
      case "deleted":
        return <Badge variant="secondary">Excluído</Badge>;
      default:
        return <Badge className="bg-green-500">Ativo</Badge>;
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Carregando..." description="Carregando detalhes do usuário">
        <div className="space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!userDetails) {
    return (
      <AdminLayout title="Usuário não encontrado" description="O usuário solicitado não foi encontrado">
        <Button variant="outline" onClick={() => navigate("/tools/wizzy-flow/admin/users")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </AdminLayout>
    );
  }

  const { profile, accountManagement, ownedWorkspaces, memberWorkspaces, subscription } = userDetails;
  const status = accountManagement?.status || "active";
  const isBlocked = status === "blocked";

  return (
    <AdminLayout 
      title={profile?.full_name || "Usuário"} 
      description="Detalhes e gerenciamento do usuário"
    >
      <div className="space-y-6">
        {/* Header with back button */}
        <Button variant="outline" onClick={() => navigate("/tools/wizzy-flow/admin/users")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Usuários
        </Button>

        {/* User Profile Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row md:items-start gap-6">
              <Avatar className="h-20 w-20 mx-auto md:mx-0">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-2xl">
                  {profile?.full_name?.charAt(0) || "?"}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 text-center md:text-left space-y-4">
                <div>
                  <h2 className="text-2xl font-bold">{profile?.full_name || "Sem nome"}</h2>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-2">
                    {getStatusBadge(status)}
                    {accountManagement?.can_access_subscriptions && (
                      <Badge variant="outline" className="border-green-500 text-green-600">
                        <CreditCard className="h-3 w-3 mr-1" />
                        Assinaturas
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{profile?.email || "Email não disponível"}</span>
                  </div>
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Criado em {profile?.created_at ? format(new Date(profile.created_at), "dd/MM/yyyy", { locale: ptBR }) : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Último login: {profile?.last_sign_in_at ? format(new Date(profile.last_sign_in_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "Nunca"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{ownedWorkspaces?.length || 0} workspaces</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap justify-center md:justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPasswordDialogOpen(true)}
                >
                  <Key className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Redefinir Senha</span>
                  <span className="sm:hidden">Senha</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWorkspaceDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Criar Workspace</span>
                  <span className="sm:hidden">Workspace</span>
                </Button>
                {isBlocked ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => unblockUserMutation.mutate()}
                    disabled={unblockUserMutation.isPending}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Desbloquear
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setBlockDialogOpen(true)}
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Bloquear
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for different sections */}
        <Tabs defaultValue="workspaces" className="w-full">
          <TabsList className="w-full flex flex-wrap h-auto gap-1">
            <TabsTrigger value="workspaces" className="flex-1 min-w-[120px]">
              <Building2 className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Workspaces</span>
            </TabsTrigger>
            <TabsTrigger value="subscription" className="flex-1 min-w-[120px]">
              <CreditCard className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Assinatura</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workspaces" className="mt-6">
            <AdminUserWorkspaces 
              userId={userId!}
              ownedWorkspaces={ownedWorkspaces || []}
              memberWorkspaces={memberWorkspaces || []}
              memberBlocks={userDetails.memberBlocks || []}
            />
          </TabsContent>

          <TabsContent value="subscription" className="mt-6">
            <AdminUserSubscription 
              userId={userId!}
              subscription={subscription}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Reset Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir Senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para o usuário. Ele poderá alterá-la depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => resetPasswordMutation.mutate()}
              disabled={resetPasswordMutation.isPending || newPassword.length < 6}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Workspace Dialog */}
      <Dialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Workspace</DialogTitle>
            <DialogDescription>
              Crie um novo workspace para o usuário. Ele será automaticamente o administrador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workspace-name">Nome do Workspace</Label>
              <Input
                id="workspace-name"
                placeholder="Ex: Minha Empresa"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkspaceDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createWorkspaceMutation.mutate()}
              disabled={createWorkspaceMutation.isPending || !workspaceName.trim()}
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block User Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear Usuário</DialogTitle>
            <DialogDescription>
              O usuário será desconectado e não poderá mais acessar a plataforma.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="block-reason">Motivo do bloqueio (opcional)</Label>
              <Textarea
                id="block-reason"
                placeholder="Descreva o motivo..."
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => blockUserMutation.mutate()}
              disabled={blockUserMutation.isPending}
            >
              Bloquear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminUserDetail;
