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

      const { data: convCounts } = await adminClient
        .from('conversations')
        .select('organization_id')

      const { data: orgPlans } = await adminClient
        .from('organization_plans')
        .select('organization_id, plan_id, status, payment_status, trial_ends_at, current_period_end, platform_plans(id, name, slug, price_monthly)')

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
            id: orgPlan.platform_plans?.id,
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