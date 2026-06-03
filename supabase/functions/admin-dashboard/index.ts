import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function maskSecret(value?: string | null) {
  if (!value) return ''
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`
}

function normalizeBaseUrl(value?: string | null) {
  return (value || '').trim().replace(/\/$/, '')
}

function onlyDigits(value?: string | null) {
  return (value || '').replace(/\D/g, '')
}

function phoneVariants(raw?: string | null): string[] {
  const clean = onlyDigits(raw)
  if (!clean) return []
  const values = new Set<string>()
  const add = (value: string) => {
    if (!value) return
    values.add(value)
    if (value.startsWith('55')) values.add(value.slice(2))
    if (!value.startsWith('55') && value.length >= 10 && value.length <= 11) values.add(`55${value}`)
  }
  add(clean)
  const local = clean.startsWith('55') ? clean.slice(2) : clean
  if (local.length === 10) add(`${local.slice(0, 2)}9${local.slice(2)}`)
  if (local.length === 11 && local[2] === '9') add(`${local.slice(0, 2)}${local.slice(3)}`)
  return Array.from(values).filter(Boolean)
}

function canonicalPhone(raw?: string | null) {
  const clean = onlyDigits(raw)
  if (!clean) return ''
  if (clean.startsWith('55')) return clean
  return clean.length >= 10 && clean.length <= 13 ? `55${clean}` : clean
}

function normalizeLabel(value?: string | null) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(evolution|backup|uazapi)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

function toNumber(value: unknown) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function addUsage(target: Record<string, number>, organizationId: string | null | undefined, bytes: unknown) {
  if (!organizationId) return
  const value = toNumber(bytes)
  if (value <= 0) return
  target[organizationId] = (target[organizationId] || 0) + value
}

function getStorageObjectSize(object: any) {
  const metadata = object?.metadata || {}
  return toNumber(metadata.size || metadata.contentLength || metadata.content_length)
}

function normalizeRelation<T = any>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null
  return value || null
}

async function fetchJsonWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 6000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const text = await response.text()
    let json: any = null
    try { json = text ? JSON.parse(text) : null } catch (_) {}
    return { ok: response.ok, status: response.status, text, json }
  } finally {
    clearTimeout(timer)
  }
}

async function checkUazapiStatus(baseUrl: string, adminToken: string) {
  if (!baseUrl || !adminToken) {
    return { provider: 'uazapi', configured: false, online: false, instance_count: 0, message: 'Configuração ausente' }
  }

  try {
    const result = await fetchJsonWithTimeout(`${baseUrl}/instance/list`, {
      headers: { admintoken: adminToken },
    })
    const instances = Array.isArray(result.json)
      ? result.json
      : Array.isArray(result.json?.instances)
        ? result.json.instances
        : Array.isArray(result.json?.data)
          ? result.json.data
          : []
    return {
      provider: 'uazapi',
      configured: true,
      online: result.ok,
      http_status: result.status,
      instance_count: instances.length,
      message: result.ok ? 'Conectado na API geral' : (result.text || 'Falha ao consultar UAZAPI').slice(0, 180),
    }
  } catch (err: any) {
    return { provider: 'uazapi', configured: true, online: false, instance_count: 0, message: err?.message || 'Falha ao consultar UAZAPI' }
  }
}

async function checkEvolutionStatus(baseUrl: string, apiKey: string) {
  if (!baseUrl || !apiKey) {
    return { provider: 'evolution', configured: false, online: false, instance_count: 0, message: 'Configuração ausente' }
  }

  try {
    const result = await fetchJsonWithTimeout(`${baseUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
    })
    const instances = Array.isArray(result.json)
      ? result.json
      : Array.isArray(result.json?.instances)
        ? result.json.instances
        : Array.isArray(result.json?.data)
          ? result.json.data
          : []
    return {
      provider: 'evolution',
      configured: true,
      online: result.ok,
      http_status: result.status,
      instance_count: instances.length,
      message: result.ok ? 'Conectado na API geral' : (result.text || 'Falha ao consultar Evolution API').slice(0, 180),
    }
  } catch (err: any) {
    return { provider: 'evolution', configured: true, online: false, instance_count: 0, message: err?.message || 'Falha ao consultar Evolution API' }
  }
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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('role', 'platform_admin')
      .maybeSingle()

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    }

    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'overview'

    if (action === 'overview') {
      const [orgsRes, contactsRes, conversationsRes, messagesRes, instancesRes, profilesRes] = await Promise.all([
        adminClient.from('organizations').select('id, name, slug, storage_used_bytes, created_at', { count: 'exact' }),
        adminClient.from('contacts').select('id', { count: 'exact', head: true }),
        adminClient.from('conversations').select('id', { count: 'exact', head: true }),
        adminClient.from('messages').select('id', { count: 'exact', head: true }),
        adminClient.from('whatsapp_instances').select('id, is_active', { count: 'exact' }),
        adminClient.from('profiles').select('id', { count: 'exact', head: true }),
      ])

      const activeInstances = (instancesRes.data || []).filter((i: any) => i.is_active).length

      return new Response(JSON.stringify({
        stats: {
          total_organizations: orgsRes.count || 0,
          total_contacts: contactsRes.count || 0,
          total_conversations: conversationsRes.count || 0,
          total_messages: messagesRes.count || 0,
          total_users: profilesRes.count || 0,
          total_instances: instancesRes.count || 0,
          active_instances: activeInstances,
        },
        organizations: orgsRes.data || [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'clients') {
      const { data: orgs } = await adminClient
        .from('organizations')
        .select('id, name, slug, storage_used_bytes, storage_limit_bytes, created_at')
        .order('created_at', { ascending: false })

      const { data: profiles } = await adminClient
        .from('profiles')
        .select('id, organization_id, full_name, user_id')

      const { data: instances } = await adminClient
        .from('whatsapp_instances')
        .select('id, organization_id, is_active, phone_number, label, status')

      const { data: workspaces } = await adminClient
        .from('workspaces')
        .select('id, organization_id, is_active')

      const { data: convCounts } = await adminClient
        .from('conversations')
        .select('id, organization_id')

      const { data: mediaMessages } = await adminClient
        .from('messages')
        .select('id, conversation_id, media_url')
        .not('media_url', 'is', null)

      const { data: contactFiles } = await adminClient
        .from('contact_files')
        .select('organization_id, file_size, storage_path')

      const { data: orgPlans } = await adminClient
        .from('organization_plans')
        .select('organization_id, plan_id, status, payment_status, trial_ends_at, current_period_end, platform_plans(id, name, slug, price_monthly, storage_limit_bytes, max_team_members, features)')

      const storageByOrg: Record<string, number> = {}
      const contactFilePathKeys = new Set<string>()
      ;(contactFiles || []).forEach((file: any) => {
        addUsage(storageByOrg, file.organization_id, file.file_size)
        if (file.storage_path) contactFilePathKeys.add(`contact-files/${file.storage_path}`)
      })

      try {
        const orgIdSet = new Set((orgs || []).map((org: any) => org.id))
        const conversationOrgById = new Map((convCounts || []).map((conv: any) => [conv.id, conv.organization_id]))
        const storagePathOrgByKey = new Map<string, string>()

        ;(mediaMessages || []).forEach((message: any) => {
          const orgId = conversationOrgById.get(message.conversation_id)
          if (!orgId || !message.media_url) return
          const marker = '/object/public/'
          const markerIndex = String(message.media_url).indexOf(marker)
          if (markerIndex < 0) return
          const key = decodeURIComponent(String(message.media_url).slice(markerIndex + marker.length).split('?')[0])
          if (key) storagePathOrgByKey.set(key, orgId as string)
        })

        const { data: storageObjects } = await adminClient
          .schema('storage')
          .from('objects')
          .select('bucket_id, name, metadata')
          .in('bucket_id', ['contact-files', 'chat-media', 'flow-media', 'document-templates', 'task-files'])

        ;(storageObjects || []).forEach((object: any) => {
          const bucketId = object.bucket_id
          const objectName = object.name || ''
          const objectKey = `${bucketId}/${objectName}`
          const size = getStorageObjectSize(object)
          if (size <= 0) return

          const firstPathPart = objectName.split('/')[0]
          const orgIdFromPublicUrl = storagePathOrgByKey.get(objectKey)
          if (orgIdFromPublicUrl) {
            addUsage(storageByOrg, orgIdFromPublicUrl, size)
            return
          }

          if (orgIdSet.has(firstPathPart)) {
            addUsage(storageByOrg, firstPathPart, size)
            return
          }

          if (bucketId === 'chat-media') {
            const orgId = conversationOrgById.get(firstPathPart)
            addUsage(storageByOrg, orgId as string | undefined, size)
            return
          }

          if (bucketId === 'contact-files' && !contactFilePathKeys.has(objectKey)) {
            const linkedFile = (contactFiles || []).find((file: any) => file.storage_path === objectName)
            addUsage(storageByOrg, linkedFile?.organization_id, size)
          }
        })
      } catch (storageError) {
        console.warn('admin clients storage usage fallback failed', storageError)
      }

      const enrichedOrgs = (orgs || []).map((org: any) => {
        const orgProfiles = (profiles || []).filter((p: any) => p.organization_id === org.id)
        const orgInstances = (instances || []).filter((i: any) => i.organization_id === org.id)
        const orgWorkspaces = (workspaces || []).filter((w: any) => w.organization_id === org.id)
        const orgConvs = (convCounts || []).filter((c: any) => c.organization_id === org.id)
        const orgPlan = (orgPlans || []).find((p: any) => p.organization_id === org.id)
        const plan = normalizeRelation(orgPlan?.platform_plans)
        const planFeatures = plan?.features || {}
        const storageUsedBytes = Math.max(toNumber(org.storage_used_bytes), toNumber(storageByOrg[org.id]))
        const storageLimitBytes = toNumber(plan?.storage_limit_bytes) || toNumber(org.storage_limit_bytes)

        return {
          ...org,
          storage_used_bytes: storageUsedBytes,
          storage_limit_bytes: storageLimitBytes,
          user_count: orgProfiles.length,
          max_team_members: plan?.max_team_members ?? null,
          instance_count: orgInstances.length,
          active_instances: orgInstances.filter((i: any) => i.is_active).length,
          workspace_count: orgWorkspaces.length,
          active_workspaces: orgWorkspaces.filter((w: any) => w.is_active !== false).length,
          max_workspaces: planFeatures?.limits?.max_workspaces ?? null,
          max_whatsapp_numbers: planFeatures?.limits?.max_whatsapp_numbers ?? null,
          conversation_count: orgConvs.length,
          instances: orgInstances,
          plan: orgPlan ? {
            id: plan?.id,
            name: plan?.name,
            slug: plan?.slug,
            price: plan?.price_monthly,
            storage_limit_bytes: plan?.storage_limit_bytes,
            max_team_members: plan?.max_team_members,
            max_workspaces: planFeatures?.limits?.max_workspaces ?? null,
            max_whatsapp_numbers: planFeatures?.limits?.max_whatsapp_numbers ?? null,
            status: orgPlan.status,
            payment_status: orgPlan.payment_status,
            trial_ends_at: orgPlan.trial_ends_at,
            current_period_end: orgPlan.current_period_end,
          } : null,
        }
      })

      return new Response(JSON.stringify({ organizations: enrichedOrgs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'org_details') {
      const orgId = url.searchParams.get('org_id')
      if (!orgId) throw new Error('Missing org_id')

      // Get fingerprints for this org
      const { data: fingerprints } = await adminClient
        .from('user_fingerprints')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(20)

      // Get org info
      const { data: org } = await adminClient
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .single()

      // Get profiles
      const { data: profiles } = await adminClient
        .from('profiles')
        .select('id, user_id, full_name, avatar_url, phone, created_at')
        .eq('organization_id', orgId)

      // Get auth user details (email, last sign in, etc)
      const userDetails: any[] = []
      for (const p of (profiles || [])) {
        try {
          const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(p.user_id)
          if (authUser) {
            userDetails.push({
              ...p,
              email: authUser.email,
              last_sign_in_at: authUser.last_sign_in_at,
              created_at_auth: authUser.created_at,
              is_banned: !!(authUser as any).banned_until,
              pending_approval: authUser.user_metadata?.pending_approval || false,
            })
          }
        } catch (_) {
          userDetails.push(p)
        }
      }

      // Check if any fingerprint IP is shared with other orgs
      const ips = [...new Set((fingerprints || []).map((f: any) => f.ip_address).filter(Boolean))]
      let sharedIpOrgs: any[] = []
      if (ips.length > 0) {
        const { data: sharedFingerprints } = await adminClient
          .from('user_fingerprints')
          .select('ip_address, organization_id')
          .in('ip_address', ips)
          .neq('organization_id', orgId)

        if (sharedFingerprints && sharedFingerprints.length > 0) {
          const sharedOrgIds = [...new Set(sharedFingerprints.map((f: any) => f.organization_id))]
          const { data: sharedOrgs } = await adminClient
            .from('organizations')
            .select('id, name, slug, created_at')
            .in('id', sharedOrgIds)
          sharedIpOrgs = (sharedOrgs || []).map((o: any) => ({
            ...o,
            shared_ips: sharedFingerprints.filter((f: any) => f.organization_id === o.id).map((f: any) => f.ip_address),
          }))
        }
      }

      // Check blocked fingerprints
      const { data: blocked } = await adminClient
        .from('blocked_fingerprints')
        .select('*')
        .in('ip_address', ips.length > 0 ? ips : ['none'])

      return new Response(JSON.stringify({
        organization: org,
        users: userDetails,
        fingerprints: fingerprints || [],
        shared_ip_organizations: sharedIpOrgs,
        blocked_ips: blocked || [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'plans') {
      const [plansRes, orgPlansRes, settingsRes] = await Promise.all([
        adminClient.from('platform_plans').select('*').order('price_monthly', { ascending: true }),
        adminClient.from('organization_plans').select('plan_id, status'),
        adminClient.from('platform_settings').select('value').eq('key', 'show_client_plans_menu').maybeSingle(),
      ])

      const plans = (plansRes.data || []).map((plan: any) => ({
        ...plan,
        subscriber_count: (orgPlansRes.data || []).filter((op: any) => op.plan_id === plan.id && op.status === 'active').length,
      }))

      return new Response(JSON.stringify({
        plans,
        settings: {
          show_client_plans_menu: settingsRes.data?.value === true,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'security') {
      const { data: logs } = await adminClient
        .from('admin_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      return new Response(JSON.stringify({ logs: logs || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'governance') {
      const { data: checks } = await adminClient
        .from('governance_checks')
        .select('*')
        .order('phase', { ascending: true })

      return new Response(JSON.stringify({ checks: checks || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'api') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data: execLogs, count: execCount } = await adminClient
        .from('agent_execution_logs')
        .select('id, organization_id, execution_time_ms, created_at', { count: 'exact' })
        .gte('created_at', thirtyDaysAgo)

      const orgUsage: Record<string, number> = {}
      for (const log of execLogs || []) {
        orgUsage[log.organization_id] = (orgUsage[log.organization_id] || 0) + 1
      }

      const orgIds = Object.keys(orgUsage)
      const { data: orgNames } = await adminClient
        .from('organizations')
        .select('id, name')
        .in('id', orgIds.length > 0 ? orgIds : ['00000000-0000-0000-0000-000000000000'])

      const usageByOrg = orgIds.map(orgId => ({
        organization_id: orgId,
        organization_name: (orgNames || []).find((o: any) => o.id === orgId)?.name || 'Desconhecida',
        request_count: orgUsage[orgId],
      })).sort((a, b) => b.request_count - a.request_count)

      return new Response(JSON.stringify({
        total_requests_30d: execCount || 0,
        usage_by_org: usageByOrg,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'ai_usage') {
      const body = req.method === 'POST' ? await req.json() : {}
      const today = new Date()
      const defaultFrom = new Date(today)
      defaultFrom.setDate(defaultFrom.getDate() - 6)
      const dateFrom = String(body.date_from || defaultFrom.toISOString().slice(0, 10))
      const dateTo = String(body.date_to || today.toISOString().slice(0, 10))
      const aiModeFilter = String(body.ai_mode || 'all')
      const startIso = `${dateFrom}T00:00:00.000Z`
      const endIso = `${dateTo}T23:59:59.999Z`
      const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
      const fromPeriod = dateFrom.slice(0, 7)
      const toPeriod = dateTo.slice(0, 7)

      const [logsRes, orgsRes, plansRes, integrationsRes, usageRes, currentUsageRes, settingsRes] = await Promise.all([
        adminClient
          .from('agent_execution_logs')
          .select('id, organization_id, created_at, execution_time_ms')
          .gte('created_at', startIso)
          .lte('created_at', endIso),
        adminClient
          .from('organizations')
          .select('id, name, slug, created_at'),
        adminClient
          .from('organization_plans')
          .select('organization_id, status, plan:platform_plans(id, name, slug, ai_mode, max_ai_requests_month)'),
        adminClient
          .from('integration_configs')
          .select('organization_id, openai_api_key'),
        adminClient
          .from('organization_usage')
          .select('organization_id, period, ai_requests, ai_cost_usd')
          .gte('period', fromPeriod)
          .lte('period', toPeriod),
        adminClient
          .from('organization_usage')
          .select('organization_id, period, ai_requests, ai_cost_usd')
          .eq('period', currentPeriod),
        adminClient
          .from('platform_settings')
          .select('value')
          .eq('key', 'ai_usage_connection_settings')
          .maybeSingle(),
      ])

      if (logsRes.error) throw logsRes.error
      if (orgsRes.error) throw orgsRes.error
      if (plansRes.error) throw plansRes.error
      if (integrationsRes.error) throw integrationsRes.error
      if (usageRes.error) throw usageRes.error
      if (currentUsageRes.error) throw currentUsageRes.error
      if (settingsRes.error) throw settingsRes.error

      const savedSettings = settingsRes.data?.value || {}
      const openaiApiKey = savedSettings.openai_api_key || Deno.env.get('WIZZY_OPENAI_API_KEY') || Deno.env.get('OPENAI_API_KEY') || ''
      const openaiAdminKey = savedSettings.openai_admin_key || Deno.env.get('OPENAI_ADMIN_KEY') || ''
      const wizzyAIBudget = Number(savedSettings.wizzy_ai_monthly_budget_usd || 0)
      const alertThreshold = Number(savedSettings.alert_threshold_percent || 80)

      const logs = logsRes.data || []
      const requestCountByOrg: Record<string, number> = {}
      const dailyMap: Record<string, { date: string; total_requests: number; own_api_requests: number; wizzy_ai_requests: number }> = {}
      for (const log of logs as any[]) {
        const orgId = log.organization_id
        requestCountByOrg[orgId] = (requestCountByOrg[orgId] || 0) + 1
      }

      const planByOrg = new Map((plansRes.data || []).map((row: any) => [row.organization_id, row]))
      const integrationByOrg = new Map((integrationsRes.data || []).map((row: any) => [row.organization_id, row]))
      const currentUsageByOrg = new Map((currentUsageRes.data || []).map((row: any) => [row.organization_id, row]))
      const periodUsageByOrg = new Map<string, { ai_requests: number; ai_cost_usd: number }>()
      for (const row of (usageRes.data || []) as any[]) {
        const current = periodUsageByOrg.get(row.organization_id) || { ai_requests: 0, ai_cost_usd: 0 }
        current.ai_requests += Number(row.ai_requests || 0)
        current.ai_cost_usd += Number(row.ai_cost_usd || 0)
        periodUsageByOrg.set(row.organization_id, current)
      }

      const rows = (orgsRes.data || []).map((org: any) => {
        const planRow: any = planByOrg.get(org.id) || {}
        const plan = planRow.plan || {}
        const aiMode = plan.ai_mode === 'platform_api' ? 'platform_api' : 'own_api'
        const monthlyLimit = Number(plan.max_ai_requests_month || 0)
        const monthlyUsage = currentUsageByOrg.get(org.id) as any
        const periodUsage = periodUsageByOrg.get(org.id)
        const monthlyUsed = Number(monthlyUsage?.ai_requests || 0)
        const remaining = monthlyLimit > 0 ? Math.max(monthlyLimit - monthlyUsed, 0) : null
        const usagePercent = monthlyLimit > 0 ? Math.round((monthlyUsed / monthlyLimit) * 100) : null
        const loggedPeriodRequests = Number(requestCountByOrg[org.id] || 0)
        const usagePeriodRequests = Number(periodUsage?.ai_requests || 0)
        const periodRequests = loggedPeriodRequests > 0 ? loggedPeriodRequests : usagePeriodRequests
        const integration = integrationByOrg.get(org.id) as any

        return {
          organization_id: org.id,
          organization_name: org.name || org.slug || 'Sem nome',
          plan_name: plan.name || 'Sem plano',
          plan_slug: plan.slug || null,
          plan_status: planRow.status || null,
          ai_mode: aiMode,
          api_type: aiMode === 'platform_api' ? 'Wizzy AI' : 'API propria',
          has_openai_key: !!integration?.openai_api_key,
          period_requests: periodRequests,
          monthly_used: monthlyUsed,
          monthly_limit: monthlyLimit || null,
          monthly_remaining: remaining,
          monthly_usage_percent: usagePercent,
          ai_cost_usd: Number(periodUsage?.ai_cost_usd || 0),
        }
      }).filter((row: any) => {
        if (aiModeFilter === 'platform_api') return row.ai_mode === 'platform_api'
        if (aiModeFilter === 'own_api') return row.ai_mode === 'own_api'
        return true
      }).sort((a: any, b: any) => b.period_requests - a.period_requests)

      const modeByOrg = new Map(rows.map((row: any) => [row.organization_id, row.ai_mode]))
      for (const log of logs as any[]) {
        const date = String(log.created_at || '').slice(0, 10)
        const mode = modeByOrg.get(log.organization_id)
        if (!mode) continue
        if (!dailyMap[date]) dailyMap[date] = { date, total_requests: 0, own_api_requests: 0, wizzy_ai_requests: 0 }
        dailyMap[date].total_requests += 1
        if (mode === 'platform_api') dailyMap[date].wizzy_ai_requests += 1
        else dailyMap[date].own_api_requests += 1
      }

      const summary = rows.reduce((acc: any, row: any) => {
        acc.total_requests += row.period_requests
        acc.total_monthly_used += row.monthly_used
        acc.total_monthly_limit += row.monthly_limit || 0
        acc.total_cost_usd += row.ai_cost_usd
        if (row.ai_mode === 'platform_api') {
          acc.wizzy_ai_requests += row.period_requests
          acc.wizzy_ai_monthly_used += row.monthly_used
          acc.wizzy_ai_organizations += 1
        } else {
          acc.own_api_requests += row.period_requests
          acc.own_api_monthly_used += row.monthly_used
          acc.own_api_organizations += 1
        }
        return acc
      }, {
        total_requests: 0,
        total_monthly_used: 0,
        total_monthly_limit: 0,
        total_cost_usd: 0,
        wizzy_ai_requests: 0,
        wizzy_ai_monthly_used: 0,
        wizzy_ai_organizations: 0,
        own_api_requests: 0,
        own_api_monthly_used: 0,
        own_api_organizations: 0,
        total_organizations: rows.length,
      })

      let openaiCosts: any = null
      if (openaiAdminKey) {
        try {
          const startSeconds = Math.floor(new Date(startIso).getTime() / 1000)
          const endSeconds = Math.floor(new Date(endIso).getTime() / 1000)
          const params = new URLSearchParams({
            start_time: String(startSeconds),
            end_time: String(endSeconds),
            limit: '180',
          })
          const costResponse = await fetch(`https://api.openai.com/v1/organization/costs?${params.toString()}`, {
            headers: {
              Authorization: `Bearer ${openaiAdminKey}`,
              'Content-Type': 'application/json',
            },
          })
          const costJson = await costResponse.json().catch(() => null)
          if (costResponse.ok) {
            const total = (costJson?.data || []).reduce((sum: number, bucket: any) => {
              const bucketTotal = (bucket.results || []).reduce((inner: number, result: any) => {
                return inner + Number(result.amount?.value || 0)
              }, 0)
              return sum + bucketTotal
            }, 0)
            openaiCosts = {
              configured: true,
              available: true,
              total_usd: total,
              currency: 'usd',
            }
          } else {
            openaiCosts = {
              configured: true,
              available: false,
              error: costJson?.error?.message || 'Falha ao consultar custos OpenAI',
            }
          }
        } catch (err: any) {
          openaiCosts = {
            configured: true,
            available: false,
            error: err?.message || 'Falha ao consultar custos OpenAI',
          }
        }
      } else {
        openaiCosts = { configured: false, available: false, total_usd: 0 }
      }

      summary.wizzy_ai_budget_usd = wizzyAIBudget
      summary.wizzy_ai_real_cost_usd = Number(openaiCosts?.total_usd || 0)
      summary.wizzy_ai_budget_usage_percent = wizzyAIBudget > 0 ? Math.round((summary.wizzy_ai_real_cost_usd / wizzyAIBudget) * 100) : null

      return new Response(JSON.stringify({
        filters: { date_from: dateFrom, date_to: dateTo, ai_mode: aiModeFilter, current_period: currentPeriod, from_period: fromPeriod, to_period: toPeriod },
        summary,
        settings: {
          openai_api_key_configured: !!openaiApiKey,
          openai_api_key_masked: maskSecret(openaiApiKey),
          openai_admin_key_configured: !!openaiAdminKey,
          openai_admin_key_masked: maskSecret(openaiAdminKey),
          wizzy_ai_monthly_budget_usd: wizzyAIBudget,
          alert_threshold_percent: alertThreshold,
          openai_costs: openaiCosts,
        },
        daily: Object.values(dailyMap).sort((a: any, b: any) => a.date.localeCompare(b.date)),
        organizations: rows,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'update_ai_usage_settings') {
      const body = await req.json()
      const { data: existingRow } = await adminClient
        .from('platform_settings')
        .select('value')
        .eq('key', 'ai_usage_connection_settings')
        .maybeSingle()

      const existing = existingRow?.value || {}
      const keepSecret = (next: unknown, previous: string | undefined) => {
        const value = String(next || '').trim()
        if (!value || value.includes('•') || value.includes('Ã¢') || value.includes('â€¢')) return previous || ''
        return value
      }

      const settings = {
        openai_api_key: keepSecret(body.openai_api_key, existing.openai_api_key || Deno.env.get('WIZZY_OPENAI_API_KEY') || Deno.env.get('OPENAI_API_KEY')),
        openai_admin_key: keepSecret(body.openai_admin_key, existing.openai_admin_key || Deno.env.get('OPENAI_ADMIN_KEY')),
        wizzy_ai_monthly_budget_usd: Math.max(0, Number(body.wizzy_ai_monthly_budget_usd || existing.wizzy_ai_monthly_budget_usd || 0)),
        alert_threshold_percent: Math.min(100, Math.max(1, Number(body.alert_threshold_percent || existing.alert_threshold_percent || 80))),
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }

      const { error } = await adminClient
        .from('platform_settings')
        .upsert({
          key: 'ai_usage_connection_settings',
          value: settings,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        }, { onConflict: 'key' })
      if (error) throw error

      await adminClient.from('admin_audit_logs').insert({
        action: 'update_ai_usage_settings',
        entity_type: 'platform',
        performed_by: user.id,
        details: {
          ...settings,
          openai_api_key: maskSecret(settings.openai_api_key),
          openai_admin_key: maskSecret(settings.openai_admin_key),
        },
      })

      return new Response(JSON.stringify({
        settings: {
          ...settings,
          openai_api_key: maskSecret(settings.openai_api_key),
          openai_admin_key: maskSecret(settings.openai_admin_key),
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'whatsapp_integrations') {
      const { data: settingsRows } = await adminClient
        .from('platform_settings')
        .select('key, value')
        .in('key', ['whatsapp_provider_strategy', 'whatsapp_connection_settings'])

      const savedStrategy = (settingsRows || []).find((s: any) => s.key === 'whatsapp_provider_strategy')?.value || {}
      const savedConnection = (settingsRows || []).find((s: any) => s.key === 'whatsapp_connection_settings')?.value || {}
      const webhookUrl = savedConnection.webhook_url || `${supabaseUrl}/functions/v1/zapi-webhook`
      const rawConnection = {
        uazapi_base_url: normalizeBaseUrl(savedConnection.uazapi_base_url || Deno.env.get('UAZAPI_BASE_URL')),
        uazapi_admin_token: savedConnection.uazapi_admin_token || Deno.env.get('UAZAPI_ADMIN_TOKEN') || '',
        evolution_base_url: normalizeBaseUrl(savedConnection.evolution_base_url || Deno.env.get('EVOLUTION_BASE_URL')),
        evolution_api_key: savedConnection.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY') || '',
        webhook_url: webhookUrl,
      }
      const connection = {
        uazapi_base_url: rawConnection.uazapi_base_url,
        uazapi_admin_token_masked: maskSecret(rawConnection.uazapi_admin_token),
        uazapi_admin_token_configured: !!rawConnection.uazapi_admin_token,
        evolution_base_url: rawConnection.evolution_base_url,
        evolution_api_key_masked: maskSecret(rawConnection.evolution_api_key),
        evolution_api_key_configured: !!rawConnection.evolution_api_key,
        webhook_url: rawConnection.webhook_url,
      }
      const strategy = {
        primary_provider: savedStrategy.primary_provider || 'evolution',
        backup_provider: savedStrategy.backup_provider || 'uazapi',
        evolution_enabled: savedStrategy.evolution_enabled ?? true,
        uazapi_enabled: savedStrategy.uazapi_enabled ?? true,
        auto_fallback_enabled: savedStrategy.auto_fallback_enabled ?? false,
        updated_at: savedStrategy.updated_at || null,
        updated_by: savedStrategy.updated_by || null,
      }

      const { data: instances, error: instancesError } = await adminClient
        .from('whatsapp_instances')
        .select('id, organization_id, label, phone_number, status, is_active, connected_at, disconnected_at, updated_at, zapi_instance_id, provider, evolution_instance_name, evolution_instance_id')
        .order('updated_at', { ascending: false })

      if (instancesError) throw instancesError

      const orgIds = [...new Set((instances || []).map((i: any) => i.organization_id).filter(Boolean))]
      const { data: orgs } = await adminClient
        .from('organizations')
        .select('id, name, slug')
        .in('id', orgIds.length > 0 ? orgIds : ['00000000-0000-0000-0000-000000000000'])

      const orgMap = new Map((orgs || []).map((org: any) => [org.id, org]))
      const enrichedInstances = (instances || []).map((instance: any) => ({
        ...instance,
        organization: orgMap.get(instance.organization_id) || null,
        logical_phone: canonicalPhone(instance.phone_number),
        label_key: normalizeLabel(instance.label),
        providers: {
          uazapi: {
            configured: (instance.provider || 'uazapi') === 'uazapi' && (!!instance.zapi_token || !!instance.zapi_instance_id),
            status: (instance.provider || 'uazapi') === 'uazapi' ? instance.status : 'not_configured',
            active: (instance.provider || 'uazapi') === 'uazapi' ? instance.is_active : false,
            external_id: (instance.provider || 'uazapi') === 'uazapi' ? instance.zapi_instance_id : null,
          },
          evolution: {
            configured: instance.provider === 'evolution' && (!!instance.evolution_instance_name || !!instance.zapi_instance_id),
            status: instance.provider === 'evolution' ? instance.status : 'not_configured',
            active: instance.provider === 'evolution' ? instance.is_active : false,
            external_id: instance.provider === 'evolution' ? (instance.evolution_instance_name || instance.zapi_instance_id) : null,
          },
        },
      }))

      const groupedInstances: any[] = []
      const groupByKey = new Map<string, any>()
      const backupCandidates = enrichedInstances.filter((instance: any) => (instance.provider || 'uazapi') === 'uazapi')

      const mergeIntoGroup = (group: any, instance: any) => {
        const provider = instance.provider === 'evolution' ? 'evolution' : 'uazapi'
        group.source_instances.push(instance)
        group.updated_at = !group.updated_at || new Date(instance.updated_at) > new Date(group.updated_at)
          ? instance.updated_at
          : group.updated_at
        group.phone_number = group.phone_number || instance.phone_number || instance.logical_phone || null
        group.label = group.label || instance.label
        group.id = group.id || instance.id
        group.status = group.status === 'connected' || instance.status === 'connected' ? 'connected' : (group.status || instance.status)
        group.is_active = group.is_active || instance.is_active
        group.providers[provider] = {
          configured: true,
          status: instance.status,
          active: instance.is_active,
          external_id: provider === 'evolution'
            ? (instance.evolution_instance_name || instance.evolution_instance_id || instance.zapi_instance_id)
            : instance.zapi_instance_id,
          instance_id: instance.id,
          label: instance.label,
          phone_number: instance.phone_number,
        }
      }

      for (const instance of enrichedInstances) {
        let key = instance.logical_phone
          ? `${instance.organization_id}:phone:${instance.logical_phone}`
          : `${instance.organization_id}:id:${instance.id}`

        if (instance.provider === 'evolution' && !instance.logical_phone && instance.label_key) {
          const match = backupCandidates.find((candidate: any) =>
            candidate.organization_id === instance.organization_id &&
            candidate.label_key &&
            (candidate.label_key === instance.label_key || candidate.label_key.includes(instance.label_key) || instance.label_key.includes(candidate.label_key))
          )
          if (match?.logical_phone) {
            key = `${instance.organization_id}:phone:${match.logical_phone}`
          }
        }

        let group = groupByKey.get(key)
        if (!group) {
          group = {
            id: key,
            organization_id: instance.organization_id,
            organization: instance.organization,
            label: instance.label,
            phone_number: instance.phone_number || instance.logical_phone || null,
            status: instance.status,
            is_active: instance.is_active,
            updated_at: instance.updated_at,
            source_instances: [],
            providers: {
              uazapi: { configured: false, status: 'not_configured', active: false, external_id: null },
              evolution: { configured: false, status: 'not_configured', active: false, external_id: null },
            },
          }
          groupByKey.set(key, group)
          groupedInstances.push(group)
        }
        mergeIntoGroup(group, instance)
      }

      const summary = {
        total_instances: groupedInstances.length,
        active_instances: groupedInstances.filter((i: any) => i.is_active).length,
        connected_instances: groupedInstances.filter((i: any) => i.status === 'connected').length,
        disconnected_instances: groupedInstances.filter((i: any) => i.status === 'disconnected').length,
      }
      const [uazapiStatus, evolutionStatus] = await Promise.all([
        checkUazapiStatus(rawConnection.uazapi_base_url, rawConnection.uazapi_admin_token),
        checkEvolutionStatus(rawConnection.evolution_base_url, rawConnection.evolution_api_key),
      ])

      return new Response(JSON.stringify({
        strategy,
        connection,
        provider_status: {
          uazapi: uazapiStatus,
          evolution: evolutionStatus,
        },
        summary,
        instances: groupedInstances,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'update_whatsapp_strategy') {
      const body = await req.json()
      const allowedProviders = ['evolution', 'uazapi']
      const primaryProvider = body.primary_provider
      const backupProvider = body.backup_provider

      if (!allowedProviders.includes(primaryProvider) || !allowedProviders.includes(backupProvider)) {
        throw new Error('Invalid WhatsApp provider')
      }

      if (primaryProvider === backupProvider) {
        throw new Error('Primary and backup providers must be different')
      }

      const strategy = {
        primary_provider: primaryProvider,
        backup_provider: backupProvider,
        evolution_enabled: Boolean(body.evolution_enabled),
        uazapi_enabled: Boolean(body.uazapi_enabled),
        auto_fallback_enabled: Boolean(body.auto_fallback_enabled),
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }

      const { error } = await adminClient
        .from('platform_settings')
        .upsert({
          key: 'whatsapp_provider_strategy',
          value: strategy,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        }, { onConflict: 'key' })

      if (error) throw error

      await adminClient.from('admin_audit_logs').insert({
        action: 'update_whatsapp_strategy',
        entity_type: 'platform',
        performed_by: user.id,
        details: strategy,
      })

      return new Response(JSON.stringify({ strategy }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'update_whatsapp_connection_settings') {
      const body = await req.json()
      const { data: existingRow } = await adminClient
        .from('platform_settings')
        .select('value')
        .eq('key', 'whatsapp_connection_settings')
        .maybeSingle()

      const existing = existingRow?.value || {}
      const keepSecret = (next: unknown, previous: string | undefined) => {
        const value = String(next || '').trim()
        if (!value || value.includes('•')) return previous || ''
        return value
      }
      const connectionSettings = {
        uazapi_base_url: normalizeBaseUrl(body.uazapi_base_url ?? existing.uazapi_base_url ?? Deno.env.get('UAZAPI_BASE_URL')),
        uazapi_admin_token: keepSecret(body.uazapi_admin_token, existing.uazapi_admin_token || Deno.env.get('UAZAPI_ADMIN_TOKEN')),
        evolution_base_url: normalizeBaseUrl(body.evolution_base_url ?? existing.evolution_base_url ?? Deno.env.get('EVOLUTION_BASE_URL')),
        evolution_api_key: keepSecret(body.evolution_api_key, existing.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY')),
        webhook_url: String(body.webhook_url || existing.webhook_url || `${supabaseUrl}/functions/v1/zapi-webhook`).trim(),
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }

      const { error } = await adminClient
        .from('platform_settings')
        .upsert({
          key: 'whatsapp_connection_settings',
          value: connectionSettings,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        }, { onConflict: 'key' })

      if (error) throw error

      await adminClient.from('admin_audit_logs').insert({
        action: 'update_whatsapp_connection_settings',
        entity_type: 'platform',
        performed_by: user.id,
        details: {
          ...connectionSettings,
          uazapi_admin_token: maskSecret(connectionSettings.uazapi_admin_token),
          evolution_api_key: maskSecret(connectionSettings.evolution_api_key),
        },
      })

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'payment_gateways') {
      const { data: settingsRows } = await adminClient
        .from('platform_settings')
        .select('key, value')
        .in('key', ['payment_gateway_strategy', 'payment_gateway_connection_settings'])

      const savedStrategy = (settingsRows || []).find((s: any) => s.key === 'payment_gateway_strategy')?.value || {}
      const savedConnection = (settingsRows || []).find((s: any) => s.key === 'payment_gateway_connection_settings')?.value || {}

      const strategy = {
        active_provider: savedStrategy.active_provider || 'asaas',
        asaas_enabled: savedStrategy.asaas_enabled ?? true,
        stripe_enabled: savedStrategy.stripe_enabled ?? false,
        test_mode: savedStrategy.test_mode ?? true,
        updated_at: savedStrategy.updated_at || null,
        updated_by: savedStrategy.updated_by || null,
      }

      const rawConnection = {
        asaas_base_url: normalizeBaseUrl(savedConnection.asaas_base_url || Deno.env.get('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com/v3'),
        asaas_api_key: savedConnection.asaas_api_key || Deno.env.get('ASAAS_API_KEY') || '',
        asaas_webhook_token: savedConnection.asaas_webhook_token || Deno.env.get('ASAAS_WEBHOOK_TOKEN') || '',
        stripe_secret_key: savedConnection.stripe_secret_key || Deno.env.get('STRIPE_SECRET_KEY') || '',
        stripe_publishable_key: savedConnection.stripe_publishable_key || Deno.env.get('STRIPE_PUBLISHABLE_KEY') || '',
        stripe_webhook_secret: savedConnection.stripe_webhook_secret || Deno.env.get('STRIPE_WEBHOOK_SECRET') || '',
        checkout_success_url: savedConnection.checkout_success_url || `${supabaseUrl}/plans?checkout=success`,
        checkout_cancel_url: savedConnection.checkout_cancel_url || `${supabaseUrl}/plans?checkout=cancel`,
      }

      const webhooks = {
        asaas: `${supabaseUrl}/functions/v1/asaas-webhook`,
        stripe: `${supabaseUrl}/functions/v1/stripe-webhook`,
      }

      const connection = {
        asaas_base_url: rawConnection.asaas_base_url,
        asaas_api_key_masked: maskSecret(rawConnection.asaas_api_key),
        asaas_api_key_configured: !!rawConnection.asaas_api_key,
        asaas_webhook_token_masked: maskSecret(rawConnection.asaas_webhook_token),
        asaas_webhook_token_configured: !!rawConnection.asaas_webhook_token,
        stripe_secret_key_masked: maskSecret(rawConnection.stripe_secret_key),
        stripe_secret_key_configured: !!rawConnection.stripe_secret_key,
        stripe_publishable_key: rawConnection.stripe_publishable_key,
        stripe_publishable_key_configured: !!rawConnection.stripe_publishable_key,
        stripe_webhook_secret_masked: maskSecret(rawConnection.stripe_webhook_secret),
        stripe_webhook_secret_configured: !!rawConnection.stripe_webhook_secret,
        checkout_success_url: rawConnection.checkout_success_url,
        checkout_cancel_url: rawConnection.checkout_cancel_url,
      }

      return new Response(JSON.stringify({
        strategy,
        connection,
        provider_status: {
          asaas: {
            provider: 'asaas',
            configured: !!rawConnection.asaas_api_key,
            webhook_url: webhooks.asaas,
          },
          stripe: {
            provider: 'stripe',
            configured: !!rawConnection.stripe_secret_key && !!rawConnection.stripe_publishable_key,
            webhook_url: webhooks.stripe,
          },
        },
        summary: {
          configured_webhooks: `${[
            rawConnection.asaas_webhook_token,
            rawConnection.stripe_webhook_secret,
          ].filter(Boolean).length}/2`,
        },
        webhooks,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'ai_models') {
      const defaultStrategy = {
        provider: 'openai',
        default_model: 'gpt-4o-mini',
        features: {
          agents: 'gpt-4o-mini',
          conversation_summary: 'gpt-4o-mini',
          prompt_generation: 'gpt-4.1-mini',
          flow_generation: 'gpt-4.1',
          transcription: 'gpt-4o-mini-transcribe',
          document_processing: 'gpt-4.1-mini',
          document_field_unification: 'gpt-4.1-mini',
          training_rules: 'gpt-4.1-mini',
          remarketing: 'gpt-4.1-mini',
          qualification_rules: 'gpt-4.1-mini',
          flow_ai: 'gpt-4.1-mini',
        },
      }

      const { data: row } = await adminClient
        .from('platform_settings')
        .select('value')
        .eq('key', 'ai_model_strategy')
        .maybeSingle()

      const saved = row?.value || {}
      return new Response(JSON.stringify({
        strategy: {
          ...defaultStrategy,
          ...saved,
          provider: 'openai',
          features: {
            ...defaultStrategy.features,
            ...(saved.features || {}),
          },
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'update_ai_models') {
      const body = await req.json()
      const textModels = [
        'gpt-5.2',
        'gpt-5.1',
        'gpt-5',
        'gpt-5-mini',
        'gpt-5-nano',
        'gpt-4.1',
        'gpt-4.1-mini',
        'gpt-4.1-nano',
        'gpt-4o',
        'gpt-4o-mini',
      ]
      const transcriptionModels = [
        'gpt-4o-transcribe',
        'gpt-4o-mini-transcribe',
        'whisper-1',
      ]
      const allowedFeatures = [
        'agents',
        'conversation_summary',
        'prompt_generation',
        'flow_generation',
        'transcription',
        'document_processing',
        'document_field_unification',
        'training_rules',
        'remarketing',
        'qualification_rules',
        'flow_ai',
      ]
      const defaultModel = String(body.default_model || 'gpt-4o-mini').trim()
      if (!textModels.includes(defaultModel)) throw new Error('Modelo padrão inválido')

      const nextFeatures: Record<string, string> = {}
      for (const feature of allowedFeatures) {
        const model = String(body.features?.[feature] || defaultModel).trim()
        const allowedModels = feature === 'transcription' ? transcriptionModels : textModels
        if (!allowedModels.includes(model)) throw new Error(`Modelo inválido para ${feature}`)
        nextFeatures[feature] = model
      }

      const strategy = {
        provider: 'openai',
        default_model: defaultModel,
        features: nextFeatures,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }

      const { error } = await adminClient
        .from('platform_settings')
        .upsert({
          key: 'ai_model_strategy',
          value: strategy,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        }, { onConflict: 'key' })
      if (error) throw error

      await adminClient.from('admin_audit_logs').insert({
        action: 'update_ai_models',
        entity_type: 'platform',
        performed_by: user.id,
        details: strategy,
      })

      return new Response(JSON.stringify({ strategy }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'update_payment_gateway_strategy') {
      const body = await req.json()
      const allowedProviders = ['asaas', 'stripe']
      const activeProvider = body.active_provider

      if (!allowedProviders.includes(activeProvider)) {
        throw new Error('Invalid payment gateway')
      }

      const asaasEnabled = Boolean(body.asaas_enabled)
      const stripeEnabled = Boolean(body.stripe_enabled)
      if ((activeProvider === 'asaas' && !asaasEnabled) || (activeProvider === 'stripe' && !stripeEnabled)) {
        throw new Error('Active payment gateway must be enabled')
      }

      const strategy = {
        active_provider: activeProvider,
        asaas_enabled: asaasEnabled,
        stripe_enabled: stripeEnabled,
        test_mode: Boolean(body.test_mode),
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }

      const { error } = await adminClient
        .from('platform_settings')
        .upsert({
          key: 'payment_gateway_strategy',
          value: strategy,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        }, { onConflict: 'key' })

      if (error) throw error

      await adminClient.from('admin_audit_logs').insert({
        action: 'update_payment_gateway_strategy',
        entity_type: 'platform',
        performed_by: user.id,
        details: strategy,
      })

      return new Response(JSON.stringify({ strategy }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'update_payment_gateway_connection_settings') {
      const body = await req.json()
      const { data: existingRow } = await adminClient
        .from('platform_settings')
        .select('value')
        .eq('key', 'payment_gateway_connection_settings')
        .maybeSingle()

      const existing = existingRow?.value || {}
      const keepSecret = (next: unknown, previous: string | undefined) => {
        const value = String(next || '').trim()
        if (!value || value.includes('•') || value.includes('â€¢')) return previous || ''
        return value
      }
      const connectionSettings = {
        asaas_base_url: normalizeBaseUrl(body.asaas_base_url ?? existing.asaas_base_url ?? Deno.env.get('ASAAS_BASE_URL') ?? 'https://api-sandbox.asaas.com/v3'),
        asaas_api_key: keepSecret(body.asaas_api_key, existing.asaas_api_key || Deno.env.get('ASAAS_API_KEY')),
        asaas_webhook_token: keepSecret(body.asaas_webhook_token, existing.asaas_webhook_token || Deno.env.get('ASAAS_WEBHOOK_TOKEN')),
        stripe_secret_key: keepSecret(body.stripe_secret_key, existing.stripe_secret_key || Deno.env.get('STRIPE_SECRET_KEY')),
        stripe_publishable_key: String(body.stripe_publishable_key ?? existing.stripe_publishable_key ?? Deno.env.get('STRIPE_PUBLISHABLE_KEY') ?? '').trim(),
        stripe_webhook_secret: keepSecret(body.stripe_webhook_secret, existing.stripe_webhook_secret || Deno.env.get('STRIPE_WEBHOOK_SECRET')),
        checkout_success_url: String(body.checkout_success_url || existing.checkout_success_url || `${supabaseUrl}/plans?checkout=success`).trim(),
        checkout_cancel_url: String(body.checkout_cancel_url || existing.checkout_cancel_url || `${supabaseUrl}/plans?checkout=cancel`).trim(),
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }

      const { error } = await adminClient
        .from('platform_settings')
        .upsert({
          key: 'payment_gateway_connection_settings',
          value: connectionSettings,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        }, { onConflict: 'key' })

      if (error) throw error

      await adminClient.from('admin_audit_logs').insert({
        action: 'update_payment_gateway_connection_settings',
        entity_type: 'platform',
        performed_by: user.id,
        details: {
          ...connectionSettings,
          asaas_api_key: maskSecret(connectionSettings.asaas_api_key),
          asaas_webhook_token: maskSecret(connectionSettings.asaas_webhook_token),
          stripe_secret_key: maskSecret(connectionSettings.stripe_secret_key),
          stripe_webhook_secret: maskSecret(connectionSettings.stripe_webhook_secret),
        },
      })

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'update_plan') {
      const body = await req.json()
      const { id, ...updates } = body

      if (id) {
        const { data, error } = await adminClient.from('platform_plans').update(updates).eq('id', id).select().single()
        if (error) throw error
        return new Response(JSON.stringify({ plan: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } else {
        const { data, error } = await adminClient.from('platform_plans').insert(updates).select().single()
        if (error) throw error
        return new Response(JSON.stringify({ plan: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    if (action === 'assign_plan') {
      const body = await req.json()
      const { organization_id, plan_id } = body
      const allowedPaymentStatuses = ['trial', 'manual', 'paid']
      const paymentStatus = allowedPaymentStatuses.includes(body.payment_status) ? body.payment_status : 'paid'
      const trialEndsAt = paymentStatus === 'trial' && body.trial_ends_at
        ? new Date(body.trial_ends_at)
        : null

      if (paymentStatus === 'trial' && (!trialEndsAt || Number.isNaN(trialEndsAt.getTime()))) {
        throw new Error('Data final do teste gratis invalida')
      }

      const { data, error } = await adminClient
        .from('organization_plans')
        .upsert({
          organization_id,
          plan_id,
          status: 'active',
          payment_status: paymentStatus,
          trial_ends_at: trialEndsAt ? trialEndsAt.toISOString() : null,
          current_period_start: new Date().toISOString(),
          current_period_end: trialEndsAt ? trialEndsAt.toISOString() : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id' })
        .select()
        .single()

      if (error) throw error
      await adminClient.from('admin_audit_logs').insert({
        action: paymentStatus === 'trial'
          ? 'assign_trial_plan'
          : paymentStatus === 'manual'
            ? 'assign_manual_access_plan'
            : 'assign_paid_plan',
        entity_type: 'organization_plan',
        entity_id: data.id,
        performed_by: user.id,
        details: { organization_id, plan_id, payment_status: paymentStatus, trial_ends_at: trialEndsAt?.toISOString() || null },
      })
      return new Response(JSON.stringify({ result: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'org_users') {
      const orgId = url.searchParams.get('org_id')
      if (!orgId) throw new Error('Missing org_id')

      const { data: profiles } = await adminClient
        .from('profiles')
        .select('id, user_id, full_name, avatar_url, phone, created_at')
        .eq('organization_id', orgId)

      const userIds = (profiles || []).map((p: any) => p.user_id)
      
      const { data: roles } = await adminClient
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000'])

      // Fetch fingerprints for each user in this org
      const { data: allFingerprints } = await adminClient
        .from('user_fingerprints')
        .select('*')
        .in('user_id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000'])
        .order('created_at', { ascending: false })

      const fingerprintsByUser: Record<string, any[]> = {}
      ;(allFingerprints || []).forEach((fp: any) => {
        if (!fp.user_id) return
        if (!fingerprintsByUser[fp.user_id]) fingerprintsByUser[fp.user_id] = []
        fingerprintsByUser[fp.user_id].push(fp)
      })

      const usersInfo: Record<string, any> = {}
      for (const uid of userIds) {
        try {
          const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(uid)
          if (authUser) {
            usersInfo[uid] = { email: authUser.email, banned: !!(authUser as any).banned_until }
          }
        } catch (_) {}
      }

      const roleMap = new Map<string, string>()
      ;(roles || []).forEach((r: any) => roleMap.set(r.user_id, r.role))

      const users = (profiles || []).map((p: any) => ({
        id: p.id,
        user_id: p.user_id,
        name: p.full_name,
        email: usersInfo[p.user_id]?.email || '',
        phone: p.phone,
        role: roleMap.get(p.user_id) || 'agent',
        avatar_url: p.avatar_url,
        created_at: p.created_at,
        is_blocked: usersInfo[p.user_id]?.banned || false,
        fingerprints: fingerprintsByUser[p.user_id] || [],
      }))

      return new Response(JSON.stringify({ users }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'block_user') {
      const body = await req.json()
      const { user_id, block } = body
      if (!user_id) throw new Error('Missing user_id')

      if (block) {
        // Block/reject: ban the user AND remove pending_approval flag so they
        // don't keep showing in the pending approvals list
        const { error } = await adminClient.auth.admin.updateUserById(user_id, {
          ban_duration: '876000h',
          user_metadata: { pending_approval: false },
          app_metadata: { pending_approval: false },
        })
        if (error) throw error
      } else {
        const { error } = await adminClient.auth.admin.updateUserById(user_id, { ban_duration: 'none' })
        if (error) throw error
      }

      await adminClient.from('admin_audit_logs').insert({
        action: block ? 'block_user' : 'unblock_user',
        entity_type: 'user',
        entity_id: user_id,
        performed_by: user.id,
        details: { user_id },
      })

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'block_ip') {
      const body = await req.json()
      const { ip_address, reason } = body
      if (!ip_address) throw new Error('Missing ip_address')

      const { error } = await adminClient.from('blocked_fingerprints').insert({
        ip_address,
        reason: reason || 'Bloqueado manualmente pelo administrador',
      })
      if (error) throw error

      await adminClient.from('admin_audit_logs').insert({
        action: 'block_ip',
        entity_type: 'fingerprint',
        performed_by: user.id,
        details: { ip_address, reason },
      })

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'approve_user') {
      const body = await req.json()
      const { user_id } = body
      if (!user_id) throw new Error('Missing user_id')

      // Unban the user and remove pending_approval from BOTH metadata fields
      const { error } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: 'none',
        user_metadata: { pending_approval: false },
        app_metadata: { pending_approval: false },
      })
      if (error) throw error

      await adminClient.from('admin_audit_logs').insert({
        action: 'approve_user',
        entity_type: 'user',
        entity_id: user_id,
        performed_by: user.id,
        details: { user_id },
      })

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'pending_approvals') {
      // Get all users with pending_approval flag in EITHER metadata location
      const { data: { users: allUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      const pendingUsers = (allUsers || []).filter((u: any) =>
        u.user_metadata?.pending_approval === true ||
        u.app_metadata?.pending_approval === true
      )

      // Enrich with org info
      const enriched = []
      for (const pu of pendingUsers) {
        const { data: profile } = await adminClient
          .from('profiles')
          .select('organization_id, full_name')
          .eq('user_id', pu.id)
          .maybeSingle()
        
        let orgName = ''
        if (profile?.organization_id) {
          const { data: org } = await adminClient
            .from('organizations')
            .select('name')
            .eq('id', profile.organization_id)
            .single()
          orgName = org?.name || ''
        }

        // Get fingerprint for this user
        const { data: fp } = await adminClient
          .from('user_fingerprints')
          .select('ip_address, browser_data, location_data, user_agent, created_at')
          .eq('user_id', pu.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        enriched.push({
          user_id: pu.id,
          email: pu.email,
          name: profile?.full_name || '',
          organization_id: profile?.organization_id,
          organization_name: orgName,
          created_at: pu.created_at,
          is_banned: !!(pu as any).banned_until,
          fingerprint: fp || null,
        })
      }

      return new Response(JSON.stringify({ pending: enriched }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'delete_organization') {
      const { organization_id } = await req.json()
      if (!organization_id) throw new Error('Missing organization_id')

      const { data: profiles } = await adminClient
        .from('profiles')
        .select('user_id')
        .eq('organization_id', organization_id)

      const userIds = (profiles || []).map(p => p.user_id)

      const { data: fingerprints } = await adminClient
        .from('user_fingerprints')
        .select('ip_address, user_agent')
        .eq('organization_id', organization_id)

      if (fingerprints && fingerprints.length > 0) {
        const uniqueIps = [...new Set(fingerprints.map(f => f.ip_address))]
        await adminClient.from('blocked_fingerprints').insert(
          uniqueIps.map(ip => ({
            ip_address: ip,
            reason: `Organização excluída pelo administrador (Org: ${organization_id})`,
          }))
        )
      }

      for (const userId of userIds) {
        await adminClient.auth.admin.deleteUser(userId)
      }

      const { error: deleteError } = await adminClient
        .from('organizations')
        .delete()
        .eq('id', organization_id)

      if (deleteError) throw deleteError

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'delete_org_user') {
      const body = await req.json()
      const { user_id: targetUserId } = body
      if (!targetUserId) throw new Error('Missing user_id')

      await adminClient.from('user_permissions').delete().eq('user_id', targetUserId)
      await adminClient.from('workspace_members').delete().eq('user_id', targetUserId)
      await adminClient.from('user_roles').delete().eq('user_id', targetUserId)
      await adminClient.from('profiles').delete().eq('user_id', targetUserId)

      const { error: delErr } = await adminClient.auth.admin.deleteUser(targetUserId)
      if (delErr) throw delErr

      await adminClient.from('admin_audit_logs').insert({
        action: 'delete_user',
        entity_type: 'user',
        entity_id: targetUserId,
        performed_by: user.id,
        details: { user_id: targetUserId },
      })

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'get_settings') {
      const { data: settings } = await adminClient
        .from('platform_settings')
        .select('key, value')

      const settingsMap: Record<string, any> = {}
      ;(settings || []).forEach((s: any) => { settingsMap[s.key] = s.value })

      return new Response(JSON.stringify({ settings: settingsMap }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'toggle_signups') {
      const body = await req.json()
      const { allow } = body

      const { error } = await adminClient
        .from('platform_settings')
        .upsert({ key: 'allow_signups', value: allow, updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: 'key' })

      if (error) throw error

      if (!allow) {
        const { data: { users: allUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
        const pendingUsers = (allUsers || []).filter((u: any) => u.user_metadata?.pending_approval === true)
        for (const pu of pendingUsers) {
          await adminClient.auth.admin.updateUserById(pu.id, { ban_duration: '876000h' })
        }
      }

      await adminClient.from('admin_audit_logs').insert({
        action: allow ? 'enable_signups' : 'disable_signups',
        entity_type: 'platform',
        performed_by: user.id,
        details: { allow_signups: allow },
      })

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'toggle_client_plans_menu') {
      const body = await req.json()
      const show = body.show === true

      const { error } = await adminClient
        .from('platform_settings')
        .upsert({
          key: 'show_client_plans_menu',
          value: show,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        }, { onConflict: 'key' })

      if (error) throw error

      await adminClient.from('admin_audit_logs').insert({
        action: show ? 'show_client_plans_menu' : 'hide_client_plans_menu',
        entity_type: 'platform',
        performed_by: user.id,
        details: { show_client_plans_menu: show },
      })

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'security_alerts') {
      const { data: alerts, error } = await adminClient.rpc('check_suspicious_activity')
      if (error) throw error

      return new Response(JSON.stringify({ alerts: alerts || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
