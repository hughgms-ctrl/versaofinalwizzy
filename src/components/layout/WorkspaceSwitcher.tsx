import { Building2, ChevronDown, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface WorkspaceSwitcherProps {
  collapsed: boolean;
}

export function WorkspaceSwitcher({ collapsed }: WorkspaceSwitcherProps) {
  const {
    selectedOrganization,
    selectedWorkspace,
    availableWorkspaces,
    setWorkspace,
    isAdmin,
  } = useWorkspaceContext();

  const hasAvailableWorkspaces = availableWorkspaces.length > 0;
  const label = selectedWorkspace?.name
    || (isAdmin ? 'Todos os Workspaces' : selectedOrganization?.name || 'Sem workspace liberado');

  return (
    <div className={cn('px-3 py-2', collapsed && 'px-2')}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/30 px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent/60',
              collapsed && 'justify-center px-2',
            )}
          >
            <div
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: selectedWorkspace?.color || 'hsl(var(--muted-foreground))' }}
            />
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate text-left font-medium text-sidebar-foreground">
                  {label}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {isAdmin && (
            <>
              <DropdownMenuItem onClick={() => setWorkspace(null)} className="gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span>Todos os Workspaces</span>
              </DropdownMenuItem>
              {hasAvailableWorkspaces && <DropdownMenuSeparator />}
            </>
          )}

          {availableWorkspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              onClick={() => setWorkspace(workspace.id)}
              className="gap-2"
            >
              <div
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: workspace.color }}
              />
              <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
            </DropdownMenuItem>
          ))}

          {!hasAvailableWorkspaces && (
            <DropdownMenuItem disabled className="gap-2 text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span>{isAdmin ? 'Nenhum workspace' : 'Nenhum workspace liberado'}</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
