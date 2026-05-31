import { useState } from "react";
import { Home, FolderKanban, CheckSquare, User, LogOut, Briefcase, Heart, Target, FileText, BarChart3, Users, Building2, Eye, BookOpen, Package, Bot, Layers, StickyNote, GitBranch, Plus, UserPlus, MessageCircle, Sparkles } from "lucide-react";
import { NavLink } from "@/fluzz/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/fluzz/contexts/AuthContext";
import { useWorkspace } from "@/fluzz/contexts/WorkspaceContext";
import { cn } from "@/fluzz/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/fluzz/integrations/supabase/client";
import { useViewMode } from "@/fluzz/hooks/useViewMode";
import { CreateProjectDialog } from "@/fluzz/components/projects/CreateProjectDialog";
import { Button } from "@/fluzz/components/ui/button";
import { useIsMobile } from "@/fluzz/hooks/use-mobile";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/fluzz/components/ui/sidebar";

const projectColors = [
  { name: "primary", value: "hsl(var(--primary))" },
  { name: "blue", value: "hsl(217, 91%, 60%)" },
  { name: "emerald", value: "hsl(142, 71%, 45%)" },
  { name: "amber", value: "hsl(43, 96%, 56%)" },
  { name: "purple", value: "hsl(271, 81%, 56%)" },
  { name: "pink", value: "hsl(330, 81%, 60%)" },
  { name: "cyan", value: "hsl(188, 94%, 42%)" },
  { name: "rose", value: "hsl(346, 77%, 49%)" },
  { name: "orange", value: "hsl(25, 95%, 53%)" },
  { name: "teal", value: "hsl(173, 80%, 40%)" },
];

interface MenuItem {
  title: string;
  url: string;
  icon: any;
  permission?: string | null;
  adminOnly?: boolean;
}

const menuItems: MenuItem[] = [
  { title: "Home", url: "/tools/wizzy-flow/home", icon: Home },
  { title: "Workspace", url: "/tools/wizzy-flow/workspace", icon: Briefcase },
  { title: "Flow AI", url: "/tools/wizzy-flow/ai-assistant", icon: Bot, permission: "can_view_ai" },
  { title: "Projetos", url: "/tools/wizzy-flow/projects", icon: FolderKanban, permission: "can_view_projects" },
  { title: "Minhas Tarefas", url: "/tools/wizzy-flow/my-tasks", icon: CheckSquare, permission: "can_view_tasks" },
  { title: "Workload View", url: "/tools/wizzy-flow/workload", icon: Layers, permission: "can_view_workload" },
  { title: "Analytics", url: "/tools/wizzy-flow/analytics", icon: BarChart3, permission: "can_view_analytics" },
];

const workspaceItems: MenuItem[] = [
  { title: "POP's", url: "/tools/wizzy-flow/workspace/processes", icon: BookOpen, permission: "can_view_processes" },
  { title: "Notas", url: "/tools/wizzy-flow/workspace/notes", icon: StickyNote, permission: "can_view_notes" },
  { title: "Equipe", url: "/tools/wizzy-flow/team", icon: Users, adminOnly: true },
  { title: "Setores", url: "/tools/wizzy-flow/positions", icon: Briefcase, permission: "can_view_positions" },
  { title: "Inventário", url: "/tools/wizzy-flow/inventory", icon: Package, permission: "can_view_inventory" },
  { title: "Participantes", url: "/tools/wizzy-flow/workspace/participants", icon: UserPlus, adminOnly: true },
  { title: "WhatsApp", url: "/tools/wizzy-flow/workspace/whatsapp", icon: MessageCircle, adminOnly: true },
];

