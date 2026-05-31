import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/fluzz/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/fluzz/components/ui/popover";
import { Badge } from "@/fluzz/components/ui/badge";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { NotificationList } from "./NotificationList";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const NotificationBell = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifications = [], refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const unreadCount = notifications.filter((n: any) => !n.read).length;

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refetch]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
          <span className="sr-only">Notificações</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <NotificationList
          notifications={notifications}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
};
