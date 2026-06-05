import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

type EntryFlowEvent = {
  id: string
  experiment_id: string | null
  variant_id: string | null
  visitor_id: string | null
  user_id: string | null
  organization_id: string | null
  event_name: string
  metadata: Record<string, any>
  created_at: string
}

const DEFAULT_RECOVERY_SUBJECT = 'Finalize sua assinatura na Wizzy'
const DEFAULT_RECOVERY_MESSAGE = 'Voce comecou o checkout do plano {plan_name}, mas ainda nao concluiu a assinatura. Continue de onde parou para liberar o acesso da sua conta.'

function hoursAgo(hours: number) {
  return new Date(Date.now() - Math.max(1, hours) * 60 * 60 * 1000).toISOString()
}

function daysAgo(days: number) {
  return new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString()
}

function money(value: unknown) {
  const number = Number(value || 0)
  return Number.isFinite(number)
    ? number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : 'R$ 0,00'
}

function getRecoveryConfig(settings: any) {
  const configs = settings?.flow_configs || {}
  const activeFlowType = settings?.default_flow_type || 'payment_first'
  const activeConfig = configs[activeFlowType] || {}
  const fallbackConfig = configs.payment_first || configs.trial_auto || {}
  const enabledValue =
    activeConfig.checkout_recovery_enabled ??
    fallbackConfig.checkout_recovery_enabled ??
    settings?.checkout_recovery_enabled ??
    true
  const hoursCandidates = [
    activeConfig.checkout_recovery_hours,
    fallbackConfig.checkout_recovery_hours,
    settings?.checkout_recovery_hours,
  ].map(Number).filter((value) => Number.isFinite(value) && value > 0)

  return {
    enabled: enabledValue !== false,
    hours: hoursCandidates[0] || 24,
    subject: String(
      activeConfig.checkout_recovery_email_subject ||
      fallbackConfig.checkout_recovery_email_subject ||
      settings?.checkout_recovery_email_subject ||
      DEFAULT_RECOVERY_SUBJECT
    ),
    message: String(
      activeConfig.checkout_recovery_email_message ||
      fallbackConfig.checkout_recovery_email_message ||
      settings?.checkout_recovery_email_message ||
      DEFAULT_RECOVERY_MESSAGE
    ),
  }
}

function buildRecoveryLink(origin: string, planSlug?: string | null) {
  const base = origin.replace(/\/$/, '')
  if (!planSlug) return `${base}/plans`
  return `${base}/plans?selected_plan=${encodeURIComponent(planSlug)}&auto_checkout=1`
}

