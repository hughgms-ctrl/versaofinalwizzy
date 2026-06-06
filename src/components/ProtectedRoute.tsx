import { ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useCurrentUserRole } from '@/hooks/useUserPermissions';
import { clearStoredEntryAssignment, getStoredEntryAssignment, hasEntryLimitedAccessAssignment, isEntryTrialExpired } from '@/lib/entryFlow';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const { selectedWorkspace, loading: workspaceLoading } = useWorkspaceContext();
  const location = useLocation();
  const activeOrganizationId = selectedWorkspace?.organization_id || profile?.organization_id || null;

  const allowedWithoutPlan = ['/subscription', '/plans', '/checkout-notice', '/profile'];
  const billingPaths = ['/subscription', '/plans'];
  const isBillingPath = billingPaths.some((path) => (
    location.pathname === path || location.pathname.startsWith(`${path}/`)
  ));

  const { data: userRole, isLoading: roleLoading } = useCurrentUserRole(activeOrganizationId);
  const canManageBilling = userRole === 'owner' || userRole === 'admin';

  const { data: onboardingPlan, isLoading: planLoading } = useQuery({
    queryKey: ['onboarding-org-plan', activeOrganizationId],
    queryFn: async () => {
      if (!activeOrganizationId) return null;

      const { data, error } = await supabase
        .from('organization_plans')
        .select('id, status, payment_status, trial_ends_at')
        .eq('organization_id', activeOrganizationId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user && !!activeOrganizationId,
  });
  const entryAssignment = getStoredEntryAssignment();
  const hasEntryLimitedAccess = hasEntryLimitedAccessAssignment();
  const paymentStatus = String((onboardingPlan as any)?.payment_status || (onboardingPlan as any)?.status || '').toLowerCase();
  const trialEndsAt = (onboardingPlan as any)?.trial_ends_at || null;
  const trialExpired = ['trial', 'trialing'].includes(paymentStatus)
    && trialEndsAt
    && new Date(trialEndsAt).getTime() <= Date.now()
    && entryAssignment?.config?.block_after_trial !== false;
  const localTrialExpired = !onboardingPlan && isEntryTrialExpired();

  useEffect(() => {
    const isTrialPlan = ['trial', 'trialing'].includes(paymentStatus);
    if (onboardingPlan && entryAssignment && !isTrialPlan) {
      clearStoredEntryAssignment();
    }
  }, [onboardingPlan, entryAssignment?.flow_type]);

  if (
    loading
    || (!!user && !profile)
    || (!!user && workspaceLoading)
    || (!!user && !!activeOrganizationId && (planLoading || (isBillingPath && roleLoading)))
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
  if (isBillingPath && !canManageBilling) {
    return <Navigate to="/dashboard" replace />;
  }

  // Only billing admins from organizations without any plan record should be sent to subscriptions.
  if (!onboardingPlan && canManageBilling && !isAllowedOnboardingPath && !hasEntryLimitedAccess) {
    return <Navigate to="/plans" replace state={{ from: location }} />;
  }

  if ((trialExpired || localTrialExpired) && !isAllowedOnboardingPath) {
    return <Navigate to="/plans" replace state={{ from: location, reason: 'trial_expired' }} />;
  }

  return <>{children}</>;
}
