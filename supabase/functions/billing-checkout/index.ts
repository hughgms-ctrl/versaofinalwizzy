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

function toMoney(value: unknown) {
  return Number(Number(value || 0).toFixed(2))
}

function toAsaasDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + Math.max(0, days))
  return next
}

function getAsaasRecurrentBillingTypes(_billingType: string | null | undefined) {
  // ASAAS hosted checkout only accepts credit card for RECURRENT charge types.
  return ['CREDIT_CARD']
}

async function fetchJson(url: string, options: RequestInit) {
  const response = await fetch(url, options)
  const text = await response.text()
  let json: any = null
  try { json = text ? JSON.parse(text) : null } catch (_) {}
  if (!response.ok) {
    const details = json?.errors?.map((item: any) => item.description).filter(Boolean).join(' | ')
    throw new Error(details || json?.error?.message || json?.message || text || 'Falha ao criar checkout')
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
    const body = await req.json()
    const planId = String(body.plan_id || '')
    const billingCycle = body.billing_cycle === 'yearly' ? 'yearly' : 'monthly'
    const entryFlowConfig = body.entry_flow_config || {}
    const requiresCardTrial = entryFlowConfig.require_card === true
    if (!planId) throw new Error('Plano não informado')

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('organization_id, full_name')
      .eq('user_id', user.id)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile?.organization_id) throw new Error('Organização não encontrada')

    const [{ data: plan, error: planError }, { data: settingsRows }] = await Promise.all([
      adminClient
        .from('platform_plans')
        .select('*')
        .eq('id', planId)
        .eq('is_active', true)
        .maybeSingle(),
      adminClient
        .from('platform_settings')
        .select('key, value')
        .in('key', ['payment_gateway_strategy', 'payment_gateway_connection_settings']),
    ])
    if (planError) throw planError
    if (!plan) throw new Error('Plano não encontrado ou inativo')

    const savedStrategy = (settingsRows || []).find((s: any) => s.key === 'payment_gateway_strategy')?.value || {}
    const savedConnection = (settingsRows || []).find((s: any) => s.key === 'payment_gateway_connection_settings')?.value || {}
    const activeProvider = savedStrategy.active_provider || 'asaas'
    const price = billingCycle === 'yearly'
      ? toMoney(plan.price_yearly || Number(plan.price_monthly || 0) * 10)
      : toMoney(plan.price_monthly)
    if (!price || price <= 0) throw new Error('Plano sem preço configurado')
    const trialEnabled = requiresCardTrial || plan.features?.trial_enabled === true
    const trialDays = trialEnabled ? Math.max(0, Number(entryFlowConfig.trial_days || plan.trial_days || plan.features?.trial_days || 0)) : 0
    const firstChargeDate = addDays(new Date(), trialDays)
    const amountDueNow = trialDays > 0 ? 0 : price
    const chargeDescription = trialDays > 0
      ? `Teste gratis por ${trialDays} dia${trialDays === 1 ? '' : 's'}. Nada e cobrado hoje. Primeira cobranca em ${toAsaasDate(firstChargeDate)} no valor de R$ ${price.toFixed(2)}. O cliente pode cancelar antes dessa data.`
      : `Assinatura Wizzy ${plan.name}. Cobranca inicial de R$ ${price.toFixed(2)}.`

    const successUrl = savedConnection.checkout_success_url || `${req.headers.get('origin') || supabaseUrl}/plans?checkout=success`
    const cancelUrl = savedConnection.checkout_cancel_url || `${req.headers.get('origin') || supabaseUrl}/plans?checkout=cancel`
    const reference = `${profile.organization_id}|${plan.id}|${billingCycle}`

    if (activeProvider === 'asaas') {
      if (savedStrategy.asaas_enabled === false) throw new Error('ASAAS está desabilitado')
      const baseUrl = normalizeAsaasBaseUrl(
        savedConnection.asaas_base_url || Deno.env.get('ASAAS_BASE_URL') || '',
        savedStrategy.test_mode !== false,
      )
      const apiKey = savedConnection.asaas_api_key || Deno.env.get('ASAAS_API_KEY') || ''
      if (!apiKey) throw new Error('ASAAS API Key não configurada')

      const payload = {
        billingTypes: getAsaasRecurrentBillingTypes(plan.features?.payment?.asaas?.billing_type),
        chargeTypes: ['RECURRENT'],
        minutesToExpire: 1440,
        externalReference: reference,
        callback: {
          successUrl,
          cancelUrl,
          expiredUrl: cancelUrl,
        },
        items: [
          {
            name: `${plan.name} - ${billingCycle === 'yearly' ? 'Anual' : 'Mensal'}`,
            description: chargeDescription,
            quantity: 1,
            value: price,
          },
        ],
        subscription: {
          cycle: billingCycle === 'yearly' ? 'YEARLY' : 'MONTHLY',
          nextDueDate: toAsaasDate(firstChargeDate),
        },
      }

      const checkout = await fetchJson(`${baseUrl}/checkouts`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'WizzyCRM/1.0.0',
          access_token: apiKey,
        },
        body: JSON.stringify(payload),
      })

      return new Response(JSON.stringify({
        provider: 'asaas',
        url: checkout?.link || checkout?.url,
        summary: {
          amount_due_now: amountDueNow,
          first_charge_date: toAsaasDate(firstChargeDate),
          trial_days: trialDays,
          can_cancel_before_first_charge: trialDays > 0,
        },
        checkout,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (activeProvider === 'stripe') {
      if (savedStrategy.stripe_enabled === false) throw new Error('Stripe está desabilitado')
      const secretKey = savedConnection.stripe_secret_key || Deno.env.get('STRIPE_SECRET_KEY') || ''
      if (!secretKey) throw new Error('Stripe Secret Key não configurada')
      const priceId = billingCycle === 'yearly'
        ? plan.features?.payment?.stripe?.yearly_price_id
        : plan.features?.payment?.stripe?.monthly_price_id
      if (!priceId) throw new Error(`Price ID do Stripe não configurado para o plano ${billingCycle === 'yearly' ? 'anual' : 'mensal'}`)

      const params = new URLSearchParams()
      params.set('mode', 'subscription')
      params.set('success_url', successUrl)
      params.set('cancel_url', cancelUrl)
      params.set('client_reference_id', profile.organization_id)
      params.set('line_items[0][price]', priceId)
      params.set('line_items[0][quantity]', '1')
      params.set('metadata[organization_id]', profile.organization_id)
      params.set('metadata[plan_id]', plan.id)
      params.set('metadata[billing_cycle]', billingCycle)
      if (trialDays > 0) params.set('subscription_data[trial_period_days]', String(trialDays))
      if (user.email) params.set('customer_email', user.email)

      const checkout = await fetchJson('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      })

      return new Response(JSON.stringify({
        provider: 'stripe',
        url: checkout?.url,
        summary: {
          amount_due_now: amountDueNow,
          first_charge_date: toAsaasDate(firstChargeDate),
          trial_days: trialDays,
          can_cancel_before_first_charge: trialDays > 0,
        },
        checkout,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    throw new Error('Gateway ativo inválido')
  } catch (err: any) {
    console.error('billing-checkout error', err?.message || err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
