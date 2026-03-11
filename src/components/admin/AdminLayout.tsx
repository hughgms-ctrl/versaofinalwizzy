import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, CreditCard, Key, Shield,
  ScrollText, TrendingUp, LogOut, ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface AdminLayoutProps {
  children: ReactNode;
}

const adminNav = [
  { name: 'Visão Geral', href: '/admin', icon: LayoutDashboard },
  { name: 'Clientes', href: '/admin/clients', icon: Building2 },
  { name: 'Planos', href: '/admin/plans', icon: CreditCard },
  { name: 'API & Custos', href: '/admin/api', icon: Key },
  { name: 'Governança', href: '/admin/governance', icon: ScrollText },
  { name: 'Segurança', href: '/admin/security', icon: Shield },
  { name: 'Histórico', href: '/admin/history', icon: TrendingUp },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen flex bg-slate-950">
      {/* Admin Sidebar */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-slate-900 border-r border-slate-800">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-orange-500 shadow-lg">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-white">Wizzy Admin</span>
              <span className="text-xs text-slate-500">Painel da Plataforma</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
            {adminNav.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-orange-500/10 text-orange-400 shadow-sm"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  )}
                >
                  <item.icon className={cn(
                    "h-5 w-5 flex-shrink-0 transition-colors",
                    isActive ? "text-orange-400" : "text-slate-500 group-hover:text-slate-300"
                  )} />
                  <span>{item.name}</span>
                </Link>
              );
            })}

            <Separator className="my-4 bg-slate-800" />

            <button
              onClick={handleLogout}
              className="w-full group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-slate-400 hover:bg-red-500/10 hover:text-red-400"
            >
              <LogOut className="h-5 w-5 flex-shrink-0 text-slate-500 group-hover:text-red-400" />
              <span>Sair</span>
            </button>
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 flex-1 min-h-screen">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
