import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  const allowedWithoutActivePlan = ['/subscription', '/plans', '/profile'];

  const { data: onboardingPlan, isLoading: planLoading } = useQuery({
    queryKey: ['onboarding-org-plan', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;

      const { data, error } = await supabase
        .from('organization_plans')
        .select('status, payment_status, current_period_end, trial_ends_at')
        .eq('organization_id', profile.organization_id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user && !!profile?.organization_id,
  });

  if (loading || (!!user && !!profile?.organization_id && planLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const status = String((onboardingPlan as any)?.status || '').toLowerCase();
  const paymentStatus = String((onboardingPlan as any)?.payment_status || '').toLowerCase();
  const trialEndsAt = (onboardingPlan as any)?.trial_ends_at;
  const hasValidTrial = ['trial', 'trialing'].includes(paymentStatus)
    && Boolean(trialEndsAt)
    && new Date(trialEndsAt).getTime() > Date.now();
  const hasActivePlan = status === 'active' && (['paid', 'manual'].includes(paymentStatus) || hasValidTrial);
  const isAllowedOnboardingPath = allowedWithoutActivePlan.some((path) => (
    location.pathname === path || location.pathname.startsWith(`${path}/`)
  ));

  if (!hasActivePlan && !isAllowedOnboardingPath) {
    return <Navigate to="/subscription" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
