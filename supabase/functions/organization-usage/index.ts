import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { first, toNumber } from '../_shared/usage.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getCurrentUsagePeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function isMissingRelationError(error: any) {
  const message = String(error?.message || error?.details || '').toLowerCase()
  return error?.code === 'PGRST205'
    || error?.code === '42P01'
    || message.includes('could not find the table')
    || message.includes('does not exist')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), { status: 401, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: profile } = await adminClient
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404, headers: corsHeaders })
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const requestedOrgId = String(body?.organization_id || '').trim()
    const organizationId = requestedOrgId || profile.organization_id

    const [{ data: membership, error: membershipError }, { data: platformRole }] = await Promise.all([
      adminClient
        .from('organization_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .maybeSingle(),
      adminClient
        .from('user_roles')
        .select('id')
        .eq('user_id', user.id)
        .eq('role', 'platform_admin')
        .maybeSingle(),
    ])

    if (membershipError && !isMissingRelationError(membershipError)) throw membershipError
    const legacyMembership = membershipError && isMissingRelationError(membershipError)
      ? profile.organization_id === organizationId
      : false

    if (!membership && !legacyMembership && !platformRole) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    }

    // Fase 7.5: contagens escopadas por org + storage do valor JA PERSISTIDO, em vez da
    // varredura O(plataforma) do calculateOrganizationUsage (que listava TODO o storage e
    // lia tabelas de TODAS as orgs -> TTFB ~15s). Estes numeros sao so para DISPLAY: o
    // enforcement real de workspace/team/whatsapp e por triggers no banco em tempo real
    // (20260609211500_enforce_plan_resource_limits); nao ha enforcement de storage. O
    // organizations.storage_used_bytes e atualizado pelo admin-dashboard (recalculo de
    // todas as orgs, persistStorageUsed) — fonte de verdade do numero exibido aqui.
    const usagePeriod = getCurrentUsagePeriod()
    const [planRes, orgRes, aiUsageRes, integrationRes, teamCountRes, conversationCountRes, workspacesRes, instancesRes] = await Promise.all([
      adminClient
        .from('organization_plans')
        .select('*, plan:platform_plans(*)')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      adminClient
        .from('organizations')
        .select('id, storage_limit_bytes, storage_used_bytes')
        .eq('id', organizationId)
        .maybeSingle(),
      adminClient
        .from('organization_usage')
        .select('ai_requests, ai_cost_usd')
        .eq('organization_id', organizationId)
        .eq('period', usagePeriod)
        .maybeSingle(),
      adminClient
        .from('integration_configs')
        .select('openai_api_key, ai_provider')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      adminClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId),
      adminClient
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId),
      adminClient
        .from('workspaces')
        .select('id, is_active')
        .eq('organization_id', organizationId),
      adminClient
        .from('whatsapp_instances')
        .select('id, is_active, status, phone_number, connected_at')
        .eq('organization_id', organizationId),
    ])

    if (orgRes.error) throw orgRes.error
    if (!orgRes.data) {
      return new Response(JSON.stringify({ error: 'Organization not found' }), { status: 404, headers: corsHeaders })
    }
    if (planRes.error) throw planRes.error
    const plan = first((planRes.data as any)?.plan)

    // Mesma semantica de display do usage.ts: workspace ativo = is_active !== false;
    // numero whatsapp "em uso" = connected | is_active | connected_at | phone_number.
    const activeWorkspaces = (workspacesRes.data || []).filter((w: any) => w.is_active !== false).length
    const activeInstances = (instancesRes.data || []).filter((i: any) =>
      i.status === 'connected' || i.is_active || i.connected_at || i.phone_number
    ).length

    return new Response(JSON.stringify({
      planRow: planRes.data,
      organization: {
        id: organizationId,
        storage_used_bytes: toNumber(orgRes.data?.storage_used_bytes),
        storage_limit_bytes: toNumber(plan?.storage_limit_bytes) || toNumber(orgRes.data?.storage_limit_bytes),
      },
      teamCount: teamCountRes.count || 0,
      workspaceCount: activeWorkspaces,
      whatsappNumberCount: activeInstances,
      conversationCount: conversationCountRes.count || 0,
      storageByBucket: {},
      usage: aiUsageRes.data,
      integrationConfig: integrationRes.data,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
