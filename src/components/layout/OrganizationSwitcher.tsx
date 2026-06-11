import { useState } from 'react';
import { Building2, ChevronDown, Crown, Plus, Sparkles, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { cn } from '@/lib/utils';

const ownerRoles = new Set(['owner', 'admin', 'platform_admin']);

export function OrganizationSwitcher() {
  const navigate = useNavigate();
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);
  const {
    selectedOrganization,
    selectedOrganizationId,
    organizationMemberships,
    setOrganization,
  } = useWorkspaceContext();

  const hasOwnOrganization = organizationMemberships.some((membership) => ownerRoles.has(membership.role));
  const selectedName = selectedOrganization?.name || 'Organizacao';

  const handleCreateOrganization = () => {
    setSubscriptionDialogOpen(true);
  };

  const handleSubscribeNow = () => {
    setSubscriptionDialogOpen(false);
    navigate('/plans?intent=create-organization', { state: { reason: 'create_organization' } });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="hidden min-w-0 max-w-64 justify-between gap-2 bg-background/70 md:flex"
          >
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-left">{selectedName}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-72">
          {organizationMemberships.map((membership) => {
            const isOwn = ownerRoles.has(membership.role);
            const isSelected = membership.organization_id === selectedOrganizationId;
            const Icon = isOwn ? Crown : Users;
            return (
              <DropdownMenuItem
                key={membership.organization_id}
                onClick={() => setOrganization(membership.organization_id)}
                className="gap-2"
              >
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{membership.organization?.name || 'Empresa'}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isOwn ? 'Sua organizacao' : 'Voce participa desta organizacao'}
                  </TooltipContent>
                </Tooltip>
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    isSelected ? 'bg-primary' : 'bg-transparent',
                  )}
                />
              </DropdownMenuItem>
            );
          })}

          {!hasOwnOrganization && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleCreateOrganization} className="gap-2">
                <Plus className="h-4 w-4 text-muted-foreground" />
                <span>Criar minha organizacao</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={subscriptionDialogOpen} onOpenChange={setSubscriptionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <DialogTitle>Voce ainda nao possui uma assinatura</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              Por enquanto, voce participa apenas dos workspaces de outras organizacoes e usa o Wizzy dentro dos limites definidos por elas.
              Para criar sua propria organizacao e usar todos os recursos do Wizzy, escolha um plano para sua conta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setSubscriptionDialogOpen(false)}>
              Agora nao
            </Button>
            <Button onClick={handleSubscribeNow}>
              Assinar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
