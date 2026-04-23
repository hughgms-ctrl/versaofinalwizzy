import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const [onboardedAt, setOnboardedAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!profile?.organization_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('organizations')
        .select('onboarded_at')
        .eq('id', profile.organization_id)
        .maybeSingle();
      if (!cancelled) setOnboardedAt(((data as any)?.onboarded_at as string) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.organization_id]);

  if (loading || (user && profile && onboardedAt === undefined)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Redirect to onboarding on first login (org not yet onboarded)
  if (
    profile?.organization_id &&
    onboardedAt === null &&
    location.pathname !== '/onboarding'
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
