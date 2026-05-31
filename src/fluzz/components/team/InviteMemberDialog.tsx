import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/fluzz/components/ui/dialog";
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
import { Checkbox } from "@/fluzz/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/fluzz/components/ui/radio-group";
import { toast } from "sonner";
import { Mail, UserCheck } from "lucide-react";

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const InviteMemberDialog = ({
  open,
  onOpenChange,
}: InviteMemberDialogProps) => {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "gestor" | "membro">("membro");
  const [existingUser, setExistingUser] = useState<{ user_id: string; email: string } | null>(null);
  const [existingMember, setExistingMember] = useState<{
    role: string;
    permissions: any;
  } | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [permissions, setPermissions] = useState({
    can_view_projects: true,
    can_view_tasks: true,
    can_view_positions: true,
    can_view_analytics: false,
    can_view_culture: true,
    can_view_vision: true,
    can_view_processes: true,
    can_view_briefings: true,
  });

  // Check if user exists when email changes
  useEffect(() => {
    const checkUserExists = async () => {
      if (!email || email.length < 5 || !email.includes('@')) {
        setExistingUser(null);
        setExistingMember(null);
        return;
      }

      setCheckingEmail(true);
      try {
        const { data, error } = await supabase.rpc('get_user_by_email', {
          _email: email
        });

        if (error) {
          console.error("Erro ao verificar usuário:", error);
          setExistingUser(null);
          setExistingMember(null);
        } else if (data && data.length > 0) {
          const user = data[0];
          setExistingUser(user);
          
          // Check if user is already a member
          if (workspace?.id) {
            const { data: memberData } = await supabase
              .from("workspace_members")
              .select("role")
              .eq("workspace_id", workspace.id)
              .eq("user_id", user.user_id)
              .maybeSingle();

            if (memberData) {
              // User is already a member - fetch their permissions
              const { data: permData } = await supabase
                .from("user_permissions")
                .select("*")
                .eq("workspace_id", workspace.id)
                .eq("user_id", user.user_id)
                .maybeSingle();

              setExistingMember({
                role: memberData.role,
                permissions: permData || null
              });
              
              // Set form to current values
              setRole(memberData.role as "admin" | "gestor" | "membro");
              if (permData) {
                setPermissions({
                  can_view_projects: permData.can_view_projects,
                  can_view_tasks: permData.can_view_tasks,
                  can_view_positions: permData.can_view_positions,
                  can_view_analytics: permData.can_view_analytics,
                  can_view_culture: permData.can_view_culture,
                  can_view_vision: permData.can_view_vision,
                  can_view_processes: permData.can_view_processes,
                  can_view_briefings: permData.can_view_briefings,
                });
              }
            } else {
              setExistingMember(null);
            }
          }
        } else {
          setExistingUser(null);
          setExistingMember(null);
        }
      } catch (error) {
        console.error("Erro ao verificar usuário:", error);
        setExistingUser(null);
        setExistingMember(null);
      } finally {
        setCheckingEmail(false);
      }
    };

    const debounceTimer = setTimeout(checkUserExists, 500);
    return () => clearTimeout(debounceTimer);
  }, [email, workspace?.id]);

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!workspace?.id) {
        throw new Error("Workspace não definido");
      }
      
      if (!email) {
        throw new Error("Email é obrigatório");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // For updating existing members
      if (existingUser && existingMember) {
        // Update role
        const { error: roleError } = await supabase
          .from("workspace_members")
          .update({ role: role })
          .eq("workspace_id", workspace.id)
          .eq("user_id", existingUser.user_id);

        if (roleError) throw roleError;

        // Update or create permissions if not admin
        if (role !== "admin") {
          const { error: permError } = await supabase
            .from("user_permissions")
            .upsert({
              user_id: existingUser.user_id,
              workspace_id: workspace.id,
              ...permissions,
            }, {
              onConflict: "user_id,workspace_id"
            });

          if (permError) throw permError;
        }

        return null; // No link needed for updates
      }

      // For direct invites (existing users, not yet members)
      if (existingUser && !existingMember) {
        // Add user directly to workspace
        const { error: memberError } = await supabase
          .from("workspace_members")
          .insert({
            workspace_id: workspace.id,
            user_id: existingUser.user_id,
            role: role,
            invited_by: user.id,
          });

        if (memberError) throw memberError;

        // Set permissions if not admin
        if (role !== "admin") {
          const { error: permError } = await supabase
            .from("user_permissions")
            .insert({
              user_id: existingUser.user_id,
              workspace_id: workspace.id,
              ...permissions,
            });

          if (permError) throw permError;
        }

        // Create notification for the invited user
        const { error: notifError } = await supabase
          .from("notifications")
          .insert({
            user_id: existingUser.user_id,
            workspace_id: workspace.id,
            type: "workspace_invite",
            title: "Novo convite de workspace",
            message: `Você foi adicionado ao workspace "${workspace.name}" como ${role === "admin" ? "Administrador" : role === "gestor" ? "Gestor" : "Membro"}`,
            link: "/",
          });

        if (notifError) console.error("Erro ao criar notificação:", notifError);

        return null; // No link needed for direct invites
      }

      // For new users - generate invite token
      const token = crypto.randomUUID();

      // Create invite
      const { error: inviteError } = await supabase
        .from("workspace_invites")
        .insert({
          workspace_id: workspace.id,
          email: email,
          role: role,
          permissions: role !== "admin" ? permissions : null,
          invited_by: user.id,
          token: token,
        });

      if (inviteError) throw inviteError;

      // Get published app URL - ALWAYS use production URL
      const hostname = window.location.hostname;
      let baseUrl;

      if (hostname.includes('lovableproject.com') || hostname.includes('lovable.app')) {
        // Lovable hosted environment - use fluzzapp.com
        baseUrl = 'https://fluzzapp.com';
      } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
        // For localhost, we cannot determine production URL automatically
        // User should test invites from the published/preview app, not localhost
        throw new Error("Convites devem ser enviados a partir do app publicado, não de localhost. Por favor, acesse seu app publicado para enviar convites.");
      } else {
        // Custom domain
        baseUrl = window.location.origin;
      }
      
      const link = `${baseUrl}/auth?invite=${token}`;
      
      // Send email with invite link via Supabase Auth
      try {
        const { error: emailError } = await supabase.functions.invoke('send-invite-email', {
          body: {
            email: email,
            workspaceName: workspace.name,
            inviteLink: link,
            role: role,
            workspaceId: workspace.id,
            permissions: role !== "admin" ? permissions : null,
          }
        });

        if (emailError) {
          console.error("Erro ao enviar email:", emailError);
          // Don't throw - we still want to show the link even if email fails
        }
      } catch (emailError) {
        console.error("Erro ao enviar email:", emailError);
        throw new Error("Erro ao enviar email de convite");
      }
      
      return null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
      
      if (existingMember) {
        toast.success("Permissões do membro atualizadas com sucesso!");
      } else if (existingUser) {
        toast.success("Membro adicionado com sucesso!");
      } else {
        toast.success("Email de convite enviado com sucesso!");
      }
      
      setTimeout(() => {
        resetForm();
        onOpenChange(false);
      }, 1500);
    },
    onError: (error: any) => {
      console.error("Erro ao criar convite:", error);
      toast.error(error.message || "Erro ao criar convite");
    },
  });

  const resetForm = () => {
    setEmail("");
    setRole("membro");
    setExistingUser(null);
    setExistingMember(null);
    setPermissions({
      can_view_projects: true,
      can_view_tasks: true,
      can_view_positions: true,
      can_view_analytics: false,
      can_view_culture: true,
      can_view_vision: true,
      can_view_processes: true,
      can_view_briefings: true,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("O email é obrigatório");
      return;
    }
    if (!email.includes('@')) {
      toast.error("Digite um email válido");
      return;
    }
    inviteMutation.mutate();
  };

  const handleRoleChange = (newRole: "admin" | "gestor" | "membro") => {
    setRole(newRole);
    if (newRole === "admin" || newRole === "gestor") {
      setPermissions({
        can_view_projects: true,
        can_view_tasks: true,
        can_view_positions: true,
        can_view_analytics: true,
        can_view_culture: true,
        can_view_vision: true,
        can_view_processes: true,
        can_view_briefings: true,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar Membro à Equipe</DialogTitle>
          <DialogDescription>
            Convide um novo membro e defina suas permissões
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@exemplo.com"
                required
                disabled={inviteMutation.isPending}
              />
              {checkingEmail && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              )}
            </div>
            
            {existingUser && !existingMember && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 p-2 rounded">
                <UserCheck className="h-4 w-4" />
                <span>Usuário encontrado! Será adicionado diretamente ao workspace.</span>
              </div>
            )}
            
            {existingMember && (
              <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 p-3 rounded">
                <UserCheck className="h-4 w-4 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">Usuário já é membro deste workspace</p>
                  <p className="text-xs mt-1">Cargo atual: {existingMember.role}. Você pode atualizar o cargo e permissões abaixo.</p>
                </div>
              </div>
            )}
            
            {email && !existingUser && !checkingEmail && email.includes('@') && (
              <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg mt-2">
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  <strong>Usuário novo detectado.</strong> Será enviado um email de convite automaticamente.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Cargo *</Label>
            <Select value={role} onValueChange={handleRoleChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="gestor">Gestor</SelectItem>
                <SelectItem value="membro">Membro</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Administrador:</strong> Acesso total ao workspace</p>
              <p><strong>Gestor:</strong> Pode gerenciar projetos e equipe</p>
              <p><strong>Membro:</strong> Acesso limitado baseado em permissões</p>
            </div>
          </div>

          {role !== "admin" && (
            <div className="space-y-3 border-t pt-4">
              <Label>Permissões</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="can_view_projects"
                    checked={permissions.can_view_projects}
                    onCheckedChange={(checked) =>
                      setPermissions({ ...permissions, can_view_projects: !!checked })
                    }
                  />
                  <Label htmlFor="can_view_projects" className="text-sm font-normal cursor-pointer">
                    Projetos
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="can_view_tasks"
                    checked={permissions.can_view_tasks}
                    onCheckedChange={(checked) =>
                      setPermissions({ ...permissions, can_view_tasks: !!checked })
                    }
                  />
                  <Label htmlFor="can_view_tasks" className="text-sm font-normal cursor-pointer">
                    Tarefas
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="can_view_positions"
                    checked={permissions.can_view_positions}
                    onCheckedChange={(checked) =>
                      setPermissions({ ...permissions, can_view_positions: !!checked })
                    }
                  />
                  <Label htmlFor="can_view_positions" className="text-sm font-normal cursor-pointer">
                    Cargos
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="can_view_analytics"
                    checked={permissions.can_view_analytics}
                    onCheckedChange={(checked) =>
                      setPermissions({ ...permissions, can_view_analytics: !!checked })
                    }
                  />
                  <Label htmlFor="can_view_analytics" className="text-sm font-normal cursor-pointer">
                    Analytics
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="can_view_culture"
                    checked={permissions.can_view_culture}
                    onCheckedChange={(checked) =>
                      setPermissions({ ...permissions, can_view_culture: !!checked })
                    }
                  />
                  <Label htmlFor="can_view_culture" className="text-sm font-normal cursor-pointer">
                    Cultura
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="can_view_vision"
                    checked={permissions.can_view_vision}
                    onCheckedChange={(checked) =>
                      setPermissions({ ...permissions, can_view_vision: !!checked })
                    }
                  />
                  <Label htmlFor="can_view_vision" className="text-sm font-normal cursor-pointer">
                    Visão & Valores
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="can_view_processes"
                    checked={permissions.can_view_processes}
                    onCheckedChange={(checked) =>
                      setPermissions({ ...permissions, can_view_processes: !!checked })
                    }
                  />
                  <Label htmlFor="can_view_processes" className="text-sm font-normal cursor-pointer">
                    POPs
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="can_view_briefings"
                    checked={permissions.can_view_briefings}
                    onCheckedChange={(checked) =>
                      setPermissions({ ...permissions, can_view_briefings: !!checked })
                    }
                  />
                  <Label htmlFor="can_view_briefings" className="text-sm font-normal cursor-pointer">
                    Briefings
                  </Label>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending
                ? "Processando..."
                : existingMember
                ? "Atualizar Permissões"
                : existingUser
                ? "Adicionar à Equipe"
                : "Enviar Convite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
