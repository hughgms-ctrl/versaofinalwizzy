import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export class AccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function getRequestUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new AccessError('Missing auth', 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new AccessError('Unauthorized', 401);
  return user;
}

export function hasValidOrganizationPlan(planRow: any) {
  if (!planRow) return false;
  const paymentStatus = String(planRow.payment_status || planRow.status || '').toLowerCase();
  const trialEndsAt = planRow.trial_ends_at ? new Date(planRow.trial_ends_at).getTime() : null;
  const hasValidTrial = ['trial', 'trialing'].includes(paymentStatus)
    && (!trialEndsAt || trialEndsAt > Date.now());
  return ['paid', 'manual', 'active'].includes(paymentStatus) || hasValidTrial;
}

export function planAllowsModule(planRow: any, moduleName?: string | null) {
  if (!moduleName) return true;
  const coreModules = new Set([
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
  ]);
  if (coreModules.has(moduleName)) return true;
  const allowedModules = Array.isArray(planRow?.plan?.allowed_modules)
    ? planRow.plan.allowed_modules
    : [];
  return allowedModules.includes(moduleName);
}

export async function assertActiveOrganizationAccess(
  adminClient: any,
  userId: string,
  organizationId: string,
  options: { module?: string; requireManager?: boolean } = {},
) {
  if (!organizationId) throw new AccessError('Organization is required', 400);

  const [{ data: membership, error: membershipError }, { data: platformRole }] = await Promise.all([
    adminClient
      .from('organization_members')
      .select('role')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .maybeSingle(),
    adminClient
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('role', 'platform_admin')
      .maybeSingle(),
  ]);

  if (membershipError) throw membershipError;
  if (!membership && !platformRole) throw new AccessError('Forbidden', 403);
  const role = String(membership?.role || (platformRole ? 'platform_admin' : ''));
  if (options.requireManager && !['owner', 'admin', 'platform_admin'].includes(role)) {
    throw new AccessError('Only organization owners and admins can perform this action', 403);
  }

  const { data: planRow, error: planError } = await adminClient
    .from('organization_plans')
    .select('*, plan:platform_plans(*)')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (planError) throw planError;
  if (!hasValidOrganizationPlan(planRow)) {
    throw new AccessError('Organization subscription is not active', 402);
  }
  if (!planAllowsModule(planRow, options.module)) {
    throw new AccessError('Module is not available in the current plan', 402);
  }

  return { membership, planRow };
}
