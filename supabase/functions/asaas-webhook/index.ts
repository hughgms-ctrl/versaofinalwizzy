import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
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
