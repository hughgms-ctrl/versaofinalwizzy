import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { Button } from "@/fluzz/components/ui/button";
import { ScrollArea } from "@/fluzz/components/ui/scroll-area";
import { Separator } from "@/fluzz/components/ui/separator";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { NotificationItem } from "./NotificationItem";
import { CheckCheck, Bell } from "lucide-react";

interface NotificationListProps {
  notifications: any[];
  onClose: () => void;
}

export const NotificationList = ({
  notifications,
  onClose,
}: NotificationListProps) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { refetchWorkspace } = useWorkspace();

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Todas as notificações marcadas como lidas");
    },
  });

  const handleNotificationClick = async (notification: any) => {
    // Mark as read
    if (!notification.read) {
      await markAsReadMutation.mutateAsync(notification.id);
    }

    // Handle workspace invite
    if (notification.type === "workspace_invite" && notification.data?.token) {
      await handleWorkspaceInvite(notification);
    } else if (notification.link) {
      navigate(notification.link);
      onClose();
    }
  };

  const handleWorkspaceInvite = async (notification: any) => {
    const token = notification.data?.token;
    const inviteData = notification.data;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Add user to workspace
      const { error: memberError } = await supabase
        .from("workspace_members")
        .insert({
          workspace_id: inviteData.workspace_id,
          user_id: user.id,
          role: inviteData.role,
          invited_by: inviteData.invited_by,
        });

      if (memberError) throw memberError;

      // Set permissions if not admin
      if (inviteData.role !== "admin" && inviteData.permissions) {
        const { error: permError } = await supabase
          .from("user_permissions")
          .insert({
            workspace_id: inviteData.workspace_id,
            user_id: user.id,
            ...inviteData.permissions,
          });

        if (permError) throw permError;
      }

      // Mark invite as accepted
      await supabase
        .from("workspace_invites")
        .update({ accepted: true })
        .eq("token", token);

      // Delete notification
      await supabase
        .from("notifications")
        .delete()
        .eq("id", notification.id);

      toast.success("Convite aceito!");
      await refetchWorkspace();
      navigate("/tools/wizzy-flow/", { replace: true });
      onClose();
    } catch (error: any) {
      console.error("Erro ao aceitar convite:", error);
      toast.error(error.message || "Erro ao aceitar convite");
    }
  };

  const unreadNotifications = notifications.filter((n) => !n.read);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Notificações</h3>
        {unreadNotifications.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => markAllAsReadMutation.mutate()}
            disabled={markAllAsReadMutation.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-1" />
            Marcar todas como lidas
          </Button>
        )}
      </div>

      <ScrollArea className="h-[400px]">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p>Nenhuma notificação</p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={() => handleNotificationClick(notification)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
