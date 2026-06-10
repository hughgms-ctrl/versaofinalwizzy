import { ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { clearStoredEntryAssignment, getStoredEntryAssignment, hasEntryLimitedAccessAssignment, isEntryTrialExpired } from '@/lib/entryFlow';
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
  if (pathname.startsWith('/tools')) return 'tools';
  if (pathname.startsWith('/conversations') || pathname.startsWith('/contacts') || pathname.startsWith('/groups')) return 'conversations';
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
  if (pathname.startsWith('/conversations') || pathname.startsWith('/contacts') || pathname.startsWith('/groups')) return 'conversations';
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.startsWith('/pipeline')) return 'pipeline';
  if (pathname.startsWith('/flows') || pathname.startsWith('/flow-builder') || pathname.startsWith('/campaigns') || pathname.startsWith('/tools')) return 'flows';
  if (pathname.startsWith('/scheduled')) return 'scheduled';
  if (pathname.startsWith('/agents') || pathname.startsWith('/master-agent')) return 'agents';
  if (pathname.startsWith('/team')) return 'team';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/integrations') || pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  return null;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const { selectedOrganizationId, loading: workspaceLoading } = useWorkspaceContext();
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

  const isAllowedOnboardingPath = allowedWithoutPlan.some((path) => (
    location.pathname === path || location.pathname.startsWith(`${path}/`)
  ));
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
    const isManager = userRole === 'owner' || userRole === 'admin' || userRole === 'platform_admin';
    const permissionMap: Record<string, keyof NonNullable<typeof permissions>> = {
      dashboard: 'can_access_dashboard',
      conversations: 'can_access_conversations',
      pipeline: 'can_access_pipeline',
      flows: 'can_access_flows',
      reports: 'can_access_reports',
      agents: 'can_access_agents',
      settings: 'can_access_settings',
      team: 'can_access_team',
      scheduled: 'can_access_scheduled',
      calendar: 'can_access_calendar',
    };
    const permissionKey = permissionMap[routePermissionModule];
    const hasPermission = isManager || (permissionKey ? Boolean(permissions?.[permissionKey]) : false);
    if (!hasPermission) {
      return <Navigate to={routePermissionModule === 'dashboard' ? '/profile' : '/dashboard'} replace state={{ from: location, reason: 'permission_denied' }} />;
    }
  }

  return <>{children}</>;
}
