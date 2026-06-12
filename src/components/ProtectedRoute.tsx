import { ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, Building2, Loader2 } from 'lucide-react';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { clearStoredEntryAssignment, getStoredEntryAssignment, hasEntryLimitedAccessAssignment, isEntryTrialExpired } from '@/lib/entryFlow';
import { getDefaultAppRoute, isManagerRole } from '@/lib/defaultAppRoute';
import { useOrganizationPlan } from '@/hooks/useOrganizationPlan';
import { useCurrentUserRole, useUserPermissions } from '@/hooks/useUserPermissions';

interface ProtectedRouteProps {
  children: ReactNode;
}

function getPlanModuleForPath(pathname: string): string | null {
  if (pathname.startsWith('/tools/documents') || pathname.startsWith('/documents')) return 'documents';
  if (pathname.startsWith('/tools/buttons') || pathname.startsWith('/widgets')) return 'widgets';
  if (pathname.startsWith('/tools/quiz')) return 'quiz';
  if (pathname.startsWith('/tools/wizzy-flow')) return 'wizzy_flow';
  if (pathname.startsWith('/tools/carousel')) return 'carousel';
  if (pathname.startsWith('/tools/cnis')) return 'cnis';
  if (pathname.startsWith('/tools')) return 'tools';
  if (pathname.startsWith('/conversations')) return 'conversations';
  if (pathname.startsWith('/contacts')) return 'contacts';
  if (pathname.startsWith('/groups')) return 'groups';
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.startsWith('/pipeline')) return 'pipeline';
  if (pathname.startsWith('/flows') || pathname.startsWith('/flow-builder')) return 'flows';
  if (pathname.startsWith('/campaigns')) return 'campaigns';
  if (pathname.startsWith('/scheduled')) return 'scheduled';
  if (pathname.startsWith('/agents') || pathname.startsWith('/master-agent')) return 'agents';
  if (pathname.startsWith('/team')) return 'team';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/integrations')) return 'integrations';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  return null;
}

