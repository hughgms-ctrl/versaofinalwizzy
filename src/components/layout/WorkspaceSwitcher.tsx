import { ChevronDown, Building2, Globe, ShieldCheck, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface WorkspaceSwitcherProps {
  collapsed: boolean;
}

export function WorkspaceSwitcher({ collapsed }: WorkspaceSwitcherProps) {
  const {
    selectedOrganization,
    selectedOrganizationId,
    organizationMemberships,
    setOrganization,
    selectedWorkspace,
    availableWorkspaces,
    allAvailableWorkspaces,
    setWorkspace,
    isAdmin,
  } = useWorkspaceContext();
  const displayedWorkspaces = allAvailableWorkspaces.length > 0 ? allAvailableWorkspaces : availableWorkspaces;
  const hasAvailableWorkspaces = displayedWorkspaces.length > 0;
  const hasMultipleOrganizations = organizationMemberships.length > 1;
  const getMembership = (organizationId: string) => (
    organizationMemberships.find((membership) => membership.organization_id === organizationId)
  );
  const getWorkspaceOwnerLabel = (organizationId: string) => {
    const membership = getMembership(organizationId);
    const role = membership?.role;
    const isOwnerWorkspace = role === 'owner' || role === 'admin' || role === 'platform_admin';
    return {
      label: isOwnerWorkspace ? 'Proprietario' : 'Terceiro',
      icon: isOwnerWorkspace ? ShieldCheck : Users,
    };
  };

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
                  {selectedWorkspace?.name || selectedOrganization?.name || (isAdmin ? 'Todos os Workspaces' : 'Sem workspace liberado')}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/60 flex-shrink-0" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {hasMultipleOrganizations && (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Organizacoes</DropdownMenuLabel>
              {organizationMemberships.map((membership) => (
                <DropdownMenuItem
                  key={membership.organization_id}
                  onClick={() => setOrganization(membership.organization_id)}
                  className="gap-2"
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{membership.organization?.name || 'Empresa'}</span>
                  <span className="ml-auto text-[10px] uppercase text-muted-foreground">
                    {membership.role === 'owner' || membership.role === 'admin' || membership.role === 'platform_admin' ? 'proprio' : 'terceiro'}
                  </span>
                  {membership.organization_id === selectedOrganizationId && (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          {isAdmin && (
            <>
              <DropdownMenuItem onClick={() => setWorkspace(null)} className="gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span>Todos os Workspaces</span>
              </DropdownMenuItem>
              {hasAvailableWorkspaces && <DropdownMenuSeparator />}
            </>
          )}
          {hasAvailableWorkspaces && hasMultipleOrganizations && (
            <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
          )}
          {displayedWorkspaces.map((workspace) => {
            const owner = getWorkspaceOwnerLabel(workspace.organization_id);
            const OwnerIcon = owner.icon;
            return (
              <DropdownMenuItem
                key={workspace.id}
                onClick={() => setWorkspace(workspace.id)}
                className="gap-2"
              >
                <div
                  className="h-3 w-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: workspace.color }}
                />
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                {hasMultipleOrganizations && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <OwnerIcon className="h-3 w-3" />
                    <span className="max-w-20 truncate">{owner.label}</span>
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
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
