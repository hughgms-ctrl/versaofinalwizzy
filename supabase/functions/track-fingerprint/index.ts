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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get auth user from headers if available
    const authHeader = req.headers.get('Authorization')
    let userId = null
    let orgId = null

    if (authHeader) {
      const { data: { user } } = await createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } }
      }).auth.getUser()
      
      if (user) {
        userId = user.id
        // Get org ID from profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('user_id', user.id)
          .single()
        
        if (profile) orgId = profile.organization_id
      }
    }

    const body = await req.json()
    const { browser_data, location_data } = body

    // Get IP from headers (Supabase specific or standard)
    const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    const userAgent = req.headers.get('user-agent')

    const { error } = await supabase.from('user_fingerprints').insert({
      user_id: userId,
      organization_id: orgId,
      ip_address: ip,
      user_agent: userAgent,
      browser_data: browser_data || {},
      location_data: location_data || {}
    })

    if (error) throw error

    return new Response(JSON.stringify({ success: true, ip }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Track fingerprint error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
