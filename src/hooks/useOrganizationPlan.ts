import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const WIZZY_CRM_MODULES = [
  'dashboard',
  'conversations',
  'contacts',
  'calendar',
  'pipeline',
  'flows',
  'campaigns',
  'scheduled',
  'agents',
  'reports',
  'integrations',
  'settings',
  'team',
  'tools',
  'orchestrator',
  'ai',
];

export const EXTRA_TOOL_MODULES = [
  'documents',
  'widgets',
  'quiz',
  'wizzy_flow',
];

function getCurrentUsagePeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function useOrganizationPlan() {
  const { profile } = useAuth();

  const { data: orgPlan, isLoading } = useQuery({
    queryKey: ['org-plan-modules', profile?.organization_id, getCurrentUsagePeriod()],
    queryFn: async () => {
      if (!profile?.organization_id) return null;
      const usagePeriod = getCurrentUsagePeriod();
      const [{ data, error }, orgRes, teamRes, workspaceRes, whatsappRes, usageRes, integrationRes] = await Promise.all([
        supabase
        .from('organization_plans')
        .select('*, plan:platform_plans(*)')
        .eq('organization_id', profile.organization_id)
          .maybeSingle(),
        supabase
          .from('organizations')
          .select('storage_used_bytes, storage_limit_bytes')
          .eq('id', profile.organization_id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', profile.organization_id),
        supabase
          .from('workspaces' as any)
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', profile.organization_id)
          .eq('is_active', true),
        supabase
          .from('whatsapp_instances')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', profile.organization_id),
        supabase
          .from('organization_usage' as any)
          .select('ai_requests, ai_cost_usd')
          .eq('organization_id', profile.organization_id)
          .eq('period', usagePeriod)
          .maybeSingle(),
        supabase
          .from('integration_configs' as any)
          .select('openai_api_key, ai_provider')
          .eq('organization_id', profile.organization_id)
          .maybeSingle(),
      ]);
      if (error) throw error;
      return {
        planRow: data,
        organization: orgRes.data,
        teamCount: teamRes.count || 0,
        workspaceCount: workspaceRes.count || 0,
        whatsappNumberCount: whatsappRes.count || 0,
        usage: usageRes.data,
        integrationConfig: integrationRes.data,
      };
    },
    enabled: !!profile?.organization_id,
  });

  const planRow = (orgPlan as any)?.planRow || null;
  const plan = planRow?.plan || null;
  const paymentStatus = String(planRow?.payment_status || '').toLowerCase();
  const trialEndsAt = planRow?.trial_ends_at || null;
  const hasValidTrial = ['trial', 'trialing'].includes(paymentStatus)
    && (!trialEndsAt || new Date(trialEndsAt).getTime() > Date.now());
  const allowedModules: string[] = plan?.allowed_modules || [];
  const storageUsed = Number((orgPlan as any)?.organization?.storage_used_bytes || 0);
  const storageLimit = Number(plan?.storage_limit_bytes || (orgPlan as any)?.organization?.storage_limit_bytes || 0);
  const teamCount = Number((orgPlan as any)?.teamCount || 0);
  const teamLimit = Number(plan?.max_team_members || 0);
  const workspaceCount = Number((orgPlan as any)?.workspaceCount || 0);
  const workspaceLimit = Number(plan?.features?.limits?.max_workspaces || 0);
  const whatsappNumberCount = Number((orgPlan as any)?.whatsappNumberCount || 0);
  const whatsappNumberLimit = Number(plan?.features?.limits?.max_whatsapp_numbers || 0);
  const aiRequestsUsed = Number((orgPlan as any)?.usage?.ai_requests || 0);
  const aiRequestLimit = Number(plan?.max_ai_requests_month || 0);
  const aiUsagePercent = aiRequestLimit > 0 ? Math.round((aiRequestsUsed / aiRequestLimit) * 100) : 0;
  const aiMode = plan?.ai_mode || 'own_api';
  const isWizzyAI = aiMode === 'platform_api';
  const hasOpenAIKey = Boolean((orgPlan as any)?.integrationConfig?.openai_api_key);
  const storageUsagePercent = storageLimit > 0 ? Math.round((storageUsed / storageLimit) * 100) : 0;
  const teamUsagePercent = teamLimit > 0 ? Math.round((teamCount / teamLimit) * 100) : 0;
  const workspaceUsagePercent = workspaceLimit > 0 ? Math.round((workspaceCount / workspaceLimit) * 100) : 0;
  const whatsappNumberUsagePercent = whatsappNumberLimit > 0 ? Math.round((whatsappNumberCount / whatsappNumberLimit) * 100) : 0;

  const canAccessModule = (module: string): boolean => {
    if (WIZZY_CRM_MODULES.includes(module)) return true;
    // If no plan assigned, allow everything (trial/free). Plans with no extras selected block extra tools.
    if (!planRow) return true;
    return allowedModules.includes(module);
  };

  return {
    orgPlan: planRow,
    isLoading,
    allowedModules,
    canAccessModule,
    planName: plan?.name || null,
    planSlug: plan?.slug || null,
    paymentStatus,
    trialEndsAt,
    isTrial: hasValidTrial,
    isManualAccess: paymentStatus === 'manual',
    aiMode,
    isWizzyAI,
    usage: {
      storageUsed,
      storageLimit,
      storageUsagePercent,
      teamCount,
      teamLimit,
      teamUsagePercent,
      workspaceCount,
      workspaceLimit,
      workspaceUsagePercent,
      whatsappNumberCount,
      whatsappNumberLimit,
      whatsappNumberUsagePercent,
      aiRequestsUsed,
      aiRequestLimit,
      aiUsagePercent,
      hasOpenAIKey,
      requiresOpenAIKey: !isWizzyAI && !hasOpenAIKey,
      isStorageNearLimit: storageUsagePercent >= 80,
      isTeamNearLimit: teamUsagePercent >= 80,
      isWorkspaceNearLimit: workspaceLimit > 0 && workspaceUsagePercent >= 80,
      isWhatsappNumberNearLimit: whatsappNumberLimit > 0 && whatsappNumberUsagePercent >= 80,
      isAINearLimit: !isWizzyAI && aiRequestLimit > 0 && aiUsagePercent >= 80,
      isStorageAtLimit: storageLimit > 0 && storageUsed >= storageLimit,
      isTeamAtLimit: teamLimit > 0 && teamCount >= teamLimit,
      isWorkspaceAtLimit: workspaceLimit > 0 && workspaceCount >= workspaceLimit,
      isWhatsappNumberAtLimit: whatsappNumberLimit > 0 && whatsappNumberCount >= whatsappNumberLimit,
      isAIAtLimit: !isWizzyAI && aiRequestLimit > 0 && aiRequestsUsed >= aiRequestLimit,
    },
  };
}
