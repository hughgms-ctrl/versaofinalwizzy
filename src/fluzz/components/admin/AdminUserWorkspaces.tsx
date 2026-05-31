import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/fluzz/components/ui/card";
import { Button } from "@/fluzz/components/ui/button";
import { Badge } from "@/fluzz/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/fluzz/components/ui/avatar";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Textarea } from "@/fluzz/components/ui/textarea";
import { Checkbox } from "@/fluzz/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/fluzz/components/ui/accordion";
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
  Building2, 
  Users, 
  Ban, 
  Shield,
  UserMinus,
  RefreshCw,
  Crown,
  Trash2,
  AlertTriangle,
  Eye
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAdminView } from "@/fluzz/contexts/AdminViewContext";

interface WorkspaceMember {
  id: string;
  user_id: string;
  role: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface OwnedWorkspace {
  id: string;
  name: string;
  created_at: string;
  workspace_members: WorkspaceMember[];
}

interface MemberWorkspace {
  id: string;
  role: string;
  isOwned?: boolean;
  workspace: {
    id: string;
    name: string;
    created_by: string;
    created_at: string;
  } | null;
  workspace_members?: WorkspaceMember[];
}

interface MemberBlock {
  id: string;
  workspace_id: string;
  user_id: string;
  blocked_reason: string | null;
}

interface AdminUserWorkspacesProps {
  userId: string;
  ownedWorkspaces: OwnedWorkspace[];
  memberWorkspaces: MemberWorkspace[];
  memberBlocks: MemberBlock[];
}

interface PermissionsState {
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
  can_edit_projects: boolean;
  can_edit_tasks: boolean;
  can_edit_positions: boolean;
  can_edit_analytics: boolean;
  can_edit_briefings: boolean;
  can_edit_culture: boolean;
  can_edit_vision: boolean;
  can_edit_processes: boolean;
  can_edit_inventory: boolean;
}

const defaultPermissions: PermissionsState = {
  can_view_projects: true,
  can_view_tasks: true,
  can_view_positions: true,
  can_view_analytics: true,
  can_view_briefings: true,
  can_view_culture: true,
  can_view_vision: true,
  can_view_processes: true,
  can_view_inventory: false,
  can_view_ai: false,
  can_view_workload: false,
  can_edit_projects: false,
  can_edit_tasks: false,
  can_edit_positions: false,
  can_edit_analytics: false,
  can_edit_briefings: false,
  can_edit_culture: false,
  can_edit_vision: false,
  can_edit_processes: false,
  can_edit_inventory: false,
};

export const AdminUserWorkspaces = ({
  userId,
  ownedWorkspaces,
  memberWorkspaces,
  memberBlocks,
}: AdminUserWorkspacesProps) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { navigateToWorkspace, isLoading: isStartingSession } = useAdminView();
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"block" | "permissions" | "role" | "remove">("block");
  const [blockReason, setBlockReason] = useState("");
  const [newRole, setNewRole] = useState("membro");
  const [permissions, setPermissions] = useState<PermissionsState>(defaultPermissions);
  const [deleteWorkspaceDialogOpen, setDeleteWorkspaceDialogOpen] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<OwnedWorkspace | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [accessConfirmDialogOpen, setAccessConfirmDialogOpen] = useState(false);
  const [workspaceToAccess, setWorkspaceToAccess] = useState<{ id: string; name: string } | null>(null);

  const handleAccessWorkspace = async () => {
    if (!workspaceToAccess) return;
    
    try {
      toast.success(`Acessando workspace "${workspaceToAccess.name}" como administrador`);
      await navigateToWorkspace(workspaceToAccess.id, workspaceToAccess.name);
    } catch (error) {
      console.error("Erro ao iniciar sessão admin:", error);
      toast.error("Erro ao acessar workspace");
      setAccessConfirmDialogOpen(false);
      setWorkspaceToAccess(null);
    }
  };

  const openAccessDialog = (workspaceId: string, workspaceName: string) => {
    setWorkspaceToAccess({ id: workspaceId, name: workspaceName });
    setAccessConfirmDialogOpen(true);
  };

