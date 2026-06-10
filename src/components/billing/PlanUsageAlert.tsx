import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrganizationPlan } from '@/hooks/useOrganizationPlan';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentUserRole } from '@/hooks/useUserPermissions';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

function formatDate(date?: string | null) {
  if (!date) return 'data nao definida';
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function PlanUsageAlert() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { selectedOrganizationId, selectedWorkspace } = useWorkspaceContext();
  const activeOrganizationId = selectedOrganizationId || selectedWorkspace?.organization_id || profile?.organization_id || null;
  const { data: userRole } = useCurrentUserRole(activeOrganizationId);
  const { isTrial, trialEndsAt, planName, usage } = useOrganizationPlan(activeOrganizationId);
  const canManageBilling = userRole === 'owner' || userRole === 'admin' || userRole === 'platform_admin';

  if (!canManageBilling) return null;

  const exceededResources = [
    usage.isTeamAtLimit && usage.teamLimit > 0 ? `usuários (${usage.teamCount}/${usage.teamLimit})` : null,
    usage.isWorkspaceAtLimit && usage.workspaceLimit > 0 ? `workspaces (${usage.workspaceCount}/${usage.workspaceLimit})` : null,
    usage.isWhatsappNumberAtLimit && usage.whatsappNumberLimit > 0 ? `números WhatsApp (${usage.whatsappNumberCount}/${usage.whatsappNumberLimit})` : null,
    usage.isStorageAtLimit && usage.storageLimit > 0 ? `armazenamento` : null,
  ].filter(Boolean);

  if (exceededResources.length > 0) {
    return (
      <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Limite do plano atingido</p>
              <p className="text-xs text-amber-900/80 dark:text-amber-100/80">
                Sua organização atingiu o limite de {exceededResources.join(', ')}. Faça upgrade para liberar novos recursos.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate('/plans')} className="w-fit gap-2 border-amber-500/40 bg-background">
            Fazer upgrade
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (!isTrial) return null;

  return (
    <div className="border-b border-sky-500/20 bg-sky-500/10 px-3 py-2 text-sm text-sky-950 dark:text-sky-100 md:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Teste gratis ativo</p>
            <p className="text-xs text-sky-900/80 dark:text-sky-100/80">
              Plano {planName || 'atual'} liberado ate {formatDate(trialEndsAt)}.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate('/plans')} className="w-fit gap-2 border-sky-500/40 bg-background">
          Selecionar plano
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
