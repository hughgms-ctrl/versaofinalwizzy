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

/**
 * Portão de acesso para FUNÇÕES DE MANUTENÇÃO/DEBUG que rodam com service_role
 * (bypassam RLS) e podem afetar dados de QUALQUER org — ex.: zapi-cleanup,
 * zapi-fix-contacts, fix-remarketing. Essas funções não têm chamador no
 * frontend; só devem ser acionadas server-to-server (cron/edge com a
 * service_role key) ou manualmente por um platform_admin.
 *
 * Aceita a requisição só se:
 *   - o Bearer for exatamente a SUPABASE_SERVICE_ROLE_KEY (chamada interna), OU
 *   - o token for de um usuário válido COM role platform_admin.
 *
 * Rejeita (lança AccessError) qualquer outro caso — incluindo tokens válidos de
 * usuários comuns. Nunca use header mágico/segredo hardcoded como bypass.
 */
export async function assertServiceRoleOrPlatformAdmin(
  req: Request,
  adminClient: any,
): Promise<{ mode: 'service' | 'platform_admin'; userId?: string }> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new AccessError('Missing auth', 401);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey && token === serviceKey) {
    return { mode: 'service' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new AccessError('Unauthorized', 401);

  const { data: platformRole } = await adminClient
    .from('user_roles')
    .select('id')
    .eq('user_id', user.id)
    .eq('role', 'platform_admin')
    .maybeSingle();

  if (!platformRole) throw new AccessError('Forbidden: platform admin required', 403);
  return { mode: 'platform_admin', userId: user.id };
}

// Retorna todas as organization_id de que o usuário é membro (via organization_members,
// com fallback legado para profiles.organization_id). Usado para escopar queries em
// funções que recebem um instanceId/conversationId/contactId do cliente: em vez de
// confiar no id enviado, restringimos com .in('organization_id', orgIds) para impedir
// acesso cross-tenant (IDOR). Retorna [] se o usuário não pertence a nenhuma org.
export async function getUserOrganizationIds(adminClient: any, userId: string): Promise<string[]> {
  const { data: memberships, error } = await adminClient
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId);

  if (error && !isMissingRelationError(error)) throw error;

  const ids = new Set<string>();
  for (const row of memberships || []) {
    if (row?.organization_id) ids.add(row.organization_id);
  }

  // Fallback legado (orgs antigas sem organization_members): usa o profile.
  if (ids.size === 0) {
    const { data: profile } = await adminClient
      .from('profiles')
      .select('organization_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (profile?.organization_id) ids.add(profile.organization_id);
  }

  return Array.from(ids);
}

export type CallerAuth = { mode: 'service' } | { mode: 'user'; userId: string };

/**
 * Identifica o chamador de uma edge function que roda com service_role (bypassa
 * RLS) e é `verify_jwt=false` — ex.: agent-orchestrator, flow-execute. Distingue:
 *   - 'service': Bearer == SUPABASE_SERVICE_ROLE_KEY → chamada interna
 *     (server-to-server: zapi-webhook, flow-execute, crons). Acesso total.
 *   - 'user': token de um usuário autenticado real → precisa passar por
 *     assertCallerCanAccessOrg antes de tocar dados de uma org.
 *
 * Rejeita (AccessError 401) requisição sem token, com anon key, ou com token
 * inválido. NUNCA aceita segredo hardcoded/header mágico como bypass.
 */
export async function resolveCaller(req: Request): Promise<CallerAuth> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new AccessError('Missing auth', 401);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey && token === serviceKey) return { mode: 'service' };

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  // anon key é um JWT válido mas NÃO é um usuário → tratar como não autenticado.
  if (anonKey && token === anonKey) throw new AccessError('Unauthorized', 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(supabaseUrl, anonKey || '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new AccessError('Unauthorized', 401);
  return { mode: 'user', userId: user.id };
}

/**
 * Autoriza o chamador para uma org específica. 'service' passa sempre; 'user'
 * precisa ser MEMBRO da org (getUserOrganizationIds). Impede que um usuário de
 * outra org dispare IA/fluxo sobre dados/conversas que não são dele.
 */
export async function assertCallerCanAccessOrg(
  adminClient: any,
  caller: CallerAuth,
  organizationId: string | null | undefined,
): Promise<void> {
  if (caller.mode === 'service') return;
  if (!organizationId) throw new AccessError('Organization is required', 400);
  const orgIds = await getUserOrganizationIds(adminClient, caller.userId);
  if (!orgIds.includes(organizationId)) throw new AccessError('Forbidden', 403);
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
    'crm',
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
    'orchestrator',
    'ai',
  ]);
  const allowedModules = Array.isArray(planRow?.plan?.allowed_modules)
    ? planRow.plan.allowed_modules
    : [];
  if (coreModules.has(moduleName)) {
    const hasCrmBundle = allowedModules.includes('crm');
    const hasLegacyCrmModules = allowedModules.some((allowedModule: string) =>
      allowedModule !== 'crm' && coreModules.has(allowedModule)
    );
    if (moduleName === 'crm') return hasCrmBundle || hasLegacyCrmModules;
    return hasCrmBundle || hasLegacyCrmModules ? allowedModules.includes(moduleName) : false;
  }
  if (moduleName === 'tools') {
    return allowedModules.includes('tools')
      || ['documents', 'widgets', 'quiz', 'wizzy_flow', 'carousel', 'cnis'].some((toolModule) =>
        allowedModules.includes(toolModule)
      );
  }
  return allowedModules.includes(moduleName);
}

export function isMissingRelationError(error: any) {
  const message = String(error?.message || error?.details || '').toLowerCase();
  return error?.code === 'PGRST205'
    || error?.code === '42P01'
    || message.includes('could not find the table')
    || message.includes('does not exist');
}

export async function getLegacyOrganizationRole(adminClient: any, userId: string, organizationId: string) {
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (profile?.organization_id !== organizationId) return null;

  const { data: roles } = await adminClient
    .from('user_roles')
    .select('role, organization_id')
    .eq('user_id', userId);

  const roleRow = (roles || []).find((row: any) =>
    !row.organization_id || row.organization_id === organizationId
  );
  return { role: String(roleRow?.role || 'admin'), legacy: true };
}

export async function assertActiveOrganizationAccess(
  adminClient: any,
  userId: string,
  organizationId: string,
  options: { module?: string; requireManager?: boolean; skipPlanCheck?: boolean } = {},
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

  if (membershipError && !isMissingRelationError(membershipError)) throw membershipError;
  const fallbackMembership = membershipError && isMissingRelationError(membershipError)
    ? await getLegacyOrganizationRole(adminClient, userId, organizationId)
    : null;
  const effectiveMembership = membership || fallbackMembership;

  if (!effectiveMembership && !platformRole) throw new AccessError('Forbidden', 403);
  const role = String(effectiveMembership?.role || (platformRole ? 'platform_admin' : ''));
  if (options.requireManager && !['owner', 'admin', 'platform_admin'].includes(role)) {
    throw new AccessError('Only organization owners and admins can perform this action', 403);
  }

  if (options.skipPlanCheck) {
    return { membership: effectiveMembership, planRow: null };
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

  return { membership: effectiveMembership, planRow };
}
