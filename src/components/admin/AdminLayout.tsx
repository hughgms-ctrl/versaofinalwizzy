import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { WhatsAppDisconnectedBanner } from '@/components/layout/WhatsAppDisconnectedBanner';
import {
  LayoutDashboard, Building2, CreditCard, Key,
  ScrollText, LogOut, ChevronLeft, ChevronRight, MessageCircle, WalletCards, FlaskConical, ToggleLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import wizzyLogo from '@/assets/wizzy-logo.png';
import { useState } from 'react';
import { SecurityAlerts } from './SecurityAlerts';

interface AdminLayoutProps {
  children: ReactNode;
}

const adminNav = [
  { name: 'Visão Geral', href: '/admin', icon: LayoutDashboard },
  { name: 'Clientes', href: '/admin/clients', icon: Building2 },
  { name: 'Planos', href: '/admin/plans', icon: CreditCard },
  { name: 'Pagamentos', href: '/admin/payment-gateways', icon: WalletCards },
  { name: 'Crescimento', href: '/admin/growth', icon: FlaskConical },
  { name: 'IA & Custos', href: '/admin/ai/usage', icon: Key },
  { name: 'WhatsApp APIs', href: '/admin/whatsapp-apis', icon: MessageCircle },
  { name: 'Operações', href: '/admin/operations/governance', icon: ScrollText },
  { name: 'Funcionalidades', href: '/admin/feature-flags', icon: ToggleLeft },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const displayName = profile?.full_name || 'Admin';
  const initials = getInitials(displayName);

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Sidebar - same style as main app */}
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
              alt="Wizzy Admin"
              className="h-10 w-10 rounded-xl shadow-lg"
            />
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-lg font-bold text-sidebar-foreground">Wizzy</span>
                <span className="text-xs text-sidebar-foreground/60">Painel Admin</span>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
            {adminNav.map((item) => {
              const isActive = location.pathname === item.href
                || (item.href.startsWith('/admin/ai') && location.pathname.startsWith('/admin/ai'))
                || (item.href.startsWith('/admin/operations') && location.pathname.startsWith('/admin/operations'));
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
              onClick={() => setCollapsed(!collapsed)}
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

          {/* User Profile */}
          <div className={cn(
            "border-t border-sidebar-border p-4",
            collapsed && "px-2"
          )}>
            <div className={cn(
              "flex items-center gap-3 w-full rounded-lg p-1 -m-1",
              collapsed && "justify-center"
            )}>
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
                  <p className="text-xs text-sidebar-foreground/60 truncate">Administrador</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={cn(
        "transition-all duration-300 min-h-screen flex flex-col",
        collapsed ? "ml-20" : "ml-20 lg:ml-64"
      )}>
        <header className="h-16 border-b flex items-center justify-between px-6 bg-background/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-medium text-muted-foreground">
              {adminNav.find((n) => location.pathname === n.href || (n.href.startsWith('/admin/ai') && location.pathname.startsWith('/admin/ai')) || (n.href.startsWith('/admin/operations') && location.pathname.startsWith('/admin/operations')))?.name || 'Dashboard'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <SecurityAlerts />
            <Separator orientation="vertical" className="h-4" />
            <div className="text-xs text-muted-foreground hidden sm:block">
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
        </header>

        <WhatsAppDisconnectedBanner />
        <main className="flex-1 p-3 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
