import { useState, useMemo } from 'react';
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
  ChevronDown,
  Workflow,
  CalendarClock,
  LogOut,
  User,
  BookUser,
  MousePointerClick,
  Plug,
  Megaphone,
  Calendar,
  Lock,
  Crown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useSidebarContext } from '@/contexts/SidebarContext';
import { useAuth } from '@/hooks/useAuth';
import { useUserPermissions, useCurrentUserRole } from '@/hooks/useUserPermissions';
import { useOrganizationPlan } from '@/hooks/useOrganizationPlan';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import wizzyLogo from '@/assets/wizzy-logo.png';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import UpgradeModal from '@/components/billing/UpgradeModal';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  module?: string;
  planModule?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navigationGroups: NavGroup[] = [
  {
    label: 'Principal',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard, module: 'dashboard' },
      { name: 'Conversas', href: '/conversations', icon: MessageSquare, module: 'conversations', planModule: 'conversations' },
      { name: 'Contatos', href: '/contacts', icon: BookUser, module: 'conversations', planModule: 'contacts' },
    ],
  },
  {
    label: 'Automação',
    items: [
      { name: 'Fluxos', href: '/flows', icon: Workflow, module: 'flows', planModule: 'flows' },
      { name: 'Campanhas', href: '/campaigns', icon: Megaphone, module: 'flows', planModule: 'campaigns' },
      { name: 'Agendamentos', href: '/scheduled', icon: CalendarClock, module: 'scheduled', planModule: 'scheduled' },
      { name: 'Agentes IA', href: '/agents', icon: Bot, module: 'agents', planModule: 'agents' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { name: 'Pipeline', href: '/pipeline', icon: Kanban, module: 'pipeline', planModule: 'pipeline' },
      { name: 'Agenda', href: '/calendar', icon: Calendar, module: 'calendar', planModule: 'calendar' },
      { name: 'Ferramentas', href: '/tools', icon: MousePointerClick, module: 'flows', planModule: 'tools' },
      { name: 'Relatórios', href: '/reports', icon: BarChart3, module: 'reports', planModule: 'reports' },
    ],
  },
  {
    label: 'Administração',
    items: [
      { name: 'Equipe', href: '/team', icon: Users, module: 'team', planModule: 'team' },
      { name: 'Integrações', href: '/integrations', icon: Plug, module: 'settings', planModule: 'integrations' },
      { name: 'Configurações', href: '/settings', icon: Settings, module: 'settings', planModule: 'settings' },
    ],
  },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { collapsed, toggleCollapsed } = useSidebarContext();
  const { data: userRole } = useCurrentUserRole();
  const { data: permissions } = useUserPermissions();
  const { signOut } = useAuth();
  const { canAccessModule: canAccessPlanModule } = useOrganizationPlan();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [blockedModule, setBlockedModule] = useState<string | undefined>();

  const canAccessModule = (module?: string) => {
    if (!module) return true;
    if (userRole === 'owner' || userRole === 'admin') return true;
    if (!permissions) return false;

    const moduleMap: Record<string, keyof typeof permissions> = {
      dashboard: 'can_access_dashboard',
      conversations: 'can_access_conversations',
      pipeline: 'can_access_pipeline',
      flows: 'can_access_flows',
      reports: 'can_access_reports',
      agents: 'can_access_agents',
      settings: 'can_access_settings',
      team: 'can_access_team',
      scheduled: 'can_access_scheduled',
      calendar: 'can_access_calendar',
    };

    const key = moduleMap[module];
    return key ? !!permissions[key] : false;
  };

  const isItemActive = (href: string) =>
    href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);

  const defaultOpenGroups = useMemo(() => {
    const open: Record<string, boolean> = {};
    navigationGroups.forEach((group) => {
      open[group.label] = group.items.some((item) => isItemActive(item.href));
    });
    return open;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navigationGroups.forEach((g) => (initial[g.label] = true));
    return initial;
  });

  // Keep group with active route open
  useMemo(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      Object.entries(defaultOpenGroups).forEach(([label, active]) => {
        if (active) next[label] = true;
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const handleLogout = async () => {
    await signOut();
  };

  const handleNavClick = (e: React.MouseEvent, item: NavItem) => {
    if (item.planModule && !canAccessPlanModule(item.planModule)) {
      e.preventDefault();
      setBlockedModule(item.name);
      setUpgradeOpen(true);
    }
  };

  const filteredGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessModule(item.module)),
    }))
    .filter((group) => group.items.length > 0);

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
          {filteredGroups.map((group, groupIdx) => (
            <div key={group.label} className={cn(groupIdx > 0 && "mt-2")}>
              {/* Group label - hidden when collapsed */}
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors"
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-200",
                      !openGroups[group.label] && "-rotate-90"
                    )}
                  />
                </button>
              )}

              {/* Group items */}
              <div
                className={cn(
                  "space-y-0.5 overflow-hidden transition-all duration-200",
                  !collapsed && !openGroups[group.label] && "max-h-0",
                  (!collapsed && openGroups[group.label]) || collapsed ? "max-h-[500px]" : ""
                )}
              >
                {group.items.map((item) => {
                  const isActive = isItemActive(item.href);
                  const isLocked = item.planModule ? !canAccessPlanModule(item.planModule) : false;
                  return (
                    <Link
                      key={item.name}
                      to={isLocked ? '#' : item.href}
                      onClick={(e) => handleNavClick(e, item)}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                        isLocked
                          ? "text-sidebar-foreground/30 cursor-pointer"
                          : isActive
                            ? "bg-sidebar-accent text-sidebar-primary shadow-sm"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                        collapsed && "justify-center px-2"
                      )}
                    >
                      <item.icon className={cn(
                        "h-5 w-5 flex-shrink-0 transition-colors",
                        isLocked
                          ? "text-sidebar-foreground/30"
                          : isActive ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                      )} />
                      {!collapsed && (
                        <span className="flex-1">{item.name}</span>
                      )}
                      {!collapsed && isLocked && (
                        <Lock className="h-3.5 w-3.5 text-sidebar-foreground/30" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          {/* Plans link */}
          <Separator className="my-2 bg-sidebar-border" />
          <Link
            to="/plans"
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
              location.pathname === '/plans'
                ? "bg-sidebar-accent text-sidebar-primary shadow-sm"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              collapsed && "justify-center px-2"
            )}
          >
            <Crown className={cn(
              "h-5 w-5 flex-shrink-0 transition-colors",
              location.pathname === '/plans' ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
            )} />
            {!collapsed && <span>Planos</span>}
          </Link>

          {/* Logout */}
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
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} moduleName={blockedModule} />
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
