import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  MessageSquare, 
  UserPlus,
  CheckSquare,
  RefreshCw
} from "lucide-react";
import { cn } from "@/fluzz/lib/utils";

interface NotificationItemProps {
  notification: any;
  onClick: () => void;
}

const getNotificationIcon = (type: string) => {
  switch (type) {
    case "task_assigned":
      return <CheckSquare className="h-4 w-4" />;
    case "task_due_soon":
      return <Clock className="h-4 w-4 text-amber-500" />;
    case "task_overdue":
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    case "task_comment":
      return <MessageSquare className="h-4 w-4" />;
    case "workspace_invite":
      return <UserPlus className="h-4 w-4 text-primary" />;
    case "task_completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "task_updated":
      return <RefreshCw className="h-4 w-4" />;
    default:
      return <CheckSquare className="h-4 w-4" />;
  }
};

export const NotificationItem = ({
  notification,
  onClick,
}: NotificationItemProps) => {
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
    locale: ptBR,
  });

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full p-4 text-left hover:bg-muted/50 transition-colors",
        !notification.read && "bg-primary/5"
      )}
    >
      <div className="flex gap-3">
        <div className="mt-0.5">{getNotificationIcon(notification.type)}</div>
        <div className="flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className={cn(
              "text-sm font-medium",
              !notification.read && "font-semibold"
            )}>
              {notification.title}
            </p>
            {!notification.read && (
              <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1" />
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground">{timeAgo}</p>
        </div>
      </div>
    </button>
  );
};
