import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarClock } from 'lucide-react';
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
  const { selectedWorkspace } = useWorkspaceContext();
  const activeOrganizationId = selectedWorkspace?.organization_id || profile?.organization_id || null;
  const { data: userRole } = useCurrentUserRole(activeOrganizationId);
  const { isTrial, trialEndsAt, planName } = useOrganizationPlan(activeOrganizationId);
  const canManageBilling = userRole === 'owner' || userRole === 'admin';

  if (!isTrial || !canManageBilling) return null;

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
