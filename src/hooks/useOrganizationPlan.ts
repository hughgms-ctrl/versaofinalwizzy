import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useOrganizationPlan() {
  const { profile } = useAuth();

  const { data: orgPlan, isLoading } = useQuery({
    queryKey: ['org-plan-modules', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;
      const { data, error } = await supabase
        .from('organization_plans')
        .select('*, plan:platform_plans(*)')
        .eq('organization_id', profile.organization_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.organization_id,
  });

  const allowedModules: string[] = (orgPlan as any)?.plan?.allowed_modules || [];

  const canAccessModule = (module: string): boolean => {
    // If no plan assigned, allow everything (trial/free)
    if (!orgPlan || allowedModules.length === 0) return true;
    return allowedModules.includes(module);
  };

  return {
    orgPlan,
    isLoading,
    allowedModules,
    canAccessModule,
    planName: (orgPlan as any)?.plan?.name || null,
    planSlug: (orgPlan as any)?.plan?.slug || null,
  };
}
