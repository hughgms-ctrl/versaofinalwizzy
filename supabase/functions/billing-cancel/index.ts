import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalizeBaseUrl(value?: string | null) {
  return (value || '').trim().replace(/\/$/, '')
}

function normalizeAsaasBaseUrl(value: string, testMode: boolean) {
  const baseUrl = normalizeBaseUrl(value)
  if (!baseUrl) return testMode ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3'
  if (baseUrl === 'https://sandbox.asaas.com/api/v3') return 'https://api-sandbox.asaas.com/v3'
  return baseUrl
}

async function fetchJson(url: string, options: RequestInit) {
  const response = await fetch(url, options)
  const text = await response.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch (_) {}
  if (!response.ok) {
    const details = json?.errors?.map((item: any) => item.description).filter(Boolean).join(' | ')
    throw new Error(details || json?.message || text || 'Falha ao cancelar assinatura')
  }
  return json
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
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile?.organization_id) throw new Error('Organizacao nao encontrada')

    const [{ data: orgPlan, error: planError }, { data: settingsRows }] = await Promise.all([
      adminClient
        .from('organization_plans')
        .select('id, organization_id, asaas_subscription_id, stripe_subscription_id')
        .eq('organization_id', profile.organization_id)
        .maybeSingle(),
      adminClient
        .from('platform_settings')
        .select('key, value')
        .in('key', ['payment_gateway_strategy', 'payment_gateway_connection_settings']),
    ])
    if (planError) throw planError
    if (!orgPlan) throw new Error('Assinatura nao encontrada')

    const savedStrategy = (settingsRows || []).find((s: any) => s.key === 'payment_gateway_strategy')?.value || {}
    const savedConnection = (settingsRows || []).find((s: any) => s.key === 'payment_gateway_connection_settings')?.value || {}

    if (orgPlan.asaas_subscription_id) {
      const baseUrl = normalizeAsaasBaseUrl(
        savedConnection.asaas_base_url || Deno.env.get('ASAAS_BASE_URL') || '',
        savedStrategy.test_mode !== false,
      )
      const apiKey = savedConnection.asaas_api_key || Deno.env.get('ASAAS_API_KEY') || ''
      if (!apiKey) throw new Error('ASAAS API Key nao configurada')

      await fetchJson(`${baseUrl}/subscriptions/${orgPlan.asaas_subscription_id}`, {
        method: 'DELETE',
        headers: {
          accept: 'application/json',
          'User-Agent': 'WizzyCRM/1.0.0',
          access_token: apiKey,
        },
      })
    } else if (orgPlan.stripe_subscription_id) {
      throw new Error('Cancelamento Stripe ainda nao esta configurado neste painel.')
    }

    const now = new Date().toISOString()
    await adminClient
      .from('organization_plans')
      .update({
        status: 'canceled',
        payment_status: 'canceled',
        updated_at: now,
      })
      .eq('organization_id', profile.organization_id)

    await adminClient.from('billing_events').insert({
      organization_id: profile.organization_id,
      event_type: 'subscription_cancelled_by_customer',
      payload: { source: 'billing-cancel', asaas_subscription_id: orgPlan.asaas_subscription_id || null },
      processed_at: now,
    })

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
