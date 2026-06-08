import { ChevronDown, Building2, Globe } from 'lucide-react';
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
  const { selectedWorkspace, availableWorkspaces, setWorkspace, isAdmin } = useWorkspaceContext();
  const hasAvailableWorkspaces = availableWorkspaces.length > 0;

  return (
    <div className={cn("px-3 py-2", collapsed && "px-2")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-2 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/30 px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent/60",
              collapsed && "justify-center px-2"
            )}
          >
            <div
              className="h-3 w-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: selectedWorkspace?.color || 'hsl(var(--muted-foreground))' }}
            />
            {!collapsed && (
              <>
                <span className="truncate flex-1 text-left text-sidebar-foreground font-medium">
                  {selectedWorkspace?.name || (isAdmin ? 'Todos os Workspaces' : 'Sem workspace liberado')}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/60 flex-shrink-0" />
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
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: workspace.color }}
              />
              <span className="truncate">{workspace.name}</span>
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
