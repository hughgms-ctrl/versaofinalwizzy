import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useAdmin } from "@/fluzz/contexts/AdminContext";
import { useNavigate } from "react-router-dom";

interface AdminViewSession {
  id: string;
  workspace_id: string;
  workspace_name: string;
  expires_at: string;
}

interface AdminViewContextType {
  activeSession: AdminViewSession | null;
  isAdminViewing: boolean;
  isLoading: boolean;
  navigateToWorkspace: (workspaceId: string, workspaceName: string) => Promise<void>;
  startSession: (workspaceId: string, workspaceName: string) => Promise<void>;
  endSession: () => Promise<void>;
  checkActiveSession: () => Promise<void>;
}

const AdminViewContext = createContext<AdminViewContextType | undefined>(undefined);

export const AdminViewProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const [activeSession, setActiveSession] = useState<AdminViewSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const checkActiveSession = useCallback(async () => {
    if (!user || !isAdmin) {
      setActiveSession(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("admin_view_sessions")
        .select(`
          id,
          workspace_id,
          expires_at,
          workspaces:workspace_id (name)
        `)
        .eq("admin_user_id", user.id)
        .gt("expires_at", new Date().toISOString())
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error checking admin view session:", error);
        setActiveSession(null);
        return;
      }

      if (data) {
        setActiveSession({
          id: data.id,
          workspace_id: data.workspace_id,
          workspace_name: (data.workspaces as any)?.name || "Workspace",
          expires_at: data.expires_at,
        });
      } else {
        setActiveSession(null);
      }
    } catch (err) {
      console.error("Error checking admin view session:", err);
      setActiveSession(null);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    checkActiveSession();
  }, [checkActiveSession]);

  const startSession = async (workspaceId: string, workspaceName: string) => {
    if (!user || !isAdmin) {
      throw new Error("Não autorizado");
    }

    setIsLoading(true);
    try {
      // End any existing sessions first
      await supabase
        .from("admin_view_sessions")
        .delete()
        .eq("admin_user_id", user.id);

      // Create new session (2 hours expiry)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 2);

      const { data, error } = await supabase
        .from("admin_view_sessions")
        .insert({
          admin_user_id: user.id,
          workspace_id: workspaceId,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      setActiveSession({
        id: data.id,
        workspace_id: workspaceId,
        workspace_name: workspaceName,
        expires_at: data.expires_at,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const navigateToWorkspace = async (workspaceId: string, workspaceName: string) => {
    await startSession(workspaceId, workspaceName);
    // Save to localStorage so WorkspaceContext picks it up
    window.localStorage.setItem("currentWorkspaceId", workspaceId);
    // Force page reload to reset all contexts with the admin session
    window.location.href = "/home";
  };

  const endSession = async () => {
    if (!user || !activeSession) return;

    setIsLoading(true);
    try {
      await supabase
        .from("admin_view_sessions")
        .delete()
        .eq("id", activeSession.id);

      setActiveSession(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AdminViewContext.Provider
      value={{
        activeSession,
        isAdminViewing: !!activeSession,
        isLoading,
        startSession,
        endSession,
        checkActiveSession,
        navigateToWorkspace,
      }}
    >
      {children}
    </AdminViewContext.Provider>
  );
};

export const useAdminView = () => {
  const context = useContext(AdminViewContext);
  if (!context) {
    throw new Error("useAdminView must be used within an AdminViewProvider");
  }
  return context;
};
