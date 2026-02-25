import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Kanban, 
  Bot, 
  Settings, 
  Users,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Workflow,
  CalendarClock,
  LogOut,
  User,
  BookUser,
  MousePointerClick,
  FileText,
  Plug
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useSidebarContext } from '@/contexts/SidebarContext';
import { useAuth } from '@/hooks/useAuth';
import { useUserPermissions, useCurrentUserRole } from '@/hooks/useUserPermissions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import wizzyLogo from '@/assets/wizzy-logo.png';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  module?: string; // Module key for permission check
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Conversas', href: '/conversations', icon: MessageSquare, module: 'conversations' },
  { name: 'Contatos', href: '/contacts', icon: BookUser, module: 'conversations' },
  { name: 'Pipeline', href: '/pipeline', icon: Kanban, module: 'pipeline' },
  { name: 'Fluxos', href: '/flows', icon: Workflow, module: 'flows' },
  { name: 'Widgets', href: '/widgets', icon: MousePointerClick, module: 'flows' },
  { name: 'Documentos', href: '/documents', icon: FileText, module: 'flows' },
  { name: 'Agendamentos', href: '/scheduled', icon: CalendarClock, module: 'flows' },
  { name: 'Agentes IA', href: '/agents', icon: Bot, module: 'agents' },
  { name: 'Equipe', href: '/team', icon: Users, module: 'team' },
  { name: 'Relatórios', href: '/reports', icon: BarChart3, module: 'reports' },
  { name: 'Integrações', href: '/integrations', icon: Plug, module: 'settings' },
  { name: 'Configurações', href: '/settings', icon: Settings, module: 'settings' },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { collapsed, toggleCollapsed } = useSidebarContext();
  const { data: userRole } = useCurrentUserRole();
  const { data: permissions } = useUserPermissions();
  const { signOut } = useAuth();

  // Check if user can access a module
  const canAccessModule = (module?: string) => {
    // No module specified = always visible (Dashboard, Equipe)
    if (!module) return true;
    // Owners and admins have full access
    if (userRole === 'owner' || userRole === 'admin') return true;
    // Check permissions
    if (!permissions) return false;
    
    const moduleMap: Record<string, keyof typeof permissions> = {
      conversations: 'can_access_conversations',
      pipeline: 'can_access_pipeline',
      flows: 'can_access_flows',
      reports: 'can_access_reports',
      agents: 'can_access_agents',
      settings: 'can_access_settings',
      team: 'can_access_team',
    };
    
    const key = moduleMap[module];
    return key ? !!permissions[key] : false;
  };

  const visibleNavigation = navigation.filter(item => canAccessModule(item.module));

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-sidebar transition-all duration-300 ease-in-out",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className={cn(
          "flex h-16 items-center border-b border-sidebar-border px-4",
          collapsed ? "justify-center" : "gap-3"
        )}>
          <img 
            src={wizzyLogo} 
            alt="Wizzy" 
            className="h-10 w-10 rounded-xl shadow-lg"
          />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-lg font-bold text-sidebar-foreground">Wizzy</span>
              <span className="text-xs text-sidebar-foreground/60">Gestão Inteligente</span>
            </div>
          )}
        </div>

        {/* Workspace Switcher */}
        <WorkspaceSwitcher collapsed={collapsed} />

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
          {visibleNavigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-primary shadow-sm" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  collapsed && "justify-center px-2"
                )}
              >
                <item.icon className={cn(
                  "h-5 w-5 flex-shrink-0 transition-colors",
                  isActive ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                )} />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            );
          })}

          {/* Logout below settings */}
          <Separator className="my-2 bg-sidebar-border" />
          <button
            onClick={handleLogout}
            className={cn(
              "w-full group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
              "text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive",
              collapsed && "justify-center px-2"
            )}
          >
            <LogOut className="h-5 w-5 flex-shrink-0 text-sidebar-foreground/60 group-hover:text-destructive" />
            {!collapsed && <span>Sair</span>}
          </button>
        </nav>

        {/* Collapse Button */}
        <div className="border-t border-sidebar-border p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            className={cn(
              "w-full text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              collapsed && "px-2"
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                <span>Recolher</span>
              </>
            )}
          </Button>
        </div>

        {/* User Profile - Bottom (clickable to go to profile page) */}
        <UserProfileSection collapsed={collapsed} />
      </div>
    </aside>
  );
}

function UserProfileSection({ collapsed }: { collapsed: boolean }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const displayName = profile?.full_name || 'Usuário';
  const initials = getInitials(displayName);

  const handleClick = () => {
    navigate('/profile');
  };

  return (
    <div className={cn(
      "border-t border-sidebar-border p-4",
      collapsed && "px-2"
    )}>
      <button 
        onClick={handleClick}
        className={cn(
          "flex items-center gap-3 w-full rounded-lg p-1 -m-1 hover:bg-sidebar-accent/50 transition-colors cursor-pointer",
          collapsed && "justify-center"
        )}
      >
        <div className="relative">
          <Avatar className="h-10 w-10">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-primary to-purple-500 text-primary-foreground font-semibold text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-sidebar" />
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{displayName}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">Online</p>
          </div>
        )}
      </button>
    </div>
  );
}
