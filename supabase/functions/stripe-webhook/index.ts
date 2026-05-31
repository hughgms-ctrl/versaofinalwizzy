import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

function extractOrganizationId(payload: any) {
  return payload?.data?.object?.metadata?.organization_id || payload?.data?.object?.client_reference_id || null
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

function getStripeSubscriptionId(payload: any) {
  const object = payload?.data?.object || {}
  return object?.subscription || object?.id || null
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
    const organizationId = extractOrganizationId(payload)
    const checkoutObject = payload?.data?.object || {}
    const planId = checkoutObject?.metadata?.plan_id || null
    const billingCycle = checkoutObject?.metadata?.billing_cycle === 'yearly' ? 'yearly' : 'monthly'

    if (organizationId) {
      await supabase.from('billing_events').insert({
        organization_id: organizationId,
        event_type: payload?.type || 'stripe.webhook',
        payload,
        processed_at: new Date().toISOString(),
      })

      if (payload?.type === 'checkout.session.completed' && planId) {
        const now = new Date()
        await supabase.from('organization_plans').upsert({
          organization_id: organizationId,
          plan_id: planId,
          status: 'active',
          payment_status: 'paid',
          billing_cycle: billingCycle,
          stripe_customer_id: checkoutObject?.customer || null,
          stripe_subscription_id: checkoutObject?.subscription || null,
          current_period_start: now.toISOString(),
          current_period_end: addPeriod(now, billingCycle).toISOString(),
          updated_at: now.toISOString(),
        }, { onConflict: 'organization_id' })
      }

      if (payload?.type === 'invoice.payment_failed') {
        await supabase
          .from('organization_plans')
          .update({
            status: 'active',
            payment_status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId)
      }

      if (['customer.subscription.deleted', 'customer.subscription.paused'].includes(payload?.type)) {
        await supabase
          .from('organization_plans')
          .update({
            status: 'canceled',
            payment_status: 'canceled',
            stripe_subscription_id: getStripeSubscriptionId(payload),
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId)
      }
    }

    return new Response(JSON.stringify({ received: true, provider: 'stripe' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
