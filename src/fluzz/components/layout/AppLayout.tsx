import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/fluzz/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/fluzz/components/ui/select";
import { ThemeToggle } from "@/fluzz/components/ThemeToggle";
import { NotificationBell } from "@/fluzz/components/notifications/NotificationBell";
import { Button } from "@/fluzz/components/ui/button";
import { ArrowLeft, User, Shield } from "lucide-react";
import { AIFloatingButton } from "@/fluzz/components/ai/AIFloatingButton";
import { AdminViewBanner } from "@/fluzz/components/admin/AdminViewBanner";
import { SetupPopup } from "@/fluzz/components/onboarding/SetupPopup";
import { useIsMobile } from "@/fluzz/hooks/use-mobile";
import { cn } from "@/fluzz/lib/utils";
import { ViewModeToggle } from "@/fluzz/components/view-mode/ViewModeToggle";
import { useViewMode } from "@/fluzz/hooks/useViewMode";

interface AppLayoutProps {
  children: React.ReactNode;
}
export const AppLayout = ({
  children
}: AppLayoutProps) => {
  const {
    user,
    loading
  } = useAuth();
  const {
    workspace,
    workspaceMember,
    workspaces,
    loading: workspaceLoading,
    changeWorkspace,
    isAdminViewMode
  } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { viewMode, setViewMode } = useViewMode();

  // Focus Mode: allow task pages, projects, home, and profile.
  // No longer restricts navigation - all bottom nav destinations are allowed.
  useEffect(() => {
    if (viewMode !== "focus") return;

    const path = location.pathname;
    const isAllowed =
      path === "/tools/wizzy-flow/my-tasks" ||
      path.startsWith("/tools/wizzy-flow/tasks/") ||
      path === "/tools/wizzy-flow/projects" ||
      path.startsWith("/tools/wizzy-flow/projects/") ||
      path === "/tools/wizzy-flow/focus-projects" ||
      path === "/tools/wizzy-flow/home" ||
      path === "/tools/wizzy-flow" ||
      path === "/tools/wizzy-flow/profile";

    if (!isAllowed) {
      navigate("/tools/wizzy-flow/my-tasks", { replace: true });
    }
  }, [location.pathname, navigate, viewMode]);

  // Evita "desmontar" a tela inteira depois que já carregou uma vez.
  // Isso previne perda de texto em formulários quando o workspace faz refetch em background.
  const shouldBlockForBootstrap =
    loading || (user && workspaceLoading && workspaces.length === 0 && !workspaceMember);

  if (shouldBlockForBootstrap) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Redireciona para setup APENAS se o usuário não tem nenhum workspace
  // Usuários existentes que já têm workspaces não precisam ver a tela de setup
  if (user && !workspaceLoading && workspaces.length === 0) {
    console.log("Redirecionando para setup - sem workspaces");
    return <Navigate to="/tools/wizzy-flow" replace />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  return <SidebarProvider>
      <div 
        className="min-h-screen flex flex-col w-full bg-background"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* Admin View Banner - always visible at top when active */}
        <AdminViewBanner />
        
        <div className="flex flex-1 w-full">
          {/* Barra fixa que cobre a safe area do iOS */}
          <div 
            className="fixed top-0 left-0 right-0 bg-card z-[60]"
            style={{ height: 'env(safe-area-inset-top, 0px)' }}
          />
          <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header 
            className="border-b border-border bg-card flex items-center justify-between px-3 sm:px-6 fixed left-0 right-0 z-50 h-14"
            style={{ 
              top: 'env(safe-area-inset-top, 0px)',
              paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))'
            }}
          >
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <SidebarTrigger />
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/tools")}
                className="hidden gap-2 sm:flex"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar para Wizzy
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/tools")}
                className="h-8 w-8 sm:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Voltar para Wizzy</span>
              </Button>
              <h1 className="text-sm sm:text-xl font-semibold text-primary flex-shrink-0">Wizzy Flow</h1>
              {workspaceMember && workspaces.length > 0 && <Select value={workspace?.id} onValueChange={value => {
              void changeWorkspace(value);
            }}>
                  <SelectTrigger className={`w-[160px] sm:w-[220px] text-xs sm:text-sm ${isAdminViewMode ? 'border-orange-500 bg-orange-500/10' : ''}`}>
                    <SelectValue placeholder="Selecionar workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map(ws => (
                      <SelectItem key={ws.id} value={ws.id}>
                        <div className="flex items-center gap-2">
                          {ws.isAdminView && (
                            <Shield className="h-3 w-3 text-orange-500" />
                          )}
                          <span>{ws.name}</span>
                          {ws.isAdminView && (
                            <span className="text-[10px] text-orange-500 font-medium">(Admin)</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>}
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <ViewModeToggle 
                viewMode={viewMode} 
                onViewModeChange={setViewMode}
                className="flex shrink-0"
              />
              <ThemeToggle />
              <NotificationBell />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/tools/wizzy-flow/profile")}
                className="h-8 w-8 sm:h-9 sm:w-9"
              >
                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="sr-only">Perfil</span>
              </Button>
            </div>
          </header>
          {/* Spacer para compensar o header fixo */}
          <div className="h-14 shrink-0" />
          <main className={cn(
            "flex-1 p-3 sm:p-6 animate-fade-in min-w-0",
            isMobile && "pb-20" // Extra padding for mobile bottom nav
          )}>
            {children}
            </main>
          </div>
          {location.pathname !== "/tools/wizzy-flow/ai-assistant" && <AIFloatingButton />}
          <SetupPopup />
          {/* Mobile Bottom Navigation - Show in both modes */}
          {isMobile && <MobileBottomNav />}
        </div>
      </div>
    </SidebarProvider>;
};
