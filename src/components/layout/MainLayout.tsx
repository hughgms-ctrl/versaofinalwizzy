import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

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
}

export function MainLayout({ 
  children, 
  title, 
  subtitle,
  showSearch,
  showNewButton,
  onNewClick,
  newButtonLabel,
  fullWidth = false
}: MainLayoutProps) {
  const { collapsed } = useSidebarContext();

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar - hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className={cn(
        "transition-all duration-300",
        collapsed ? "md:pl-20" : "md:pl-20 lg:pl-64"
      )}>
        
        <Header 
          title={title} 
          subtitle={subtitle}
          showSearch={showSearch}
          showNewButton={showNewButton}
          onNewClick={onNewClick}
          newButtonLabel={newButtonLabel}
        />
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
