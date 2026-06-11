import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { PlanUsageAlert } from '@/components/billing/PlanUsageAlert';

import { cn } from '@/lib/utils';
import { useSidebarContext } from '@/contexts/SidebarContext';

interface MainLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showSearch?: boolean;
  showNewButton?: boolean;
  onNewClick?: () => void;
  newButtonLabel?: string;
  fullWidth?: boolean;
  hideSidebar?: boolean;
  backTo?: string;
  backLabel?: string;
}

export function MainLayout({ 
  children, 
  title, 
  subtitle,
  showSearch,
  showNewButton,
  onNewClick,
  newButtonLabel,
  fullWidth = false,
  hideSidebar = false,
  backTo,
  backLabel
}: MainLayoutProps) {
  const { collapsed } = useSidebarContext();

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar - hidden on mobile */}
      {!hideSidebar && (
        <div className="hidden md:block">
          <Sidebar />
        </div>
      )}
      <div className={cn(
        "transition-all duration-300",
        hideSidebar ? "md:pl-0" : collapsed ? "md:pl-20" : "md:pl-20 lg:pl-64"
      )}>
        
        <Header 
          title={title} 
          subtitle={subtitle}
          showSearch={showSearch}
          showNewButton={showNewButton}
          onNewClick={onNewClick}
          newButtonLabel={newButtonLabel}
          backTo={backTo}
          backLabel={backLabel}
        />
        <PlanUsageAlert />
        <main className={cn(
          "page-transition",
          fullWidth ? "p-0" : "p-3 md:p-6"
        )}>
          {children}
        </main>
      </div>
    </div>
  );
}
