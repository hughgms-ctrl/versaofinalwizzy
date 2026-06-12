import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Kanban,
  Bot,
  Settings,
  Users,
  BarChart3,
  Workflow,
  CalendarClock,
  Calendar,
  LogOut,
  Menu,
  BookUser,
  UsersRound,
  Megaphone,
  Plug,
  MousePointerClick,
  Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { useUserPermissions, useCurrentUserRole } from '@/hooks/useUserPermissions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import wizzyLogo from '@/assets/wizzy-logo.png';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { OrganizationSwitcher } from './OrganizationSwitcher';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useOrganizationPlan } from '@/hooks/useOrganizationPlan';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  module?: string;
  planModule?: string;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard', planModule: 'dashboard' },
  { name: 'Conversas', href: '/conversations', icon: MessageSquare, module: 'conversations', planModule: 'conversations' },
  { name: 'Contatos', href: '/contacts', icon: BookUser, module: 'contacts', planModule: 'contacts' },
  { name: 'Grupos', href: '/groups', icon: UsersRound, module: 'groups', planModule: 'groups' },
  { name: 'Agenda', href: '/calendar', icon: Calendar, module: 'calendar', planModule: 'calendar' },
  { name: 'Pipeline', href: '/pipeline', icon: Kanban, module: 'pipeline', planModule: 'pipeline' },
  { name: 'Fluxos', href: '/flows', icon: Workflow, module: 'flows', planModule: 'flows' },
  { name: 'Campanhas', href: '/campaigns', icon: Megaphone, module: 'campaigns', planModule: 'campaigns' },
  { name: 'Ferramentas', href: '/tools', icon: MousePointerClick, module: 'tools', planModule: 'tools' },
  { name: 'Programados', href: '/scheduled', icon: CalendarClock, module: 'scheduled', planModule: 'scheduled' },
  { name: 'Agentes IA', href: '/agents', icon: Bot, module: 'agents', planModule: 'agents' },
  { name: 'Equipe', href: '/team', icon: Users, module: 'team', planModule: 'team' },
  { name: 'Relatórios', href: '/reports', icon: BarChart3, module: 'reports', planModule: 'reports' },
  { name: 'Integrações', href: '/integrations', icon: Plug, module: 'integrations', planModule: 'integrations' },
  { name: 'Configurações', href: '/settings', icon: Settings, module: 'settings', planModule: 'settings' },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { data: userRole } = useCurrentUserRole();
  const { data: permissions } = useUserPermissions();
  const { signOut, profile } = useAuth();
  const { selectedOrganizationId } = useWorkspaceContext();
  const activeOrganizationId = selectedOrganizationId || profile?.organization_id || null;
  const { canAccessModule: canAccessPlanModule } = useOrganizationPlan(activeOrganizationId);

  const canAccessModule = (module?: string) => {
    if (!module) return true;
    if (userRole === 'owner' || userRole === 'admin' || userRole === 'platform_admin') return true;
    if (!permissions) return false;

    const moduleMap: Record<string, keyof typeof permissions> = {
      dashboard: 'can_access_dashboard',
      conversations: 'can_access_conversations',
      contacts: 'can_access_contacts',
      groups: 'can_access_groups',
      pipeline: 'can_access_pipeline',
      flows: 'can_access_flows',
      campaigns: 'can_access_campaigns',
      reports: 'can_access_reports',
      agents: 'can_access_agents',
      settings: 'can_access_settings',
      integrations: 'can_access_integrations',
      team: 'can_access_team',
      scheduled: 'can_access_scheduled',
      calendar: 'can_access_calendar',
      operations: 'can_access_operations',
      tools: 'can_access_tools',
    };

    const key = moduleMap[module];
    return key ? !!permissions[key] : false;
  };

  const visibleNavigation = navigation.filter(item => canAccessModule(item.module));

  const handleLogout = async () => {
    await signOut();
    setOpen(false);
  };

  const handleNavigate = (item: NavItem) => {
    const isLocked = item.planModule ? !canAccessPlanModule(item.planModule) : false;
    navigate(isLocked ? '/plans' : item.href);
    setOpen(false);
  };

  const handleNavigateTo = (href: string) => {
    navigate(href);
    setOpen(false);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-3">
            <img
              src={wizzyLogo}
              alt="Wizzy"
              className="h-8 w-8 rounded-lg"
            />
            <span className="text-lg font-bold">Wizzy</span>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-2 border-b border-border p-3">
          <OrganizationSwitcher
            contentAlign="start"
            triggerClassName="flex h-10 w-full max-w-none rounded-lg px-3"
          />
          <WorkspaceSwitcher collapsed={false} />
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {visibleNavigation.map((item) => {
            const isActive = location.pathname === item.href;
            const isLocked = item.planModule ? !canAccessPlanModule(item.planModule) : false;
            return (
              <button
                key={item.name}
                onClick={() => handleNavigate(item)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isLocked
                    ? "text-muted-foreground/50"
                    : isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="flex-1 text-left">{item.name}</span>
                {isLocked && <Lock className="h-3.5 w-3.5" />}
              </button>
            );
          })}

          <Separator className="my-4" />

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span>Sair</span>
          </button>
        </nav>

        {/* User Profile */}
        <div className="border-t border-border p-4">
          <button
            onClick={() => handleNavigateTo('/profile')}
            className="flex items-center gap-3 w-full rounded-lg p-1 -m-1 hover:bg-muted transition-colors"
          >
            <Avatar className="h-10 w-10">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-purple-500 text-primary-foreground font-semibold text-sm">
                {getInitials(profile?.full_name || 'U')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium truncate">{profile?.full_name || 'Usuário'}</p>
              <p className="text-xs text-muted-foreground truncate">Ver perfil</p>
            </div>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
