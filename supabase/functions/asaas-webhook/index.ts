import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
}

// Comparação constant-time para não vazar o token por timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

function parseReference(payload: any) {
  const reference = payload?.payment?.externalReference || payload?.subscription?.externalReference || payload?.customer?.externalReference || null
  const [organizationId, planId, billingCycle] = String(reference || '').split('|')
  return {
    organizationId: organizationId || null,
    planId: planId || null,
    billingCycle: billingCycle === 'yearly' ? 'yearly' : 'monthly',
  }
}

function shouldActivatePlan(payload: any) {
  const event = String(payload?.event || '').toUpperCase()
  const status = String(payload?.payment?.status || payload?.subscription?.status || '').toUpperCase()
  return ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(event) || ['RECEIVED', 'CONFIRMED'].includes(status)
}

function getAsaasSubscriptionId(payload: any) {
  return payload?.subscription?.id || payload?.payment?.subscription || null
}

function getNextDueDate(payload: any) {
  const raw = payload?.subscription?.nextDueDate || payload?.payment?.dueDate || null
  if (!raw) return null
  const date = new Date(`${raw}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function shouldStartTrial(payload: any) {
  const event = String(payload?.event || '').toUpperCase()
  const nextDueDate = getNextDueDate(payload)
  if (!getAsaasSubscriptionId(payload) || !nextDueDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return event.includes('SUBSCRIPTION') && nextDueDate > today
}

function shouldMarkPastDue(payload: any) {
  const event = String(payload?.event || '').toUpperCase()
  const status = String(payload?.payment?.status || payload?.subscription?.status || '').toUpperCase()
  return ['PAYMENT_OVERDUE', 'PAYMENT_DELETED'].includes(event) || ['OVERDUE'].includes(status)
}

function shouldCancelPlan(payload: any) {
  const event = String(payload?.event || '').toUpperCase()
  const status = String(payload?.payment?.status || payload?.subscription?.status || '').toUpperCase()
  return ['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'].includes(event) || ['CANCELED', 'CANCELLED', 'INACTIVE'].includes(status)
}

function addPeriod(start: Date, billingCycle: string) {
  const end = new Date(start)
  if (billingCycle === 'yearly') {
    end.setFullYear(end.getFullYear() + 1)
  } else {
    end.setMonth(end.getMonth() + 1)
  }
  return end
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ==================== Verificação do token (OBRIGATÓRIA) ====================
    // O Asaas envia um token estático (configurado no painel Asaas) no header
    // asaas-access-token. Sem conferir, qualquer um ativa/cancela plano de qualquer org.
    // Falha FECHADA: se o secret não estiver configurado ou o token não bater, rejeita.
    const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN')
    if (!expectedToken) {
      console.error('[asaas-webhook] ASAAS_WEBHOOK_TOKEN não configurado — rejeitando')
      return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const receivedToken = req.headers.get('asaas-access-token') || ''
    if (!receivedToken || !timingSafeEqual(receivedToken, expectedToken)) {
      console.error('[asaas-webhook] token inválido')
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = await req.json().catch(() => ({}))
    const { organizationId, planId, billingCycle } = parseReference(payload)

    if (organizationId) {
      await supabase.from('billing_events').insert({
        organization_id: organizationId,
        event_type: payload?.event || 'asaas.webhook',
        asaas_event_id: payload?.id || payload?.payment?.id || null,
        payload,
        processed_at: new Date().toISOString(),
      })

      if (planId && shouldActivatePlan(payload)) {
        const now = new Date()
        await supabase.from('organization_plans').upsert({
          organization_id: organizationId,
          plan_id: planId,
          status: 'active',
          payment_status: 'paid',
          billing_cycle: billingCycle,
          asaas_customer_id: payload?.payment?.customer || payload?.subscription?.customer || null,
          asaas_subscription_id: payload?.payment?.subscription || payload?.subscription?.id || null,
          current_period_start: now.toISOString(),
          current_period_end: addPeriod(now, billingCycle).toISOString(),
          updated_at: now.toISOString(),
        }, { onConflict: 'organization_id' })
      }

      if (planId && shouldStartTrial(payload)) {
        const now = new Date()
        const trialEndsAt = getNextDueDate(payload)
        await supabase.from('organization_plans').upsert({
          organization_id: organizationId,
          plan_id: planId,
          status: 'trial',
          payment_status: 'trial',
          billing_cycle: billingCycle,
          asaas_customer_id: payload?.payment?.customer || payload?.subscription?.customer || null,
          asaas_subscription_id: getAsaasSubscriptionId(payload),
          trial_ends_at: trialEndsAt?.toISOString() || null,
          current_period_start: now.toISOString(),
          current_period_end: trialEndsAt?.toISOString() || null,
          updated_at: now.toISOString(),
        }, { onConflict: 'organization_id' })
      }

      if (shouldMarkPastDue(payload)) {
        await supabase
          .from('organization_plans')
          .update({
            status: 'active',
            payment_status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId)
      }

      if (shouldCancelPlan(payload)) {
        await supabase
          .from('organization_plans')
          .update({
            status: 'canceled',
            payment_status: 'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId)
      }
    }

    return new Response(JSON.stringify({ received: true, provider: 'asaas' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
