import { AppLayout } from "@/fluzz/components/layout/AppLayout";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/fluzz/components/ui/card";
import { Badge } from "@/fluzz/components/ui/badge";
import { Avatar, AvatarFallback } from "@/fluzz/components/ui/avatar";
import { Checkbox } from "@/fluzz/components/ui/checkbox";
import { Button } from "@/fluzz/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/fluzz/components/ui/select";
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
import { toast } from "sonner";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";

interface WorkspaceMemberWithProfile {
  id: string;
  user_id: string;
  role: string;
  profiles: {
    full_name: string | null;
  } | null;
}

interface UserPermissions {
  id: string;
  user_id: string;
  can_view_projects: boolean;
  can_view_tasks: boolean;
  can_view_positions: boolean;
  can_view_analytics: boolean;
  can_view_briefings: boolean;
  can_view_culture: boolean;
  can_view_vision: boolean;
  can_view_processes: boolean;
  can_view_inventory: boolean;
  can_view_ai: boolean;
  can_view_workload: boolean;
  can_view_flows: boolean;
  can_view_notes: boolean;
  can_edit_projects: boolean;
  can_edit_tasks: boolean;
  can_edit_positions: boolean;
  can_edit_analytics: boolean;
  can_edit_briefings: boolean;
  can_edit_culture: boolean;
  can_edit_vision: boolean;
  can_edit_processes: boolean;
  can_edit_inventory: boolean;
  can_edit_flows: boolean;
  can_edit_notes: boolean;
  projects_only_assigned: boolean;
}

type PermissionKey = keyof Omit<UserPermissions, "id" | "user_id" | "workspace_id" | "created_at" | "updated_at">;

interface PermissionConfig {
  key: string;
  label: string;
  viewKey?: PermissionKey;
  editKey?: PermissionKey;
  viewOnly?: boolean;
}

const permissionConfigs: PermissionConfig[] = [
  { key: "projects", label: "Projetos", viewKey: "can_view_projects", editKey: "can_edit_projects" },
  { key: "tasks", label: "Tarefas", viewKey: "can_view_tasks", editKey: "can_edit_tasks" },
  { key: "positions", label: "Setores", viewKey: "can_view_positions", editKey: "can_edit_positions" },
  { key: "analytics", label: "Analytics", viewKey: "can_view_analytics", editKey: "can_edit_analytics" },
  { key: "briefings", label: "Briefings", viewKey: "can_view_briefings", editKey: "can_edit_briefings" },
  { key: "culture", label: "Cultura", viewKey: "can_view_culture", editKey: "can_edit_culture" },
  { key: "vision", label: "Visão", viewKey: "can_view_vision", editKey: "can_edit_vision" },
  { key: "processes", label: "POP's", viewKey: "can_view_processes", editKey: "can_edit_processes" },
  { key: "flows", label: "Fluxos", viewKey: "can_view_flows", editKey: "can_edit_flows" },
  { key: "notes", label: "Notas", viewKey: "can_view_notes", editKey: "can_edit_notes" },
  { key: "inventory", label: "Inventário", viewKey: "can_view_inventory", editKey: "can_edit_inventory" },
  { key: "ai", label: "Fluzz AI", viewKey: "can_view_ai", viewOnly: true },
  { key: "workload", label: "Workload View", viewKey: "can_view_workload", viewOnly: true },
];

