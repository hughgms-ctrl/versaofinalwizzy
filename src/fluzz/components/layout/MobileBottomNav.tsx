import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { FolderKanban, CheckSquare, Home } from "lucide-react";
import { cn } from "@/fluzz/lib/utils";
import { useViewMode } from "@/fluzz/hooks/useViewMode";

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentPath = location.pathname;
  const { viewMode } = useViewMode();

  // Navigation behavior:
  // - In Focus Mode: all buttons work normally (Projetos -> /projects, Tarefas -> /my-tasks, Home -> /home)
  // - In Management Mode: same behavior
  const handleNavigation = (path: string) => {
    if (path === "/projects" && viewMode === "focus") {
      navigate("/tools/wizzy-flow/focus-projects");
    } else {
      navigate(path);
    }
  };

  // Determine active state
  const isActive = (path: string) => {
    if (path === "/my-tasks") {
      return currentPath === "/my-tasks" || currentPath.startsWith("/tasks/");
    }
    if (path === "/projects") {
      return currentPath === "/projects" || currentPath.startsWith("/projects/") || currentPath === "/focus-projects";
    }
    if (path === "/home") {
      return currentPath === "/home" || currentPath === "/";
    }
    return currentPath === path;
  };

  const navItems = [
    { icon: FolderKanban, path: "/tools/wizzy-flow/projects", label: "Projetos" },
    { icon: CheckSquare, path: "/tools/wizzy-flow/my-tasks", label: "Tarefas", isMain: true },
    { icon: Home, path: "/tools/wizzy-flow/home", label: "Home" },
  ];

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden"
      style={{ 
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)'
      }}
    >
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const active = isActive(item.path);
          
          return (
            <button
              key={item.path}
              onClick={() => handleNavigation(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-4 py-2 min-w-[72px] transition-colors",
                active 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground",
                item.isMain && "relative"
              )}
            >
              <div className={cn(
                "flex items-center justify-center",
                item.isMain && active && "bg-primary/10 rounded-full p-1.5 -mt-1"
              )}>
                <item.icon className={cn(
                  "h-5 w-5",
                  item.isMain && active && "h-6 w-6"
                )} />
              </div>
              <span className={cn(
                "text-[10px] font-medium",
                item.isMain && active && "text-primary"
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
