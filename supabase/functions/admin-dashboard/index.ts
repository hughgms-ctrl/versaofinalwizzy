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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), { status: 401, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify user token
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    // Verify platform_admin role server-side
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('role', 'platform_admin')
      .maybeSingle()

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    }

    // Fetch cross-org stats
    const [orgsRes, contactsRes, conversationsRes, messagesRes] = await Promise.all([
      adminClient.from('organizations').select('id, name, slug, storage_used_bytes, created_at', { count: 'exact' }),
      adminClient.from('contacts').select('id', { count: 'exact', head: true }),
      adminClient.from('conversations').select('id', { count: 'exact', head: true }),
      adminClient.from('messages').select('id', { count: 'exact', head: true }),
    ])

    // Get plans info
    const { data: plans } = await adminClient.from('platform_plans').select('*').eq('is_active', true)
    const { data: orgPlans } = await adminClient.from('organization_plans').select('*, platform_plans(name)')

    return new Response(JSON.stringify({
      stats: {
        total_organizations: orgsRes.count || 0,
        total_contacts: contactsRes.count || 0,
        total_conversations: conversationsRes.count || 0,
        total_messages: messagesRes.count || 0,
      },
      organizations: orgsRes.data || [],
      plans: plans || [],
      organization_plans: orgPlans || [],
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