function interpolateMessage(template: string, args: { planName: string; planPrice: string; link: string }) {
  return template
    .replace(/\{plan_name\}/g, args.planName)
    .replace(/\{plan_price\}/g, args.planPrice || '')
    .replace(/\{checkout_link\}/g, args.link)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildEmailHtml(args: { planName: string; planPrice: string; link: string; message: string }) {
  const message = escapeHtml(interpolateMessage(args.message, args)).replace(/\n/g, '<br />')

  return `
    <div style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;padding:28px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:26px 30px 16px 30px;border-bottom:1px solid #eef0f4;">
                  <div style="font-size:22px;font-weight:700;color:#111827;">Wizzy</div>
                  <div style="font-size:13px;color:#6b7280;margin-top:4px;">Gestao inteligente de conversas</div>
                </td>
              </tr>
              <tr>
                <td style="padding:30px;">
                  <h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.25;color:#111827;">Finalize sua assinatura</h1>
                  <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#374151;">
                    ${message}
                  </p>
                  <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 26px 0;">
                    <tr>
                      <td>
                        <a href="${args.link}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 22px;border-radius:8px;">
                          Continuar assinatura
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
                    Se voce ja concluiu o pagamento, ignore este e-mail.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `
}

function buildEmailText(args: { planName: string; planPrice: string; link: string; message: string }) {
  return [
    'Wizzy',
    '',
    'Finalize sua assinatura',
    '',
    interpolateMessage(args.message, args),
    '',
    args.link,
    '',
    'Se voce ja concluiu o pagamento, ignore este e-mail.',
  ].join('\n')
}

async function sendRecoveryEmail(email: string, args: { planName: string; planPrice: string; link: string; subject: string; message: string }) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) throw new Error('RESEND_API_KEY nao configurada')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('CHECKOUT_RECOVERY_FROM') || 'Wizzy <suporte@wizzybr.com>',
      to: [email],
      subject: args.subject || DEFAULT_RECOVERY_SUBJECT,
      text: buildEmailText(args),
      html: buildEmailHtml(args),
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Resend error ${response.status}: ${body}`)
  }

  return response.json().catch(() => ({}))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const cronSecret = Deno.env.get('CRON_SECRET')
    const requestSecret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!cronSecret) {
      return new Response(JSON.stringify({ error: 'CRON_SECRET nao configurado' }), { status: 500, headers: corsHeaders })
    }
    if (requestSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const body = await req.json().catch(() => ({}))
    const origin = String(body.origin || Deno.env.get('PUBLIC_APP_ORIGIN') || 'https://wizzybr.com')

    const { data: settingsRow } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'entry_flow_settings')
      .maybeSingle()

    const recoveryConfig = getRecoveryConfig(settingsRow?.value)
    const recoveryEnabled = body.enabled === undefined ? recoveryConfig.enabled : body.enabled !== false
    if (!recoveryEnabled) {
      return new Response(JSON.stringify({
        success: true,
        disabled: true,
        checked: 0,
        sent: 0,
        skipped: 0,
        errors: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const recoveryHours = Number(body.hours || recoveryConfig.hours)
    const emailSubject = String(body.subject || recoveryConfig.subject || DEFAULT_RECOVERY_SUBJECT)
    const emailMessage = String(body.message || recoveryConfig.message || DEFAULT_RECOVERY_MESSAGE)
    const cutoff = hoursAgo(recoveryHours)
    const since = daysAgo(Number(body.lookback_days || 14))
    const limit = Math.min(100, Math.max(1, Number(body.limit || 50)))

    const { data: checkoutEvents, error: checkoutError } = await supabase
      .from('entry_flow_events')
      .select('*')
      .eq('event_name', 'checkout_started')
      .not('user_id', 'is', null)
      .lte('created_at', cutoff)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (checkoutError) throw checkoutError

    let sent = 0
    let skipped = 0
    const errors: Array<{ event_id: string; error: string }> = []

    for (const event of (checkoutEvents || []) as EntryFlowEvent[]) {
      try {
        const [{ data: paid }, { data: recovered }] = await Promise.all([
          supabase
            .from('entry_flow_events')
            .select('id')
            .eq('event_name', 'payment_completed')
            .eq('user_id', event.user_id)
            .gte('created_at', event.created_at)
            .limit(1)
            .maybeSingle(),
          supabase
            .from('entry_flow_events')
            .select('id')
            .eq('event_name', 'checkout_recovery_email_sent')
            .eq('user_id', event.user_id)
            .contains('metadata', { checkout_event_id: event.id })
            .limit(1)
            .maybeSingle(),
        ])

        if (paid || recovered) {
          skipped += 1
          continue
        }

        const { data: userResult } = await supabase.auth.admin.getUserById(event.user_id!)
        const email = userResult?.user?.email
        if (!email) {
          skipped += 1
          continue
        }

        const planId = event.metadata?.plan_id || null
        const { data: plan } = planId
          ? await supabase.from('platform_plans').select('id, name, slug, price_monthly').eq('id', planId).maybeSingle()
          : { data: null }

        const planName = plan?.name || event.metadata?.plan_name || 'selecionado'
        const planSlug = plan?.slug || event.metadata?.plan_slug || null
        const planPrice = plan?.price_monthly ? money(plan.price_monthly) : ''
        const link = buildRecoveryLink(origin, planSlug)

        const emailResult = await sendRecoveryEmail(email, {
          planName,
          planPrice,
          link,
          subject: emailSubject,
          message: emailMessage,
        })

        await supabase.from('entry_flow_events').insert({
          experiment_id: event.experiment_id,
          variant_id: event.variant_id,
          visitor_id: event.visitor_id,
          user_id: event.user_id,
          organization_id: event.organization_id,
          event_name: 'checkout_recovery_email_sent',
          metadata: {
            checkout_event_id: event.id,
            checkout_started_at: event.created_at,
            plan_id: planId,
            plan_name: planName,
            email_subject: emailSubject,
            email_message_id: emailResult?.id || null,
          },
        })

        sent += 1
      } catch (error) {
        errors.push({ event_id: event.id, error: error instanceof Error ? error.message : String(error) })
      }
    }

    return new Response(JSON.stringify({
      success: true,
      recovery_hours: recoveryHours,
      checked: checkoutEvents?.length || 0,
      sent,
      skipped,
      errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
