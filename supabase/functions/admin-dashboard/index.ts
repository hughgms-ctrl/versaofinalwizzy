import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Parse action from URL
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
      // Get all orgs with their user counts, instance counts, plan info
      const { data: orgs } = await adminClient
        .from('organizations')
        .select('id, name, slug, storage_used_bytes, storage_limit_bytes, created_at')
        .order('created_at', { ascending: false })

      // Get profiles per org
      const { data: profiles } = await adminClient
        .from('profiles')
        .select('id, organization_id, full_name, user_id')

      // Get instances per org
      const { data: instances } = await adminClient
        .from('whatsapp_instances')
        .select('id, organization_id, is_active, phone_number, label, status')

      // Get conversations count per org
      const { data: convCounts } = await adminClient
        .from('conversations')
        .select('organization_id')

      // Get org plans
      const { data: orgPlans } = await adminClient
        .from('organization_plans')
        .select('organization_id, plan_id, status, payment_status, trial_ends_at, current_period_end, platform_plans(name, slug, price_monthly)')

      // Build enriched org list
      const enrichedOrgs = (orgs || []).map((org: any) => {
        const orgProfiles = (profiles || []).filter((p: any) => p.organization_id === org.id)
        const orgInstances = (instances || []).filter((i: any) => i.organization_id === org.id)
        const orgConvs = (convCounts || []).filter((c: any) => c.organization_id === org.id)
        const orgPlan = (orgPlans || []).find((p: any) => p.organization_id === org.id)

        return {
          ...org,
          user_count: orgProfiles.length,
          instance_count: orgInstances.length,
          active_instances: orgInstances.filter((i: any) => i.is_active).length,
          conversation_count: orgConvs.length,
          instances: orgInstances,
          plan: orgPlan ? {
            name: orgPlan.platform_plans?.name,
            slug: orgPlan.platform_plans?.slug,
            price: orgPlan.platform_plans?.price_monthly,
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

    if (action === 'plans') {
      const [plansRes, orgPlansRes] = await Promise.all([
        adminClient.from('platform_plans').select('*').order('price_monthly', { ascending: true }),
        adminClient.from('organization_plans').select('plan_id, status'),
      ])

      const plans = (plansRes.data || []).map((plan: any) => ({
        ...plan,
        subscriber_count: (orgPlansRes.data || []).filter((op: any) => op.plan_id === plan.id && op.status === 'active').length,
      }))

      return new Response(JSON.stringify({ plans }), {
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
      // Get agent execution logs for cost estimation
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data: execLogs, count: execCount } = await adminClient
        .from('agent_execution_logs')
        .select('id, organization_id, execution_time_ms, created_at', { count: 'exact' })
        .gte('created_at', thirtyDaysAgo)

      // Group by org
      const orgUsage: Record<string, number> = {}
      for (const log of execLogs || []) {
        orgUsage[log.organization_id] = (orgUsage[log.organization_id] || 0) + 1
      }

      // Get org names
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

      const { data, error } = await adminClient
        .from('organization_plans')
        .upsert({
          organization_id,
          plan_id,
          status: 'active',
          current_period_start: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id' })
        .select()
        .single()

      if (error) throw error
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
      
      // Get roles
      const { data: roles } = await adminClient
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000'])

      // Get auth user info (email, banned)
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
      }))

      return new Response(JSON.stringify({ users }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'block_user') {
      const body = await req.json()
      const { user_id, block } = body
      if (!user_id) throw new Error('Missing user_id')

      if (block) {
        const { error } = await adminClient.auth.admin.updateUserById(user_id, { ban_duration: '876000h' }) // ~100 years
        if (error) throw error
      } else {
        const { error } = await adminClient.auth.admin.updateUserById(user_id, { ban_duration: 'none' })
        if (error) throw error
      }

      // Audit log
      await adminClient.from('admin_audit_logs').insert({
        action: block ? 'block_user' : 'unblock_user',
        entity_type: 'user',
        entity_id: user_id,
        performed_by: user.id,
        details: { user_id },
      })

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'delete_org_user') {
      const body = await req.json()
      const { user_id: targetUserId } = body
      if (!targetUserId) throw new Error('Missing user_id')

      // Delete permissions, roles, profile, then auth user
      await adminClient.from('user_permissions').delete().eq('user_id', targetUserId)
      await adminClient.from('workspace_members').delete().eq('user_id', targetUserId)
      await adminClient.from('user_roles').delete().eq('user_id', targetUserId)
      await adminClient.from('profiles').delete().eq('user_id', targetUserId)

      const { error: delErr } = await adminClient.auth.admin.deleteUser(targetUserId)
      if (delErr) throw delErr

      // Audit log
      await adminClient.from('admin_audit_logs').insert({
        action: 'delete_user',
        entity_type: 'user',
        entity_id: targetUserId,
        performed_by: user.id,
        details: { user_id: targetUserId },
      })

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})