export default function TeamMemberPermissions() {
  const { userId } = useParams<{ userId: string }>();
  const { workspace, isAdmin, isGestor } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: member, isLoading: memberLoading } = useQuery({
    queryKey: ["team-member", workspace?.id, userId],
    queryFn: async () => {
      if (!workspace?.id || !userId) return null;
      
      const { data: membersData, error: membersError } = await supabase
        .from("workspace_members")
        .select("id, user_id, role")
        .eq("workspace_id", workspace.id)
        .eq("user_id", userId)
        .single();

      if (membersError) throw membersError;

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", userId)
        .single();

      return {
        ...membersData,
        profiles: profileData
      } as WorkspaceMemberWithProfile;
    },
    enabled: !!workspace?.id && !!userId,
  });

  // Check if member is the workspace creator
  const { data: workspaceData } = useQuery({
    queryKey: ["workspace-creator", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return null;
      const { data } = await supabase
        .from("workspaces")
        .select("created_by")
        .eq("id", workspace.id)
        .single();
      return data;
    },
    enabled: !!workspace?.id,
  });

  const isWorkspaceCreator = workspaceData?.created_by === userId;

  const { data: permissions } = useQuery({
    queryKey: ["user-permissions", workspace?.id, userId],
    queryFn: async () => {
      if (!workspace?.id || !userId) return null;
      
      const { data, error } = await supabase
        .from("user_permissions")
        .select("*")
        .eq("workspace_id", workspace.id)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      return data as UserPermissions | null;
    },
    enabled: !!workspace?.id && !!userId,
  });

  const updatePermissionMutation = useMutation({
    mutationFn: async ({
      permission,
      value,
    }: {
      permission: PermissionKey;
      value: boolean;
    }) => {
      const { error } = await supabase
        .from("user_permissions")
        .update({ [permission]: value })
        .eq("user_id", userId!)
        .eq("workspace_id", workspace!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-permissions"] });
      toast.success("Permissão atualizada");
    },
    onError: () => {
      toast.error("Erro ao atualizar permissão");
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (newRole: "admin" | "gestor" | "membro") => {
      if (isWorkspaceCreator) {
        throw new Error("O criador do workspace não pode ter seu cargo alterado");
      }
      const { error } = await supabase
        .from("workspace_members")
        .update({ role: newRole })
        .eq("user_id", userId!)
        .eq("workspace_id", workspace!.id);

      if (error) throw error;

      // Only when changing role to admin, set all permissions to true in the database
      // Gestor keeps whatever permissions were set by the admin
      if (newRole === "admin") {
        const allPermissionsTrue = {
          can_view_projects: true,
          can_view_tasks: true,
          can_view_positions: true,
          can_view_analytics: true,
          can_view_briefings: true,
          can_view_culture: true,
          can_view_vision: true,
          can_view_processes: true,
          can_view_inventory: true,
          can_view_ai: true,
          can_view_workload: true,
          can_view_flows: true,
          can_view_notes: true,
          can_edit_projects: true,
          can_edit_tasks: true,
          can_edit_positions: true,
          can_edit_analytics: true,
          can_edit_briefings: true,
          can_edit_culture: true,
          can_edit_vision: true,
          can_edit_processes: true,
          can_edit_inventory: true,
          can_edit_flows: true,
          can_edit_notes: true,
          projects_only_assigned: false,
        };

        await supabase
          .from("user_permissions")
          .update(allPermissionsTrue)
          .eq("user_id", userId!)
          .eq("workspace_id", workspace!.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-member"] });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      queryClient.invalidateQueries({ queryKey: ["user-permissions"] });
      toast.success("Função atualizada com sucesso");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao atualizar função");
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async () => {
      if (isWorkspaceCreator) {
        throw new Error("O criador do workspace não pode ser removido");
      }
      await supabase
        .from("user_permissions")
        .delete()
        .eq("user_id", userId!)
        .eq("workspace_id", workspace!.id);

      const { error } = await supabase
        .from("workspace_members")
        .delete()
        .eq("user_id", userId!)
        .eq("workspace_id", workspace!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Membro removido com sucesso");
      navigate("/tools/wizzy-flow/team");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao remover membro");
    },
  });

  const handleViewChange = (config: PermissionConfig, checked: boolean) => {
    if (!config.viewKey) return;
    updatePermissionMutation.mutate({ permission: config.viewKey, value: checked });
    // If unchecking view, also uncheck edit (only if editKey exists)
    if (!checked && config.editKey) {
      updatePermissionMutation.mutate({ permission: config.editKey, value: false });
    }
  };

  const handleEditChange = (config: PermissionConfig, checked: boolean) => {
    if (!config.editKey) return;
    updatePermissionMutation.mutate({ permission: config.editKey, value: checked });
    // If checking edit, also check view
    if (checked && config.viewKey) {
      updatePermissionMutation.mutate({ permission: config.viewKey, value: true });
    }
  };

  const isCurrentUser = user?.id === userId;
  const canModifyRole = !isCurrentUser && !isWorkspaceCreator;
  const canRemoveMember = !isCurrentUser && !isWorkspaceCreator;
  // Admins can edit their own permissions (self-visibility settings)
  const canEditOwnPermissions = isCurrentUser && member?.role === "admin";

  // Only admin and gestor can access this page
  if (!isAdmin && !isGestor) {
    return <Navigate to="/tools/wizzy-flow/home" replace />;
  }

  if (memberLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!member) {
    return <Navigate to="/tools/wizzy-flow/team" replace />;
  }

  const initials = member.profiles?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "?";

  const getViewValue = (config: PermissionConfig): boolean => {
    // For admin viewing themselves, use stored permissions or default to true
    if (member.role === "admin" && canEditOwnPermissions) {
      if (!config.viewKey) return true;
      return permissions?.[config.viewKey] ?? true;
    }
    if (member.role === "admin") return true;
    if (!config.viewKey) return false;
    return Boolean(permissions?.[config.viewKey] ?? false);
  };

  const getEditValue = (config: PermissionConfig): boolean => {
    // For admin viewing themselves, use stored permissions or default to true
    if (member.role === "admin" && canEditOwnPermissions) {
      if (!config.editKey) return true;
      return permissions?.[config.editKey] ?? true;
    }
    if (member.role === "admin") return true;
    if (!config.editKey) return false;
    return Boolean(permissions?.[config.editKey] ?? false);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/tools/wizzy-flow/team")}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para equipe
          </Button>
          <h1 className="text-3xl font-bold text-foreground">Gerenciar Permissões</h1>
          <p className="text-muted-foreground mt-2">
            Configure as permissões de acesso do membro
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-xl">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <CardTitle className="text-2xl">
                  {member.profiles?.full_name || "Usuário"}
                </CardTitle>
                <CardDescription className="mt-2 flex items-center gap-2 flex-wrap">
                  <Select 
                    value={member.role} 
                    onValueChange={(value) => updateRoleMutation.mutate(value as "admin" | "gestor" | "membro")}
                    disabled={!canModifyRole}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="gestor">Gestor</SelectItem>
                      <SelectItem value="membro">Membro</SelectItem>
                    </SelectContent>
                  </Select>
                  {isCurrentUser && (
                    <span className="text-xs text-muted-foreground">(você)</span>
                  )}
                  {isWorkspaceCreator && (
                    <Badge variant="outline" className="text-xs border-primary text-primary">
                      Criador do Workspace
                    </Badge>
                  )}
                </CardDescription>
              </div>
              {canRemoveMember && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="icon">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover membro</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja remover {member.profiles?.full_name || "este membro"} do workspace? Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => deleteMemberMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Remover
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-foreground mb-4">Permissões de Acesso</h3>
                {member.role === "admin" && !isCurrentUser && (
                  <p className="text-sm text-muted-foreground mb-4">
                    Administradores têm acesso total a todas as áreas da plataforma.
                  </p>
                )}
                {canEditOwnPermissions && (
                  <p className="text-sm text-muted-foreground mb-4">
                    Como administrador, você pode personalizar quais áreas deseja visualizar.
                  </p>
                )}
                
                {/* Header */}
                <div className="grid grid-cols-[1fr_80px_80px] gap-4 mb-2 px-4">
                  <div className="text-sm font-medium text-muted-foreground">Permissão para:</div>
                  <div className="text-sm font-medium text-muted-foreground text-center">Visualizar</div>
                  <div className="text-sm font-medium text-muted-foreground text-center">Editar</div>
                </div>

                {/* Permission rows */}
                <div className="space-y-2">
                  {permissionConfigs.map((config) => (
                    <div key={config.key}>
                      <div className="grid grid-cols-[1fr_80px_80px] gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors items-center">
                        <div className="text-base font-normal">{config.label}</div>
                        <div className="flex justify-center">
                        {config.viewKey && (
                            <Checkbox
                              id={`view-${config.key}`}
                              checked={getViewValue(config)}
                              onCheckedChange={(checked) => handleViewChange(config, checked === true)}
                              disabled={member.role === "admin" && !canEditOwnPermissions}
                            />
                          )}
                        </div>
                        <div className="flex justify-center">
                          {!config.viewOnly && config.editKey && (
                            <Checkbox
                              id={`edit-${config.key}`}
                              checked={getEditValue(config)}
                              onCheckedChange={(checked) => handleEditChange(config, checked === true)}
                              disabled={member.role === "admin" && !canEditOwnPermissions}
                            />
                          )}
                        </div>
                      </div>
                      {/* Sub-option for projects: only see assigned projects */}
                      {config.key === "projects" && getViewValue(config) && (
                        <div className="ml-6 mt-1 mb-1 pl-4 border-l-2 border-muted">
                          <label className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-accent/30 transition-colors cursor-pointer">
                            <Checkbox
                              id="projects_only_assigned"
                              checked={Boolean(permissions?.projects_only_assigned)}
                              onCheckedChange={(checked) => 
                                updatePermissionMutation.mutate({ 
                                  permission: "projects_only_assigned" as PermissionKey, 
                                  value: checked === true 
                                })
                              }
                              disabled={member.role === "admin" && !canEditOwnPermissions}
                            />
                            <span className="text-sm text-muted-foreground">
                              Ver apenas projetos em que participa
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}