  const manageMemberMutation = useMutation({
    mutationFn: async (params: { action: string; workspaceId: string; targetUserId: string; role?: string; reason?: string; permissions?: PermissionsState }) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-workspace-member", {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Ação realizada com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
      setActionDialogOpen(false);
      resetDialogState();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao executar ação");
    },
  });

  const resetDialogState = () => {
    setSelectedMember(null);
    setSelectedWorkspaceId(null);
    setBlockReason("");
    setNewRole("membro");
    setPermissions(defaultPermissions);
  };

  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-delete-workspace", {
        body: { workspaceId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Workspace excluído com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
      setDeleteWorkspaceDialogOpen(false);
      setWorkspaceToDelete(null);
      setDeleteConfirmText("");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao excluir workspace");
    },
  });

  const openActionDialog = (
    member: WorkspaceMember, 
    workspaceId: string, 
    action: "block" | "permissions" | "role" | "remove"
  ) => {
    setSelectedMember(member);
    setSelectedWorkspaceId(workspaceId);
    setActionType(action);
    setNewRole(member.role);
    setActionDialogOpen(true);
  };

  const handleAction = () => {
    if (!selectedMember || !selectedWorkspaceId) return;

    const baseParams = {
      workspaceId: selectedWorkspaceId,
      targetUserId: selectedMember.user_id,
    };

    switch (actionType) {
      case "block":
        manageMemberMutation.mutate({
          ...baseParams,
          action: "block",
          reason: blockReason,
        });
        break;
      case "role":
        manageMemberMutation.mutate({
          ...baseParams,
          action: "update_role",
          role: newRole,
        });
        break;
      case "permissions":
        manageMemberMutation.mutate({
          ...baseParams,
          action: "update_permissions",
          permissions,
        });
        break;
      case "remove":
        manageMemberMutation.mutate({
          ...baseParams,
          action: "remove",
        });
        break;
    }
  };

  const unblockMember = (workspaceId: string, targetUserId: string) => {
    manageMemberMutation.mutate({
      action: "unblock",
      workspaceId,
      targetUserId,
    });
  };

  const isMemberBlocked = (workspaceId: string, memberId: string) => {
    return memberBlocks.some(b => b.workspace_id === workspaceId && b.user_id === memberId);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-purple-500"><Crown className="h-3 w-3 mr-1" />Admin</Badge>;
      case "gestor":
        return <Badge className="bg-blue-500"><Shield className="h-3 w-3 mr-1" />Gestor</Badge>;
      default:
        return <Badge variant="secondary">Membro</Badge>;
    }
  };

  const permissionLabels: Record<keyof PermissionsState, string> = {
    can_view_projects: "Ver projetos",
    can_view_tasks: "Ver tarefas",
    can_view_positions: "Ver cargos",
    can_view_analytics: "Ver analytics",
    can_view_briefings: "Ver briefings",
    can_view_culture: "Ver cultura",
    can_view_vision: "Ver visão",
    can_view_processes: "Ver POPs",
    can_view_inventory: "Ver inventário",
    can_view_ai: "Ver IA",
    can_view_workload: "Ver carga de trabalho",
    can_edit_projects: "Editar projetos",
    can_edit_tasks: "Editar tarefas",
    can_edit_positions: "Editar cargos",
    can_edit_analytics: "Editar analytics",
    can_edit_briefings: "Editar briefings",
    can_edit_culture: "Editar cultura",
    can_edit_vision: "Editar visão",
    can_edit_processes: "Editar POPs",
    can_edit_inventory: "Editar inventário",
  };

  return (
    <div className="space-y-6">
      {/* Owned Workspaces */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Workspaces Próprios ({ownedWorkspaces.length})
          </CardTitle>
          <CardDescription>
            Workspaces que este usuário criou e administra
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ownedWorkspaces.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Nenhum workspace próprio
            </p>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {ownedWorkspaces.map((workspace) => (
                <AccordionItem key={workspace.id} value={workspace.id}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3 text-left">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{workspace.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {workspace.workspace_members?.length || 0} membros • 
                          Criado em {format(new Date(workspace.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-2">
                      {/* Action Buttons */}
                      <div className="flex justify-between items-center pb-2 border-b gap-2 flex-wrap">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAccessDialog(workspace.id, workspace.name);
                          }}
                          disabled={isStartingSession}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Acessar como Admin
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setWorkspaceToDelete(workspace);
                            setDeleteWorkspaceDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir Workspace
                        </Button>
                      </div>

                      <p className="text-sm font-medium flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Membros do Workspace
                      </p>
                      {workspace.workspace_members?.length === 0 ? (
                        <p className="text-sm text-muted-foreground pl-6">
                          Nenhum membro além do proprietário
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {workspace.workspace_members?.map((member) => {
                            const isBlocked = isMemberBlocked(workspace.id, member.user_id);
                            const isOwner = member.user_id === userId;
                            
                            return (
                              <div
                                key={member.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-muted/50"
                              >
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-8 w-8">
                                    <AvatarImage src={member.profiles?.avatar_url || undefined} />
                                    <AvatarFallback>
                                      {member.profiles?.full_name?.charAt(0) || "?"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-medium text-sm">
                                        {member.profiles?.full_name || "Sem nome"}
                                      </p>
                                      {getRoleBadge(member.role)}
                                      {isBlocked && (
                                        <Badge variant="destructive" className="text-xs">
                                          <Ban className="h-3 w-3 mr-1" />
                                          Bloqueado
                                        </Badge>
                                      )}
                                      {isOwner && (
                                        <Badge variant="outline" className="text-xs">
                                          Este usuário
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                
                                {!isOwner && (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openActionDialog(member, workspace.id, "role")}
                                    >
                                      <Shield className="h-4 w-4" />
                                      <span className="sr-only sm:not-sr-only sm:ml-1">Cargo</span>
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openActionDialog(member, workspace.id, "permissions")}
                                    >
                                      <Shield className="h-4 w-4" />
                                      <span className="sr-only sm:not-sr-only sm:ml-1">Permissões</span>
                                    </Button>
                                    {isBlocked ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => unblockMember(workspace.id, member.user_id)}
                                      >
                                        <RefreshCw className="h-4 w-4" />
                                        <span className="sr-only sm:not-sr-only sm:ml-1">Desbloquear</span>
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => openActionDialog(member, workspace.id, "block")}
                                      >
                                        <Ban className="h-4 w-4" />
                                        <span className="sr-only sm:not-sr-only sm:ml-1">Bloquear</span>
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive hover:text-destructive"
                                      onClick={() => openActionDialog(member, workspace.id, "remove")}
                                    >
                                      <UserMinus className="h-4 w-4" />
                                      <span className="sr-only sm:not-sr-only sm:ml-1">Remover</span>
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Member Workspaces */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Membro em Workspaces ({memberWorkspaces.filter(m => m.workspace).length})
          </CardTitle>
          <CardDescription>
            Workspaces onde este usuário é membro
          </CardDescription>
        </CardHeader>
        <CardContent>
          {memberWorkspaces.filter(m => m.workspace).length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Não é membro de nenhum workspace
            </p>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {memberWorkspaces.filter(m => m.workspace).map((membership) => {
                const isBlocked = isMemberBlocked(membership.workspace!.id, userId);
                const isOwner = membership.isOwned;
                return (
                  <AccordionItem key={membership.id} value={membership.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3 text-left">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{membership.workspace!.name}</p>
                            {isOwner && (
                              <Badge variant="outline" className="text-xs">
                                <Crown className="h-3 w-3 mr-1" />
                                Criador
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {getRoleBadge(membership.role)}
                            {isBlocked && (
                              <Badge variant="destructive" className="text-xs">
                                <Ban className="h-3 w-3 mr-1" />
                                Bloqueado
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {membership.workspace_members?.length || 0} membros
                            </span>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pt-2">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Membros do Workspace
                        </p>
                        {!membership.workspace_members || membership.workspace_members.length === 0 ? (
                          <p className="text-sm text-muted-foreground pl-6">
                            Nenhum membro encontrado
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {membership.workspace_members.map((member) => {
                              const isMemberBlocked = memberBlocks.some(
                                b => b.workspace_id === membership.workspace!.id && b.user_id === member.user_id
                              );
                              const isCurrentUser = member.user_id === userId;
                              
                              return (
                                <div
                                  key={member.id}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-muted/50"
                                >
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8">
                                      <AvatarImage src={member.profiles?.avatar_url || undefined} />
                                      <AvatarFallback>
                                        {member.profiles?.full_name?.charAt(0) || "?"}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-medium text-sm">
                                          {member.profiles?.full_name || "Sem nome"}
                                        </p>
                                        {getRoleBadge(member.role)}
                                        {isMemberBlocked && (
                                          <Badge variant="destructive" className="text-xs">
                                            <Ban className="h-3 w-3 mr-1" />
                                            Bloqueado
                                          </Badge>
                                        )}
                                        {isCurrentUser && (
                                          <Badge variant="outline" className="text-xs">
                                            Este usuário
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openActionDialog(member, membership.workspace!.id, "role")}
                                    >
                                      <Shield className="h-4 w-4" />
                                      <span className="sr-only sm:not-sr-only sm:ml-1">Cargo</span>
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openActionDialog(member, membership.workspace!.id, "permissions")}
                                    >
                                      <Shield className="h-4 w-4" />
                                      <span className="sr-only sm:not-sr-only sm:ml-1">Permissões</span>
                                    </Button>
                                    {isMemberBlocked ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => unblockMember(membership.workspace!.id, member.user_id)}
                                      >
                                        <RefreshCw className="h-4 w-4" />
                                        <span className="sr-only sm:not-sr-only sm:ml-1">Desbloquear</span>
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => openActionDialog(member, membership.workspace!.id, "block")}
                                      >
                                        <Ban className="h-4 w-4" />
                                        <span className="sr-only sm:not-sr-only sm:ml-1">Bloquear</span>
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive hover:text-destructive"
                                      onClick={() => openActionDialog(member, membership.workspace!.id, "remove")}
                                    >
                                      <UserMinus className="h-4 w-4" />
                                      <span className="sr-only sm:not-sr-only sm:ml-1">Remover</span>
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {actionType === "block" && "Bloquear Membro no Workspace"}
              {actionType === "role" && "Alterar Cargo"}
              {actionType === "permissions" && "Gerenciar Permissões"}
              {actionType === "remove" && "Remover do Workspace"}
            </DialogTitle>
            <DialogDescription>
              {selectedMember?.profiles?.full_name || "Membro"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {actionType === "block" && (
              <div className="space-y-2">
                <Label>Motivo do bloqueio (opcional)</Label>
                <Textarea
                  placeholder="Descreva o motivo..."
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  O membro será bloqueado apenas neste workspace, não afetando outros.
                </p>
              </div>
            )}

            {actionType === "role" && (
              <div className="space-y-2">
                <Label>Novo Cargo</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="gestor">Gestor</SelectItem>
                    <SelectItem value="membro">Membro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {actionType === "permissions" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(Object.keys(permissions) as Array<keyof PermissionsState>).map((key) => (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox
                        id={key}
                        checked={permissions[key]}
                        onCheckedChange={(checked) =>
                          setPermissions((prev) => ({ ...prev, [key]: !!checked }))
                        }
                      />
                      <Label htmlFor={key} className="text-sm">
                        {permissionLabels[key]}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {actionType === "remove" && (
              <p className="text-destructive">
                Tem certeza que deseja remover este membro do workspace? Esta ação não pode ser desfeita.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant={actionType === "remove" || actionType === "block" ? "destructive" : "default"}
              onClick={handleAction}
              disabled={manageMemberMutation.isPending}
            >
              {actionType === "block" && "Bloquear"}
              {actionType === "role" && "Salvar"}
              {actionType === "permissions" && "Salvar"}
              {actionType === "remove" && "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Workspace Confirmation Dialog */}
      <AlertDialog open={deleteWorkspaceDialogOpen} onOpenChange={setDeleteWorkspaceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Excluir Workspace Permanentemente
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="font-medium text-destructive">
                  ⚠️ ATENÇÃO: Esta ação é IRREVERSÍVEL!
                </p>
                <p className="text-sm mt-2">
                  Ao excluir o workspace <strong>"{workspaceToDelete?.name}"</strong>, você irá remover permanentemente:
                </p>
                <ul className="text-sm mt-2 ml-4 list-disc space-y-1">
                  <li>Todos os projetos e tarefas</li>
                  <li>Todos os membros e suas permissões</li>
                  <li>Briefings, debriefings e documentação</li>
                  <li>Inventário, cargos e rotinas</li>
                  <li>Templates, setores e configurações</li>
                  <li>Notificações e conversas com IA</li>
                </ul>
              </div>
              <div className="mt-4">
                <Label htmlFor="confirm-delete" className="text-sm font-medium">
                  Para confirmar, digite o nome do workspace: <strong>{workspaceToDelete?.name}</strong>
                </Label>
                <Input
                  id="confirm-delete"
                  placeholder="Digite o nome do workspace"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="mt-2"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteConfirmText("");
              setWorkspaceToDelete(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                deleteConfirmText !== workspaceToDelete?.name ||
                deleteWorkspaceMutation.isPending
              }
              onClick={() => {
                if (workspaceToDelete) {
                  deleteWorkspaceMutation.mutate(workspaceToDelete.id);
                }
              }}
            >
              {deleteWorkspaceMutation.isPending ? "Excluindo..." : "Excluir Permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Access Workspace Confirmation Dialog */}
      <AlertDialog open={accessConfirmDialogOpen} onOpenChange={setAccessConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Acessar Workspace como Administrador
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Você está prestes a acessar o workspace <strong>"{workspaceToAccess?.name}"</strong> no modo administrador.
                </p>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-600 dark:text-amber-400 text-sm">
                  <p className="font-medium mb-1">⚠️ Atenção:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Você terá acesso completo a todos os dados do workspace</li>
                    <li>Suas ações serão registradas para auditoria</li>
                    <li>A sessão expira em 2 horas automaticamente</li>
                    <li>Um banner visível indicará que você está no modo administrador</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setWorkspaceToAccess(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAccessWorkspace}
              disabled={isStartingSession}
            >
              {isStartingSession ? "Acessando..." : "Confirmar Acesso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
