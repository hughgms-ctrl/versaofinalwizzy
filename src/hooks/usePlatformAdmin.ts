import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function usePlatformAdmin() {
  const { user } = useAuth();

  const { data: isPlatformAdmin, isLoading } = useQuery({
    queryKey: ['platform-admin', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      // Use the server-side function to check role
      const { data, error } = await supabase.rpc('is_platform_admin', {
        _user_id: user.id,
      });
      if (error) return false;
      return !!data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  return { isPlatformAdmin: !!isPlatformAdmin, isLoading };
}
