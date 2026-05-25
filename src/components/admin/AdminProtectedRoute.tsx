import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { Loader2 } from 'lucide-react';

interface AdminProtectedRouteProps {
  children: ReactNode;
}

export function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { isPlatformAdmin, isLoading: adminLoading } = usePlatformAdmin();

  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!user || !isPlatformAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}
