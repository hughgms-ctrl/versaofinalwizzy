import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function maskSecret(value?: string | null) {
  if (!value) return ''
  if (value.length <= 8) return '********'
  return `${value.slice(0, 4)}********${value.slice(-4)}`
}

function keepSecret(next: unknown, previous?: string) {
  const value = String(next || '').trim()
  if (!value || value.includes('*') || value.includes('•') || value.includes('â€¢')) return previous || ''
  return value
}

async function fetchOpenAICosts(adminKey: string, startIso: string, endIso: string) {
  const startSeconds = Math.floor(new Date(startIso).getTime() / 1000)
  const endSeconds = Math.floor(new Date(endIso).getTime() / 1000)
  let page: string | null = null
  let total = 0
  let currency = 'usd'
  let buckets = 0

  for (let i = 0; i < 20; i += 1) {
    const params = new URLSearchParams({
      start_time: String(startSeconds),
      end_time: String(endSeconds),
      limit: '180',
    })
    if (page) params.set('page', page)

    const response = await fetch(`https://api.openai.com/v1/organization/costs?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${adminKey}`,
        'Content-Type': 'application/json',
      },
    })
    const json = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(json?.error?.message || 'Falha ao consultar custos OpenAI')
    }

    for (const bucket of json?.data || []) {
      buckets += 1
      for (const result of bucket.results || []) {
        total += Number(result.amount?.value || 0)
        currency = result.amount?.currency || currency
      }
    }

    if (!json?.has_more || !json?.next_page) break
    page = json.next_page
  }

  return { total_usd: total, currency, buckets }
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
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile?.organization_id) throw new Error('Organizacao nao encontrada')

    const orgId = profile.organization_id
    const settingKey = `org_ai_usage_settings_${orgId}`
    const { data: existingRow, error: settingError } = await adminClient
      .from('platform_settings')
      .select('value')
      .eq('key', settingKey)
      .maybeSingle()
    if (settingError) throw settingError

    const now = new Date().toISOString()
    let settings = existingRow?.value || {}

    if (req.method === 'POST') {
      const body = await req.json()
      const previousBalance = Number(settings.credit_balance_usd || 0)
      const nextBalance = Math.max(0, Number(body.credit_balance_usd || 0))
      const balanceChanged = Math.abs(nextBalance - previousBalance) > 0.000001

      settings = {
        openai_admin_key: keepSecret(body.openai_admin_key, settings.openai_admin_key),
        credit_balance_usd: nextBalance,
        alert_threshold_percent: Math.min(100, Math.max(1, Number(body.alert_threshold_percent || settings.alert_threshold_percent || 80))),
        balance_reference_at: balanceChanged || !settings.balance_reference_at ? now : settings.balance_reference_at,
        updated_at: now,
        updated_by: user.id,
      }

      const { error: upsertError } = await adminClient
        .from('platform_settings')
        .upsert({
          key: settingKey,
          value: settings,
          updated_at: now,
          updated_by: user.id,
        }, { onConflict: 'key' })
      if (upsertError) throw upsertError
    }

    const creditBalance = Number(settings.credit_balance_usd || 0)
    const alertThreshold = Number(settings.alert_threshold_percent || 80)
    const referenceAt = settings.balance_reference_at || now
    let usedUsd = 0
    let costsAvailable = false
    let costsError = ''

    if (settings.openai_admin_key && referenceAt) {
      try {
        const costs = await fetchOpenAICosts(settings.openai_admin_key, referenceAt, now)
        usedUsd = Number(costs.total_usd || 0)
        costsAvailable = true
      } catch (err: any) {
        costsError = err?.message || 'Falha ao consultar custos OpenAI'
      }
    }

    const remainingUsd = Math.max(creditBalance - usedUsd, 0)
    const usagePercent = creditBalance > 0 ? Math.round((usedUsd / creditBalance) * 100) : 0

    return new Response(JSON.stringify({
      settings: {
        openai_admin_key_configured: !!settings.openai_admin_key,
        openai_admin_key_masked: maskSecret(settings.openai_admin_key),
        credit_balance_usd: creditBalance,
        alert_threshold_percent: alertThreshold,
        balance_reference_at: referenceAt,
      },
      usage: {
        used_usd: usedUsd,
        remaining_usd: remainingUsd,
        usage_percent: usagePercent,
        is_near_limit: creditBalance > 0 && usagePercent >= alertThreshold,
        is_at_limit: creditBalance > 0 && usedUsd >= creditBalance,
        costs_available: costsAvailable,
        costs_error: costsError,
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
