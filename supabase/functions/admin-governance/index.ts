import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function verifyAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new Error('Missing auth')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  })
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')

  const adminClient = createClient(supabaseUrl, supabaseServiceKey)
  const { data: roleData } = await adminClient
    .from('user_roles')
    .select('id')
    .eq('user_id', user.id)
    .eq('role', 'platform_admin')
    .maybeSingle()

  if (!roleData) throw new Error('Forbidden')

  return { adminClient, user }
}

const PHASE_WEIGHTS: Record<string, number> = {
  security: 30,
  backend: 20,
  continuity: 20,
  help: 10,
  ux: 10,
  governance: 10,
}

function calculateScores(checks: any[]) {
  const phaseScores: Record<string, number> = {}
  
  for (const [phase, weight] of Object.entries(PHASE_WEIGHTS)) {
    const phaseChecks = checks.filter((c: any) => c.phase === phase)
    if (phaseChecks.length === 0) {
      phaseScores[phase] = 0
      continue
    }
    const totalWeight = phaseChecks.reduce((s: number, c: any) => s + (Number(c.weight) || 1), 0)
    const doneWeight = phaseChecks.filter((c: any) => c.status === 'done')
      .reduce((s: number, c: any) => s + (Number(c.weight) || 1), 0)
    phaseScores[phase] = totalWeight > 0 ? (doneWeight / totalWeight) * weight : 0
  }

  const totalScore = Math.round(Object.values(phaseScores).reduce((a, b) => a + b, 0))
  const securityScore = checks.filter((c: any) => c.phase === 'security').length > 0
    ? Math.round((checks.filter((c: any) => c.phase === 'security' && c.status === 'done').length / 
        checks.filter((c: any) => c.phase === 'security').length) * 100)
    : 0

  // Risk analysis
  const criticalFailures = checks.filter((c: any) => c.is_blocker && c.status !== 'done')
  const riskLevel = criticalFailures.length > 2 ? 'high' : criticalFailures.length > 0 ? 'medium' : 'low'

  return { totalScore, securityScore, phaseScores, riskLevel, criticalFailures }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { adminClient, user } = await verifyAdmin(req)
    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'dashboard'

    // ── DASHBOARD ──
    if (action === 'dashboard') {
      const { data: checks } = await adminClient
        .from('governance_checks')
        .select('*')
        .order('phase')

      const scores = calculateScores(checks || [])

      // Latest certification
      const { data: latestCert } = await adminClient
        .from('governance_certifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Score history for chart
      const { data: scoreHistory } = await adminClient
        .from('governance_score_history')
        .select('*')
        .order('recorded_at', { ascending: true })
        .limit(50)

      // Check if certification should be issued or revoked
      const canCertify = scores.totalScore >= 85 && scores.securityScore >= 90 && scores.criticalFailures.length === 0
      const currentCertValid = latestCert?.status === 'issued'

      return new Response(JSON.stringify({
        checks: checks || [],
        scores,
        canCertify,
        currentCertification: latestCert,
        currentCertValid,
        scoreHistory: scoreHistory || [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── UPDATE CHECK STATUS ──
    if (action === 'update_check') {
      const body = await req.json()
      const { id, status, notes } = body

      const { data, error } = await adminClient
        .from('governance_checks')
        .update({ status, notes, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Log action
      await adminClient.from('governance_action_logs').insert({
        action: 'update_check',
        entity_type: 'check',
        entity_id: id,
        entity_name: data.name,
        details: { status, notes },
        performed_by: user.id,
      })

      return new Response(JSON.stringify({ check: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── CREATE/UPDATE CHECK ──
    if (action === 'upsert_check') {
      const body = await req.json()
      const { id, ...fields } = body

      let data, error
      if (id) {
        ({ data, error } = await adminClient.from('governance_checks').update(fields).eq('id', id).select().single())
      } else {
        ({ data, error } = await adminClient.from('governance_checks').insert(fields).select().single())
      }
      if (error) throw error

      await adminClient.from('governance_action_logs').insert({
        action: id ? 'update_check' : 'create_check',
        entity_type: 'check',
        entity_id: data.id,
        entity_name: data.name,
        performed_by: user.id,
      })

      return new Response(JSON.stringify({ check: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── DELETE CHECK ──
    if (action === 'delete_check') {
      const body = await req.json()
      const { data: existing } = await adminClient.from('governance_checks').select('name').eq('id', body.id).single()
      
      const { error } = await adminClient.from('governance_checks').delete().eq('id', body.id)
      if (error) throw error

      await adminClient.from('governance_action_logs').insert({
        action: 'delete_check',
        entity_type: 'check',
        entity_id: body.id,
        entity_name: existing?.name,
        performed_by: user.id,
      })

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── PROMPTS LIST ──
    if (action === 'prompts') {
      const isGeneric = url.searchParams.get('generic') === 'true'
      let query = adminClient.from('governance_prompts').select('*').order('category').order('name')
      
      // Note: governance_prompts may not have is_generic column, so we handle gracefully
      const { data: prompts } = await query

      return new Response(JSON.stringify({ prompts: prompts || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── PROMPT DETAIL WITH VERSIONS ──
    if (action === 'prompt_detail') {
      const promptId = url.searchParams.get('id')
      
      const [promptRes, versionsRes] = await Promise.all([
        adminClient.from('governance_prompts').select('*').eq('id', promptId).single(),
        adminClient.from('governance_prompt_versions').select('*').eq('prompt_id', promptId).order('version', { ascending: false }),
      ])

      return new Response(JSON.stringify({
        prompt: promptRes.data,
        versions: versionsRes.data || [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── CREATE/UPDATE PROMPT ──
    if (action === 'upsert_prompt') {
      const body = await req.json()
      const { id, ...fields } = body

      if (id) {
        // Get current version to save it
        const { data: current } = await adminClient.from('governance_prompts').select('content, name').eq('id', id).single()
        
        if (current && fields.content && current.content !== fields.content) {
          // Get latest version number
          const { data: latestVersion } = await adminClient
            .from('governance_prompt_versions')
            .select('version')
            .eq('prompt_id', id)
            .order('version', { ascending: false })
            .limit(1)
            .maybeSingle()

          const nextVersion = (latestVersion?.version || 0) + 1

          // Save old version
          await adminClient.from('governance_prompt_versions').insert({
            prompt_id: id,
            version: nextVersion,
            content: current.content,
            reason: fields.change_reason || 'Atualização',
            changed_by: user.id,
          })
        }

        delete fields.change_reason
        fields.updated_at = new Date().toISOString()
        const { data, error } = await adminClient.from('governance_prompts').update(fields).eq('id', id).select().single()
        if (error) throw error

        await adminClient.from('governance_action_logs').insert({
          action: 'update_prompt',
          entity_type: 'prompt',
          entity_id: id,
          entity_name: data.name,
          details: { fields: Object.keys(fields) },
          performed_by: user.id,
        })

        return new Response(JSON.stringify({ prompt: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } else {
        const { data, error } = await adminClient.from('governance_prompts').insert(fields).select().single()
        if (error) throw error

        await adminClient.from('governance_action_logs').insert({
          action: 'create_prompt',
          entity_type: 'prompt',
          entity_id: data.id,
          entity_name: data.name,
          performed_by: user.id,
        })

        return new Response(JSON.stringify({ prompt: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // ── DELETE PROMPT ──
    if (action === 'delete_prompt') {
      const body = await req.json()
      const { data: existing } = await adminClient.from('governance_prompts').select('name').eq('id', body.id).single()
      
      const { error } = await adminClient.from('governance_prompts').delete().eq('id', body.id)
      if (error) throw error

      await adminClient.from('governance_action_logs').insert({
        action: 'delete_prompt',
        entity_type: 'prompt',
        entity_id: body.id,
        entity_name: existing?.name,
        performed_by: user.id,
      })

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── ISSUE CERTIFICATION ──
    if (action === 'issue_certification') {
      const { data: checks } = await adminClient.from('governance_checks').select('*')
      const scores = calculateScores(checks || [])

      if (scores.totalScore < 85 || scores.securityScore < 90 || scores.criticalFailures.length > 0) {
        return new Response(JSON.stringify({ error: 'Requisitos não atingidos para certificação' }), {
          status: 400, headers: corsHeaders
        })
      }

      // Revoke previous
      await adminClient.from('governance_certifications')
        .update({ status: 'superseded', revoked_at: new Date().toISOString() })
        .eq('status', 'issued')

      const { data: cert, error } = await adminClient.from('governance_certifications').insert({
        score: scores.totalScore,
        security_score: scores.securityScore,
        status: 'issued',
        snapshot: { scores: scores.phaseScores, checks_total: (checks || []).length },
      }).select().single()

      if (error) throw error

      // Record score
      await adminClient.from('governance_score_history').insert({
        total_score: scores.totalScore,
        security_score: Math.round(scores.phaseScores.security || 0),
        backend_score: Math.round(scores.phaseScores.backend || 0),
        continuity_score: Math.round(scores.phaseScores.continuity || 0),
        help_score: Math.round(scores.phaseScores.help || 0),
        ux_score: Math.round(scores.phaseScores.ux || 0),
        governance_dim_score: Math.round(scores.phaseScores.governance || 0),
      })

      await adminClient.from('governance_action_logs').insert({
        action: 'issue_certification',
        entity_type: 'certification',
        entity_id: cert.id,
        entity_name: `Score ${scores.totalScore}/100`,
        performed_by: user.id,
      })

      return new Response(JSON.stringify({ certification: cert }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── REVOKE CERTIFICATION ──
    if (action === 'revoke_certification') {
      const body = await req.json()
      
      const { data, error } = await adminClient.from('governance_certifications')
        .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoke_reason: body.reason })
        .eq('id', body.id)
        .select().single()

      if (error) throw error

      await adminClient.from('governance_action_logs').insert({
        action: 'revoke_certification',
        entity_type: 'certification',
        entity_id: body.id,
        entity_name: body.reason,
        performed_by: user.id,
      })

      return new Response(JSON.stringify({ certification: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── RECORD SCORE ──
    if (action === 'record_score') {
      const { data: checks } = await adminClient.from('governance_checks').select('*')
      const scores = calculateScores(checks || [])

      const { data, error } = await adminClient.from('governance_score_history').insert({
        total_score: scores.totalScore,
        security_score: Math.round(scores.phaseScores.security || 0),
        backend_score: Math.round(scores.phaseScores.backend || 0),
        continuity_score: Math.round(scores.phaseScores.continuity || 0),
        help_score: Math.round(scores.phaseScores.help || 0),
        ux_score: Math.round(scores.phaseScores.ux || 0),
        governance_dim_score: Math.round(scores.phaseScores.governance || 0),
      }).select().single()

      if (error) throw error
      return new Response(JSON.stringify({ score: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── ACTION LOGS ──
    if (action === 'action_logs') {
      const { data: logs } = await adminClient
        .from('governance_action_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      return new Response(JSON.stringify({ logs: logs || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── CERTIFICATIONS HISTORY ──
    if (action === 'certifications') {
      const { data: certs } = await adminClient
        .from('governance_certifications')
        .select('*')
        .order('created_at', { ascending: false })

      return new Response(JSON.stringify({ certifications: certs || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders })

  } catch (err) {
    const status = err.message === 'Forbidden' ? 403 : err.message === 'Unauthorized' ? 401 : 500
    return new Response(JSON.stringify({ error: err.message }), { status, headers: corsHeaders })
  }
})