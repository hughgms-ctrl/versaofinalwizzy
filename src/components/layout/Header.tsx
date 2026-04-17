import { Search, Plus, Moon, Sun, Volume2, VolumeOff, Eye, EyeOff } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NotificationDropdown } from './NotificationDropdown';
import { MobileNav } from './MobileNav';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showSearch?: boolean;
  showNewButton?: boolean;
  onNewClick?: () => void;
  newButtonLabel?: string;
}

export function Header({ 
  title, 
  subtitle, 
  showSearch = true, 
  showNewButton = false,
  onNewClick,
  newButtonLabel = "Novo"
}: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings } = useNotificationSettings();
  const { privacyMode, togglePrivacy } = usePrivacy();
  
  return (
    <header className="sticky top-0 z-30 flex h-14 md:h-16 items-center justify-between border-b border-border bg-card/95 backdrop-blur-xl px-3 md:px-6 shadow-sm">
      <div className="flex items-center gap-3">
        {/* Mobile Nav Trigger */}
        <MobileNav />
        
        <div className="flex flex-col">
          <h1 className="text-base md:text-xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-xs md:text-sm text-muted-foreground hidden sm:block">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {showSearch && (
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Buscar..." 
              className="w-48 lg:w-64 pl-10 bg-secondary/50 border-0 focus-visible:ring-1"
            />
          </div>
        )}

        {showNewButton && (
          <Button onClick={onNewClick} size="sm" className="gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{newButtonLabel}</span>
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${privacyMode ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={togglePrivacy}
            >
              {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {privacyMode ? 'Desativar modo privacidade' : 'Ativar modo privacidade (borrar dados)'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
            >
              {settings.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeOff className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {settings.soundEnabled ? 'Silenciar notificações' : 'Ativar som de notificações'}
          </TooltipContent>
        </Tooltip>

        <NotificationDropdown />
      </div>
    </header>
  );
}