export function AppSidebar() {
  const { state, setOpenMobile } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { permissions, isAdmin, isGestor, workspace } = useWorkspace();
  const { viewMode } = useViewMode();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const isMobile = useIsMobile();

  const isCollapsed = state === "collapsed";
  const isActive = (path: string) => {
    if (path === "/home") return location.pathname === "/home";
    if (path === "/workspace") return location.pathname === "/workspace";
    return location.pathname.startsWith(path);
  };

  // Handler for project click in focus mode - closes sidebar on mobile
  const handleFocusProjectClick = (projectId: string) => {
    if (isMobile) {
      setOpenMobile(false);
    }
    navigate(`/tools/wizzy-flow/my-tasks?projectId=${projectId}`);
  };

  const canViewItem = (item: MenuItem) => {
    // Items that require admin/gestor role (like Team management)
    if (item.adminOnly && !isAdmin && !isGestor) return false;
    
    // Items without permission requirement are always visible
    if (!item.permission) return true;
    
    // ALL users must check the explicit permission value from DB
    const permissionKey = item.permission as keyof typeof permissions;
    return permissions[permissionKey] === true;
  };

  const isFocusMode = viewMode === "focus";
  const activeProjectId = new URLSearchParams(location.search).get("projectId");

  const canViewFocusTasks = canViewItem({
    title: "Minhas Tarefas",
    url: "/tools/wizzy-flow/my-tasks",
    icon: CheckSquare,
    permission: "can_view_tasks",
  });

  const canViewFocusProjects = canViewItem({
    title: "Projetos",
    url: "/tools/wizzy-flow/projects",
    icon: FolderKanban,
    permission: "can_view_projects",
  });

  const { data: focusProjects = [] } = useQuery({
    queryKey: ["focus-projects", workspace?.id],
    queryFn: async () => {
      if (!workspace?.id) return [];
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, color")
        .eq("workspace_id", workspace.id)
        .eq("archived", false)
        .eq("is_standalone_folder", false)
        .neq("pending_notifications", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: isFocusMode && canViewFocusProjects && !!workspace?.id,
  });

  const canCreateProjects = isAdmin || isGestor;

  return (
    <Sidebar className={isCollapsed ? "w-16" : "w-64"}>
      <SidebarContent className="py-4">
        <SidebarGroup>
          <SidebarGroupLabel className={cn("text-xs uppercase tracking-wider font-medium", isCollapsed && "text-center")}>
            {isFocusMode ? "Foco" : "Menu Principal"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isFocusMode ? (
                canViewFocusTasks ? (
                  <SidebarMenuItem key="focus-tasks">
                    <SidebarMenuButton asChild>
                      <NavLink
                        to="/tools/wizzy-flow/my-tasks"
                        end
                        className="hover:bg-sidebar-accent/50 transition-all duration-200 rounded-lg"
                        activeClassName="bg-primary/15 text-primary font-medium"
                      >
                        <CheckSquare className={cn("transition-all duration-200", isCollapsed ? "mx-auto" : "mr-3")} size={18} />
                        {!isCollapsed && <span className="text-sm">Minhas Tarefas</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null
              ) : (
                menuItems.filter(canViewItem).map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/home" || item.url === "/workspace"}
                        className="hover:bg-sidebar-accent/50 transition-all duration-200 rounded-lg"
                        activeClassName="bg-primary/15 text-primary font-medium"
                      >
                        <item.icon className={cn("transition-all duration-200", isCollapsed ? "mx-auto" : "mr-3")} size={18} />
                        {!isCollapsed && <span className="text-sm">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isFocusMode ? (
          canViewFocusProjects ? (
            <SidebarGroup>
              <SidebarGroupLabel className={cn("text-xs uppercase tracking-wider font-medium flex items-center justify-between", isCollapsed && "text-center")}>
                <span>Projetos</span>
                {!isCollapsed && canCreateProjects && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5"
                    onClick={() => setCreateProjectOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {focusProjects.map((project: any) => {
                    const isActiveProject = activeProjectId === project.id;
                    const projectColor = project.color 
                      ? projectColors.find(c => c.name === project.color)?.value || projectColors[0].value
                      : projectColors[0].value;
                    
                    return (
                      <SidebarMenuItem key={project.id}>
                        <SidebarMenuButton 
                          onClick={() => handleFocusProjectClick(project.id)}
                          className={cn(
                            "hover:bg-sidebar-accent/50 transition-all duration-200 rounded-lg cursor-pointer",
                            isActiveProject && "bg-primary/15 text-primary font-medium",
                          )}
                        >
                          <span 
                            className={cn("h-2 w-2 rounded-full flex-shrink-0", isCollapsed ? "mx-auto" : "mr-3")} 
                            style={{ backgroundColor: projectColor }}
                          />
                          {!isCollapsed && (
                            <span className="text-sm truncate flex-1">{project.name}</span>
                          )}
                          {isCollapsed && <span className="sr-only">{project.name}</span>}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel className={cn("text-xs uppercase tracking-wider font-medium", isCollapsed && "text-center")}>
              Empresa
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {workspaceItems.filter(canViewItem).map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className="hover:bg-sidebar-accent/50 transition-all duration-200 rounded-lg"
                        activeClassName="bg-primary/15 text-primary font-medium"
                      >
                        <item.icon className={cn("transition-all duration-200", isCollapsed ? "mx-auto" : "mr-3")} size={18} />
                        {!isCollapsed && <span className="text-sm">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  onClick={signOut}
                  className="hover:bg-destructive/10 hover:text-destructive transition-all duration-200 rounded-lg"
                >
                  <LogOut className={cn("transition-all duration-200", isCollapsed ? "mx-auto" : "mr-3")} size={18} />
                  {!isCollapsed && <span className="text-sm">Sair</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Create Project Dialog */}
      <CreateProjectDialog 
        open={createProjectOpen} 
        onOpenChange={setCreateProjectOpen} 
      />
    </Sidebar>
  );
}
