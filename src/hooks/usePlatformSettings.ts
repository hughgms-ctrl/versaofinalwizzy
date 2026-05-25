import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function usePlatformSetting<T = unknown>(key: string, fallback: T) {
  return useQuery({
    queryKey: ['platform-setting', key],
    queryFn: async (): Promise<T> => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();

      if (error) throw error;
      return (data?.value ?? fallback) as T;
    },
    staleTime: 60 * 1000,
  });
}
