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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const [{ data: plans, error }, { data: trackingRow }] = await Promise.all([
      adminClient
        .from('platform_plans')
        .select('id, name, slug, price_monthly, price_yearly, allowed_modules, max_team_members, max_conversations, max_ai_requests_month, storage_limit_bytes, ai_mode, is_active, features')
        .eq('is_active', true)
        .order('price_monthly', { ascending: true }),
      adminClient
        .from('platform_settings')
        .select('value')
        .eq('key', 'tracking_settings')
        .maybeSingle(),
    ])

    if (error) throw error
    const trackingSettings = trackingRow?.value || {}
    const metaPixel = trackingSettings?.meta_pixel || {}

    return new Response(JSON.stringify({
      plans: plans || [],
      tracking: {
        meta_pixel: {
          enabled: metaPixel.enabled === true,
          pixel_id: String(metaPixel.pixel_id || '').replace(/\D/g, ''),
          advanced_matching_enabled: metaPixel.advanced_matching_enabled === true,
          test_event_code: String(metaPixel.test_event_code || '').trim(),
        },
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('billing-plans error', err?.message || err)
    return new Response(JSON.stringify({ error: err?.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
