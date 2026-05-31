import { ReactNode, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAdmin } from "@/fluzz/contexts/AdminContext";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { 
  Users, 
  CreditCard, 
  Settings, 
  Shield, 
  LayoutDashboard, 
  LogOut,
  ChevronRight,
  Menu,
  X,
  FileText
} from "lucide-react";
import { Button } from "@/fluzz/components/ui/button";
import { cn } from "@/fluzz/lib/utils";
import { useState } from "react";
import { ThemeToggle } from "@/fluzz/components/ThemeToggle";

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  description?: string;
}

const menuItems = [
  { path: "/tools/wizzy-flow/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/tools/wizzy-flow/admin/users", label: "Usuários", icon: Users },
  { path: "/tools/wizzy-flow/admin/subscriptions", label: "Assinaturas", icon: CreditCard },
  { path: "/tools/wizzy-flow/admin/plans", label: "Planos", icon: Settings },
  { path: "/tools/wizzy-flow/admin/team", label: "Equipe Admin", icon: Shield },
  { path: "/tools/wizzy-flow/admin/audit", label: "Auditoria", icon: FileText },
];

export const AdminLayout = ({ children, title, description }: AdminLayoutProps) => {
  const { isAdmin, loading } = useAdmin();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate("/tools/wizzy-flow/admin", { replace: true });
    }
  }, [isAdmin, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-muted-foreground">Verificando acesso...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 border-b bg-card z-50 flex items-center justify-between px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-semibold">Painel Admin</span>
        </div>
        <ThemeToggle />
      </header>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-full w-64 bg-card border-r z-40 transition-transform duration-300 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Painel Admin</h1>
              <p className="text-xs text-muted-foreground">Gestão da Plataforma</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {isActive && <ChevronRight className="h-4 w-4 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">
                {user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.email}</p>
              <p className="text-xs text-muted-foreground">Administrador</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden lg:block">
              <ThemeToggle />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => signOut()}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="lg:ml-64 pt-14 lg:pt-0">
        <div className="p-6 lg:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">{title}</h1>
            {description && (
              <p className="text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
};
