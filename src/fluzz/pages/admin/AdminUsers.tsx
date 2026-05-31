import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AdminLayout } from "@/fluzz/components/admin/AdminLayout";
import { Card, CardContent, CardHeader } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Badge } from "@/fluzz/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { Checkbox } from "@/fluzz/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/fluzz/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/fluzz/components/ui/dropdown-menu";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/fluzz/components/ui/dialog";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { Label } from "@/fluzz/components/ui/label";
import { 
  Search, 
  MoreVertical, 
  Ban, 
  Trash2, 
  CreditCard,
  Building2,
  Users,
  Eye,
  RefreshCw,
  ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useAdminAudit } from "@/fluzz/hooks/useAdminAudit";

interface UserWithDetails {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  email?: string;
  status?: "active" | "blocked" | "deleted";
  can_access_subscriptions?: boolean;
  workspaces_count?: number;
  workspaces_owned?: number;
  total_members_in_owned_workspaces?: number;
}

const AdminUsers = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithDetails | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { logAction } = useAdminAudit();

  const { data: users, isLoading, refetch } = useQuery({
    queryKey: ["admin-users", search],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-get-users-stats", {
        body: { search },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return (data?.users || []) as UserWithDetails[];
    },
  });

  const blockUserMutation = useMutation({
    mutationFn: async ({ userId, reason, userEmail }: { userId: string; reason: string; userEmail?: string }) => {
      // First check if record exists
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
            blocked_by: currentUser?.id,
            blocked_reason: reason,
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
            blocked_by: currentUser?.id,
            blocked_reason: reason,
          });
        if (error) throw error;
      }

      // Log audit action
      await logAction({
        action: "user_blocked",
        targetType: "user",
        targetId: userId,
        targetEmail: userEmail,
        details: { reason },
      });
    },
    onSuccess: () => {
      toast.success("Usuário bloqueado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setBlockDialogOpen(false);
      setSelectedUser(null);
      setBlockReason("");
    },
    onError: () => {
      toast.error("Erro ao bloquear usuário");
    },
  });

  const unblockUserMutation = useMutation({
    mutationFn: async ({ userId, userEmail }: { userId: string; userEmail?: string }) => {
      const { error } = await supabase
        .from("user_account_management")
        .update({
          status: "active",
          blocked_at: null,
          blocked_by: null,
          blocked_reason: null,
        })
        .eq("user_id", userId);
      if (error) throw error;

      // Log audit action
      await logAction({
        action: "user_unblocked",
        targetType: "user",
        targetId: userId,
        targetEmail: userEmail,
      });
    },
    onSuccess: () => {
      toast.success("Usuário desbloqueado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => {
      toast.error("Erro ao desbloquear usuário");
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async ({ userId, userEmail }: { userId: string; userEmail?: string }) => {
      // Get user email first
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .single();

      if (!profileData) throw new Error("User not found");

      // Add to blocked emails
      const { data: authUser } = await supabase.functions.invoke("admin-get-user-email", {
        body: { userId },
      });

      const emailToBlock = userEmail || authUser?.email;

      if (emailToBlock) {
        await supabase.from("blocked_emails").insert({
          email: emailToBlock,
          blocked_by: currentUser?.id,
          blocked_reason: "Conta excluída permanentemente",
        });
      }

      // Mark as deleted in management table
      const { data: existing } = await supabase
        .from("user_account_management")
        .select("id")
        .eq("user_id", userId)
        .single();

      if (existing) {
        await supabase
          .from("user_account_management")
          .update({
            status: "deleted",
            deleted_at: new Date().toISOString(),
            deleted_by: currentUser?.id,
          })
          .eq("user_id", userId);
      } else {
        await supabase.from("user_account_management").insert({
          user_id: userId,
          status: "deleted",
          deleted_at: new Date().toISOString(),
          deleted_by: currentUser?.id,
        });
      }

      // Log audit action
      await logAction({
        action: "user_deleted",
        targetType: "user",
        targetId: userId,
        targetEmail: emailToBlock,
      });
    },
    onSuccess: () => {
      toast.success("Usuário excluído permanentemente");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setDeleteDialogOpen(false);
      setSelectedUser(null);
    },
    onError: () => {
      toast.error("Erro ao excluir usuário");
    },
  });

  const toggleSubscriptionAccessMutation = useMutation({
    mutationFn: async ({ userId, enable, userEmail }: { userId: string; enable: boolean; userEmail?: string }) => {
      const payload = {
        user_id: userId,
        can_access_subscriptions: enable,
        subscription_panel_enabled_at: enable ? new Date().toISOString() : null,
        subscription_panel_enabled_by: enable ? currentUser?.id : null,
      };

      const { error } = await supabase
        .from("user_account_management")
        .upsert(payload, { onConflict: "user_id" });

      if (error) throw error;

      // Log audit action
      await logAction({
        action: enable ? "subscription_access_enabled" : "subscription_access_disabled",
        targetType: "user",
        targetId: userId,
        targetEmail: userEmail,
      });
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.enable ? "Painel de assinaturas liberado" : "Painel de assinaturas bloqueado"
      );

      // Optimistic UI update for the current list
      queryClient.setQueryData<UserWithDetails[]>(["admin-users", search], (prev) => {
        if (!prev) return prev as any;
        return prev.map((u) =>
          u.id === variables.userId
            ? { ...u, can_access_subscriptions: variables.enable }
            : u
        );
      });

      queryClient.invalidateQueries({ queryKey: ["admin-users", search] });
    },
    onError: (error) => {
      console.error("Erro ao alterar acesso de assinaturas:", error);
      toast.error("Erro ao alterar acesso");
    },
  });

  const bulkSetSubscriptionsMutation = useMutation({
    mutationFn: async ({ userIds, enable }: { userIds: string[]; enable: boolean }) => {
      const rows = userIds.map((userId) => ({
        user_id: userId,
        can_access_subscriptions: enable,
        subscription_panel_enabled_at: enable ? new Date().toISOString() : null,
        subscription_panel_enabled_by: enable ? currentUser?.id : null,
      }));

      const { error } = await supabase
        .from("user_account_management")
        .upsert(rows, { onConflict: "user_id" });

      if (error) throw error;

      // Log audit actions for each user
      for (const userId of userIds) {
        await logAction({
          action: enable ? "subscription_access_enabled" : "subscription_access_disabled",
          targetType: "user",
          targetId: userId,
          details: { bulk_action: true, total_users: userIds.length },
        });
      }
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.enable
          ? `Painel de assinaturas liberado para ${variables.userIds.length} usuários`
          : `Painel de assinaturas bloqueado para ${variables.userIds.length} usuários`
      );

      // Optimistic UI update for the current list
      queryClient.setQueryData<UserWithDetails[]>(["admin-users", search], (prev) => {
        if (!prev) return prev as any;
        const set = new Set(variables.userIds);
        return prev.map((u) =>
          set.has(u.id) ? { ...u, can_access_subscriptions: variables.enable } : u
        );
      });

      queryClient.invalidateQueries({ queryKey: ["admin-users", search] });
      setSelectedUsers([]);
    },
    onError: (error) => {
      console.error("Erro ao alterar acesso em massa:", error);
      toast.error("Erro ao alterar acesso em massa");
    },
  });

  const toggleSelectUser = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedUsers.length === users?.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(users?.map((u) => u.id) || []);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "blocked":
        return <Badge variant="destructive">Bloqueado</Badge>;
      case "deleted":
        return <Badge variant="secondary">Excluído</Badge>;
      default:
        return <Badge variant="default" className="bg-green-500">Ativo</Badge>;
    }
  };

  return (
    <AdminLayout title="Gestão de Usuários" description="Gerencie todos os usuários da plataforma">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="flex-1 sm:flex-none">
              <RefreshCw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            {selectedUsers.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    disabled={bulkSetSubscriptionsMutation.isPending}
                    className="flex-1 sm:flex-none"
                  >
                    <CreditCard className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Assinaturas</span>
                    <span className="ml-1">({selectedUsers.length})</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      bulkSetSubscriptionsMutation.mutate({ userIds: selectedUsers, enable: true })
                    }
                  >
                    Liberar painel assinaturas
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      bulkSetSubscriptionsMutation.mutate({ userIds: selectedUsers, enable: false })
                    }
                  >
                    Bloquear painel assinaturas
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="block lg:hidden space-y-3">
                {users?.map((user) => (
                  <div
                    key={user.id}
                    className="p-4 rounded-lg border bg-card cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/tools/wizzy-flow/admin/users/${user.id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Checkbox
                          checked={selectedUsers.includes(user.id)}
                          onCheckedChange={() => toggleSelectUser(user.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback>
                            {user.full_name?.charAt(0) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{user.full_name || "Sem nome"}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {getStatusBadge(user.status || "active")}
                            {user.can_access_subscriptions && (
                              <Badge className="bg-green-500 text-xs">Assin.</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground pl-[52px]">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {user.workspaces_owned}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {user.total_members_in_owned_workspaces || 0}
                      </span>
                      <span>
                        {format(new Date(user.created_at), "dd/MM/yy", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedUsers.length === users?.length && users?.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Workspaces</TableHead>
                      <TableHead>Assinaturas</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users?.map((user) => (
                      <TableRow 
                        key={user.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/tools/wizzy-flow/admin/users/${user.id}`)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedUsers.includes(user.id)}
                            onCheckedChange={() => toggleSelectUser(user.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={user.avatar_url || undefined} />
                              <AvatarFallback>
                                {user.full_name?.charAt(0) || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{user.full_name || "Sem nome"}</p>
                              <p className="text-xs text-muted-foreground">
                                ID: {user.id.slice(0, 8)}...
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(user.status || "active")}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span>{user.workspaces_owned} próprios</span>
                            <Users className="h-4 w-4 text-muted-foreground ml-2" />
                            <span>{user.total_members_in_owned_workspaces || 0} membros</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.can_access_subscriptions ? (
                            <Badge className="bg-green-500">Liberado</Badge>
                          ) : (
                            <Badge variant="secondary">Bloqueado</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {format(new Date(user.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => navigate(`/tools/wizzy-flow/admin/users/${user.id}`)}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Ver detalhes
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  toggleSubscriptionAccessMutation.mutate({
                                    userId: user.id,
                                    enable: !user.can_access_subscriptions,
                                    userEmail: user.email,
                                  })
                                }
                              >
                                <CreditCard className="h-4 w-4 mr-2" />
                                {user.can_access_subscriptions
                                  ? "Bloquear painel assinaturas"
                                  : "Liberar painel assinaturas"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {user.status === "blocked" ? (
                                <DropdownMenuItem
                                  onClick={() => unblockUserMutation.mutate({ userId: user.id, userEmail: user.email })}
                                >
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Desbloquear
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setBlockDialogOpen(true);
                                  }}
                                >
                                  <Ban className="h-4 w-4 mr-2" />
                                  Bloquear acesso
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  setSelectedUser(user);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir permanentemente
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Block User Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear Usuário</DialogTitle>
            <DialogDescription>
              O usuário será desconectado imediatamente e não poderá mais acessar a plataforma.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Usuário</Label>
              <p className="text-sm text-muted-foreground">
                {selectedUser?.full_name || "Sem nome"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-reason">Motivo do bloqueio</Label>
              <Textarea
                id="block-reason"
                placeholder="Descreva o motivo do bloqueio..."
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
              onClick={() =>
                selectedUser &&
                blockUserMutation.mutate({ userId: selectedUser.id, reason: blockReason, userEmail: selectedUser.email })
              }
              disabled={blockUserMutation.isPending}
            >
              Bloquear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário Permanentemente</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O usuário será excluído e o email será bloqueado
              para impedir a criação de uma nova conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => selectedUser && deleteUserMutation.mutate({ userId: selectedUser.id, userEmail: selectedUser.email })}
            >
              Excluir Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminUsers;
