import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FLOW_REDIRECTS: Record<string, string> = {
  payment_first: '/auth?intent=plans',
  signup_first_payment_after: '/auth',
  signup_onboarding_payment_access: '/auth?intent=onboarding',
  trial_auto: '/auth?intent=trial',
  trial_with_card: '/auth?intent=plans',
  manual_approval: '/auth?intent=approval',
  freemium: '/auth?intent=freemium',
  demo_first: '/landing#video',
  onboarding_before_signup: '/auth?intent=onboarding',
  access_limited_payment: '/auth?intent=limited',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeVisitorId(value: unknown) {
  const id = String(value || '').trim()
  return id.slice(0, 120)
}

function chooseVariant(variants: any[]) {
  const enabled = variants.filter((variant) => Number(variant.traffic_percent || 0) > 0)
  if (enabled.length === 0) return variants[0] || null
  const total = enabled.reduce((sum, variant) => sum + Number(variant.traffic_percent || 0), 0)
  let roll = Math.random() * total
  for (const variant of enabled) {
    roll -= Number(variant.traffic_percent || 0)
    if (roll <= 0) return variant
  }
  return enabled[enabled.length - 1]
}

async function getActiveExperiment(supabase: any) {
  const now = Date.now()
  const { data: settingsRow } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'entry_flow_settings')
    .maybeSingle()

  const settings = settingsRow?.value || {}
  if (settings.ab_testing_enabled === false) {
    return { settings, experiment: null, variants: [] }
  }

  const { data: experiments, error } = await supabase
    .from('entry_flow_experiments')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw error
  const experiment = (experiments || []).find((item: any) => {
    const startsAt = item.starts_at ? new Date(item.starts_at).getTime() : null
    const endsAt = item.ends_at ? new Date(item.ends_at).getTime() : null
    return (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now)
  })
  if (!experiment) return { settings, experiment: null, variants: [] }

  const { data: variants, error: variantsError } = await supabase
    .from('entry_flow_variants')
    .select('*')
    .eq('experiment_id', experiment.id)
    .order('created_at', { ascending: true })

  if (variantsError) throw variantsError
  return { settings, experiment, variants: variants || [] }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const action = String(body.action || 'assign')

    if (action === 'event') {
      const visitorId = normalizeVisitorId(body.visitor_id)
      const eventName = String(body.event_name || '').trim().slice(0, 80)
      if (!eventName) return json({ error: 'Missing event_name' }, 400)

      const authHeader = req.headers.get('Authorization')
      let userId: string | null = null
      let organizationId: string | null = null
      if (authHeader) {
        const token = authHeader.replace(/^Bearer\s+/i, '')
        const { data: { user } } = await supabase.auth.getUser(token)
        if (user) {
          userId = user.id
          const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('user_id', user.id)
            .maybeSingle()
          organizationId = profile?.organization_id || null
        }
      }

      let experimentId = body.experiment_id || null
      let variantId = body.variant_id || null
      if ((!experimentId || !variantId) && visitorId) {
        const { data: assignment } = await supabase
          .from('entry_flow_assignments')
          .select('experiment_id, variant_id')
          .eq('visitor_id', visitorId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        experimentId = experimentId || assignment?.experiment_id || null
        variantId = variantId || assignment?.variant_id || null
      }

      await supabase.from('entry_flow_events').insert({
        experiment_id: experimentId,
        variant_id: variantId,
        visitor_id: visitorId || null,
        user_id: userId,
        organization_id: organizationId,
        event_name: eventName,
        metadata: body.metadata || {},
      })

      return json({ success: true })
    }

    const visitorId = normalizeVisitorId(body.visitor_id)
    const { settings, experiment, variants } = await getActiveExperiment(supabase)
    const fallbackFlowType = settings.default_flow_type || 'signup_first_payment_after'
    const fallbackConfig = {
      ...(settings.flow_configs?.[fallbackFlowType] || {}),
      redirect_path: settings.default_redirect || settings.flow_configs?.[fallbackFlowType]?.redirect_path || FLOW_REDIRECTS[fallbackFlowType] || '/auth',
    }

    if (!visitorId || !experiment || variants.length === 0) {
      return json({
        assignment: null,
        experiment: null,
        variant: {
          id: null,
          name: 'Padrao',
          flow_type: fallbackFlowType,
          config: fallbackConfig,
          redirect_path: fallbackConfig.redirect_path,
        },
      })
    }

    const { data: existing } = await supabase
      .from('entry_flow_assignments')
      .select('*, variant:entry_flow_variants(*)')
      .eq('experiment_id', experiment.id)
      .eq('visitor_id', visitorId)
      .maybeSingle()

    if (existing?.variant) {
      return json({
        assignment: existing,
        experiment,
        variant: {
          ...existing.variant,
          redirect_path: existing.variant.config?.redirect_path || FLOW_REDIRECTS[existing.variant.flow_type] || '/auth',
        },
      })
    }

    const variant = chooseVariant(variants)
    if (!variant) throw new Error('No variant available')

    const { data: assignment, error: assignmentError } = await supabase
      .from('entry_flow_assignments')
      .insert({
        experiment_id: experiment.id,
        variant_id: variant.id,
        visitor_id: visitorId,
      })
      .select()
      .single()

    if (assignmentError) throw assignmentError

    await supabase.from('entry_flow_events').insert({
      experiment_id: experiment.id,
      variant_id: variant.id,
      visitor_id: visitorId,
      event_name: 'variant_assigned',
      metadata: { path: body.path || null },
    })

    return json({
      assignment,
      experiment,
      variant: {
        ...variant,
        redirect_path: variant.config?.redirect_path || FLOW_REDIRECTS[variant.flow_type] || '/auth',
      },
    })
  } catch (err: any) {
    console.error('entry-flow error', err?.message || err)
    return json({ error: err?.message || 'Internal server error' }, 500)
  }
})
