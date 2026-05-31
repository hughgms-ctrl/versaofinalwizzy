import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

type PermissionKey = keyof ReturnType<typeof useWorkspace>["permissions"];

interface RequirePermissionProps {
  permission: PermissionKey;
  children: ReactNode;
  redirectTo?: string;
}

export function RequirePermission({
  permission,
  children,
  redirectTo = "/home",
}: RequirePermissionProps) {
  const { user, loading: authLoading } = useAuth();
  const { permissions, loading: workspaceLoading } = useWorkspace();

  if (authLoading || workspaceLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/tools/wizzy-flow/auth" replace />;

  const allowed = permissions?.[permission] === true;
  if (!allowed) return <Navigate to={redirectTo} replace />;

  return <>{children}</>;
}