function getPermissionModuleForPath(pathname: string): string | null {
  if (pathname.startsWith('/tools/documents') || pathname.startsWith('/documents')) return 'tool_documents';
  if (pathname.startsWith('/tools/buttons') || pathname.startsWith('/widgets')) return 'tool_widgets';
  if (pathname.startsWith('/tools/quiz')) return 'tool_quiz';
  if (pathname.startsWith('/tools/wizzy-flow')) return 'tool_wizzy_flow';
  if (pathname.startsWith('/tools/carousel')) return 'tool_carousel';
  if (pathname.startsWith('/tools/cnis')) return 'tool_cnis';
  if (pathname.startsWith('/tools')) return 'tools';
  if (pathname.startsWith('/conversations')) return 'conversations';
  if (pathname.startsWith('/contacts')) return 'contacts';
  if (pathname.startsWith('/groups')) return 'groups';
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.startsWith('/pipeline')) return 'pipeline';
  if (pathname.startsWith('/flows') || pathname.startsWith('/flow-builder')) return 'flows';
  if (pathname.startsWith('/campaigns')) return 'campaigns';
  if (pathname.startsWith('/scheduled')) return 'scheduled';
  if (pathname.startsWith('/agents') || pathname.startsWith('/master-agent')) return 'agents';
  if (pathname.startsWith('/team')) return 'team';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/integrations')) return 'integrations';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  return null;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const {
    selectedOrganization,
    selectedOrganizationId,
    availableWorkspaces,
    currentOrganizationRole,
    hasExternalOrganizationMembership,
    loading: workspaceLoading,
  } = useWorkspaceContext();
  const location = useLocation();
  const activeOrganizationId = selectedOrganizationId || profile?.organization_id || null;
  const routePlanModule = getPlanModuleForPath(location.pathname);
  const routePermissionModule = getPermissionModuleForPath(location.pathname);
  const { canAccessModule: canAccessPlanModule, isLoading: modulePlanLoading } = useOrganizationPlan(activeOrganizationId);
  const { data: userRole, isLoading: roleLoading } = useCurrentUserRole(activeOrganizationId);
  const { data: permissions, isLoading: permissionsLoading } = useUserPermissions();

  const allowedWithoutPlan = ['/subscription', '/plans', '/checkout-notice', '/profile'];
  const { data: onboardingPlan, isLoading: planLoading, error: planError } = useQuery({
    queryKey: ['onboarding-org-plan', activeOrganizationId],
    queryFn: async () => {
      if (!activeOrganizationId) return null;

      const { data, error } = await supabase
        .from('organization_plans')
        .select('id, status, payment_status, trial_ends_at')
        .eq('organization_id', activeOrganizationId)
        .maybeSingle();

      if (error) throw error;
      if (data) return data;

      const { data: usageData, error: usageError } = await supabase.functions.invoke('organization-usage', {
        body: { organization_id: activeOrganizationId },
      });

      if (usageError) throw usageError;
      return (usageData as any)?.planRow || null;
    },
    enabled: !!user && !!activeOrganizationId,
  });
  const entryAssignment = getStoredEntryAssignment();
  const hasEntryLimitedAccess = hasEntryLimitedAccessAssignment();
  const paymentStatus = String((onboardingPlan as any)?.payment_status || (onboardingPlan as any)?.status || '').toLowerCase();
  const trialEndsAt = (onboardingPlan as any)?.trial_ends_at || null;
  const hasValidTrial = ['trial', 'trialing'].includes(paymentStatus)
    && (!trialEndsAt || new Date(trialEndsAt).getTime() > Date.now());
  const hasActiveAccess = Boolean(onboardingPlan)
    && (['paid', 'manual', 'active'].includes(paymentStatus) || hasValidTrial);
  const trialExpired = ['trial', 'trialing'].includes(paymentStatus)
    && trialEndsAt
    && new Date(trialEndsAt).getTime() <= Date.now()
    && entryAssignment?.config?.block_after_trial !== false;
  const localTrialExpired = !onboardingPlan && isEntryTrialExpired();

  useEffect(() => {
    const isTrialPlan = ['trial', 'trialing'].includes(paymentStatus);
    const hasGrantedAccess = ['paid', 'manual', 'active'].includes(paymentStatus);
    if (onboardingPlan && entryAssignment && (!isTrialPlan || hasGrantedAccess)) {
      clearStoredEntryAssignment();
    }
  }, [onboardingPlan, entryAssignment?.flow_type, paymentStatus]);

  if (
    loading
    || (!!user && !profile)
    || (!!user && workspaceLoading)
    || (!!user && !!activeOrganizationId && (planLoading || (!!routePlanModule && modulePlanLoading) || (!!routePermissionModule && (roleLoading || permissionsLoading))))
  ) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const isManager = isManagerRole(currentOrganizationRole);
  const isExternalOrganization = Boolean(selectedOrganizationId && selectedOrganizationId !== profile?.organization_id);
  const isWorkspaceScopedRoute = Boolean(routePlanModule || routePermissionModule);
  const shouldShowNoWorkspaceMessage = Boolean(
    activeOrganizationId
    && isWorkspaceScopedRoute
    && !isManager
    && availableWorkspaces.length === 0
    && (hasExternalOrganizationMembership || isExternalOrganization)
  );

  if (shouldShowNoWorkspaceMessage) {
    return (
      <NoWorkspaceAccessMessage organizationName={selectedOrganization?.name || 'sua organizacao'} />
    );
  }

  const isAllowedOnboardingPath = allowedWithoutPlan.some((path) => (
    location.pathname === path || location.pathname.startsWith(`${path}/`)
  ));
  if (activeOrganizationId && !hasActiveAccess && !isAllowedOnboardingPath && !isManager) {
    return (
      <NoWorkspaceAccessMessage
        organizationName={selectedOrganization?.name || 'sua organizacao'}
        billingBlocked
      />
    );
  }

  if (activeOrganizationId && !hasActiveAccess && !isAllowedOnboardingPath && !hasEntryLimitedAccess) {
    return <Navigate to="/plans" replace state={{ from: location }} />;
  }

  if ((trialExpired || planError || (activeOrganizationId && !onboardingPlan && localTrialExpired)) && !isAllowedOnboardingPath) {
    return <Navigate to="/plans" replace state={{ from: location, reason: 'trial_expired' }} />;
  }

  if (routePlanModule && !isAllowedOnboardingPath && !canAccessPlanModule(routePlanModule)) {
    return <Navigate to="/plans" replace state={{ from: location, reason: 'module_locked', module: routePlanModule }} />;
  }

  if (routePermissionModule && !isAllowedOnboardingPath) {
    const isManager = isManagerRole(userRole);
    const permissionMap: Record<string, keyof NonNullable<typeof permissions>> = {
      dashboard: 'can_access_dashboard',
      conversations: 'can_access_conversations',
      contacts: 'can_access_contacts',
      groups: 'can_access_groups',
      pipeline: 'can_access_pipeline',
      flows: 'can_access_flows',
      campaigns: 'can_access_campaigns',
      reports: 'can_access_reports',
      agents: 'can_access_agents',
      settings: 'can_access_settings',
      integrations: 'can_access_integrations',
      team: 'can_access_team',
      scheduled: 'can_access_scheduled',
      calendar: 'can_access_calendar',
      tools: 'can_access_tools',
      tool_widgets: 'can_access_tool_widgets',
      tool_documents: 'can_access_tool_documents',
      tool_quiz: 'can_access_tool_quiz',
      tool_wizzy_flow: 'can_access_tool_wizzy_flow',
      tool_carousel: 'can_access_tool_carousel',
      tool_cnis: 'can_access_tool_cnis',
    };
    const permissionKey = permissionMap[routePermissionModule];
    const hasParentToolPermission = !routePermissionModule.startsWith('tool_') || Boolean(permissions?.can_access_tools);
    const hasPermission = isManager || (permissionKey ? Boolean(permissions?.[permissionKey]) && hasParentToolPermission : false);
    if (!hasPermission) {
      const fallbackRoute = getDefaultAppRoute({
        role: userRole,
        permissions,
        canAccessPlanModule,
      });
      return <Navigate to={fallbackRoute} replace state={{ from: location, reason: 'permission_denied' }} />;
    }
  }

  return <>{children}</>;
}

function NoWorkspaceAccessMessage({
  organizationName,
  billingBlocked = false,
}: {
  organizationName: string;
  billingBlocked?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          {billingBlocked ? (
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
          ) : (
            <Building2 className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <h1 className="text-lg font-semibold text-foreground">
          {billingBlocked ? 'Acesso pausado pela organizacao' : 'Nenhum workspace liberado'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {billingBlocked
            ? `A organizacao ${organizationName} precisa regularizar o plano para liberar o acesso. Fale com o administrador.`
            : `Voce foi adicionada a ${organizationName}, mas ainda nao esta em nenhum workspace dessa organizacao. Faca contato com o administrador para liberar seu acesso.`}
        </p>
      </div>
    </div>
  );
}
