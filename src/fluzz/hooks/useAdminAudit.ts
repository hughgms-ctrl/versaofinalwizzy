import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useCallback } from "react";

export type AuditAction =
  | "subscription_access_enabled"
  | "subscription_access_disabled"
  | "user_blocked"
  | "user_unblocked"
  | "user_deleted"
  | "workspace_deleted"
  | "password_reset"
  | "workspace_created";

export type AuditTargetType = "user" | "workspace";

interface AuditLogParams {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string;
  targetEmail?: string;
  details?: Record<string, unknown>;
}

export function useAdminAudit() {
  const { user } = useAuth();

  const logAction = useCallback(
    async (params: AuditLogParams) => {
      if (!user?.id) {
        console.error("Cannot log audit action: no user logged in");
        return;
      }

      try {
        const insertData = {
          admin_user_id: user.id,
          action: params.action,
          target_type: params.targetType,
          target_id: params.targetId || null,
          target_email: params.targetEmail || null,
          details: params.details ? JSON.parse(JSON.stringify(params.details)) : null,
        };

        const { error } = await supabase
          .from("admin_audit_logs")
          .insert([insertData]);

        if (error) {
          console.error("Failed to log audit action:", error);
        }
      } catch (err) {
        console.error("Error logging audit action:", err);
      }
    },
    [user?.id]
  );

  return { logAction };
}
