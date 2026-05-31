import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { AdminLayout } from "@/fluzz/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Badge } from "@/fluzz/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/fluzz/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Plus, Trash2, Shield, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useAdmin } from "@/fluzz/contexts/AdminContext";

interface AdminUser {
  id: string;
  user_id: string;
  role: "super_admin" | "admin" | "employee";
  created_at: string;
  profile?: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

const AdminTeam = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminUser | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "employee">("employee");
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isSuperAdmin } = useAdmin();

  const { data: admins, isLoading } = useQuery({
    queryKey: ["admin-team"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_users")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch profiles for each admin
      const adminsWithProfiles = await Promise.all(
        data.map(async (admin) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", admin.user_id)
            .single();
          return { ...admin, profile } as AdminUser;
        })
      );

      return adminsWithProfiles;
    },
  });

  const addAdminMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      // First, find user by email using edge function
      const { data: userData, error: userError } = await supabase.functions.invoke(
        "admin-get-user-by-email",
        { body: { email } }
      );

      if (userError || !userData?.userId) {
        throw new Error("Usuário não encontrado com este email");
      }

      // Check if already admin
      const { data: existing } = await supabase
        .from("admin_users")
        .select("id")
        .eq("user_id", userData.userId)
        .single();

      if (existing) {
        throw new Error("Este usuário já é um administrador");
      }

      // Add as admin
      const { error } = await supabase.from("admin_users").insert({
        user_id: userData.userId,
        role: role as "admin" | "employee" | "super_admin",
        created_by: user?.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Administrador adicionado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-team"] });
      setDialogOpen(false);
      setEmail("");
      setRole("employee");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao adicionar administrador");
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: "admin" | "employee" | "super_admin" }) => {
      const { error } = await supabase
        .from("admin_users")
        .update({ role })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Função atualizada com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-team"] });
    },
    onError: () => {
      toast.error("Erro ao atualizar função");
    },
  });

  const removeAdminMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("admin_users").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Administrador removido com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-team"] });
      setDeleteDialogOpen(false);
      setSelectedAdmin(null);
    },
    onError: () => {
      toast.error("Erro ao remover administrador");
    },
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "super_admin":
        return (
          <Badge className="bg-purple-500">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Super Admin
          </Badge>
        );
      case "admin":
        return (
          <Badge className="bg-blue-500">
            <Shield className="h-3 w-3 mr-1" />
            Admin
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <User className="h-3 w-3 mr-1" />
            Funcionário
          </Badge>
        );
    }
  };

  return (
    <AdminLayout
      title="Equipe Administrativa"
      description="Gerencie os administradores da plataforma"
    >
      {!isSuperAdmin && (
        <Card className="mb-6 border-amber-500/50 bg-amber-500/10">
          <CardContent className="p-4">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Apenas Super Admins podem adicionar ou remover administradores.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Administradores</CardTitle>
          {isSuperAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Admin
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar Administrador</DialogTitle>
                  <DialogDescription>
                    Adicione um novo membro à equipe administrativa. O usuário deve ter uma
                    conta na plataforma.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email do Usuário</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="usuario@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Função</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as "admin" | "employee")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">Funcionário</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Funcionários têm acesso de visualização. Admins podem gerenciar usuários.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => addAdminMutation.mutate({ email, role })}
                    disabled={!email || addAdminMutation.isPending}
                  >
                    Adicionar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Adicionado em</TableHead>
                  {isSuperAdmin && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins?.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={admin.profile?.avatar_url || undefined} />
                          <AvatarFallback>
                            {admin.profile?.full_name?.charAt(0) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {admin.profile?.full_name || "Sem nome"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ID: {admin.user_id.slice(0, 8)}...
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isSuperAdmin && admin.role !== "super_admin" ? (
                        <Select
                          value={admin.role}
                          onValueChange={(v: "admin" | "employee" | "super_admin") =>
                            updateRoleMutation.mutate({ id: admin.id, role: v })
                          }
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="employee">Funcionário</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        getRoleBadge(admin.role)
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(admin.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    {isSuperAdmin && (
                      <TableCell>
                        {admin.role !== "super_admin" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedAdmin(admin);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Administrador</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover "{selectedAdmin?.profile?.full_name}" da equipe
              administrativa? Ele perderá acesso ao painel admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => selectedAdmin && removeAdminMutation.mutate(selectedAdmin.id)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminTeam;
