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

  const allowedWithoutPlan = ['/subscription', '/plans', '/profile'];

  const { data: onboardingPlan, isLoading: planLoading } = useQuery({
    queryKey: ['onboarding-org-plan', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;

      const { data, error } = await supabase
        .from('organization_plans')
        .select('id')
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

  const isAllowedOnboardingPath = allowedWithoutPlan.some((path) => (
    location.pathname === path || location.pathname.startsWith(`${path}/`)
  ));

  // Only first-signup organizations without any plan record should be sent to subscriptions.
  if (!onboardingPlan && !isAllowedOnboardingPath) {
    return <Navigate to="/subscription" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
