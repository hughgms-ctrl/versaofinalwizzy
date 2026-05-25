import { useNewMessageNotifications } from '@/hooks/useNewMessageNotifications';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  // This hook sets up the real-time subscription for notifications
  useNewMessageNotifications();
  
  return <>{children}</>;
}
