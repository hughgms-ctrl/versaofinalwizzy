import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { calculateOrganizationUsage } from '../_shared/usage.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Fase 7.5: recalcula o uso (storage) de TODAS as orgs e persiste em
// organizations.storage_used_bytes. Invocado por um pg_cron diario (net.http_post).
// O caminho quente (organization-usage, billing) le esse valor persistido — esta funcao
// e que o mantem fresco, fora do caminho do usuario. Reusa calculateOrganizationUsage
// (mesma logica/numeros do admin-dashboard) para nao divergir.
//
// Endpoint publico (verify_jwt=false, como os outros crons). Protecao anti-abuso:
// SELF-THROTTLE — roda no maximo 1x/12h, independente de quem chamou. Hammerar o
// endpoint so faz leituras baratas da tabela de throttle, nunca o scan O(plataforma).
const THROTTLE_MS = 12 * 60 * 60 * 1000
const JOB_KEY = 'recompute_org_usage'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Throttle: pula se ja rodou nas ultimas 12h. Marca ANTES do trabalho pesado para
    // que uma rajada de chamadas nao dispare varios scans concorrentes.
    const { data: lastRun } = await adminClient
      .from('platform_job_runs')
      .select('last_run_at')
      .eq('job_key', JOB_KEY)
      .maybeSingle()

    if (lastRun?.last_run_at && (Date.now() - new Date(lastRun.last_run_at).getTime()) < THROTTLE_MS) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'throttled', last_run_at: lastRun.last_run_at }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    await adminClient
      .from('platform_job_runs')
      .upsert({ job_key: JOB_KEY, last_run_at: new Date().toISOString() })

    const result = await calculateOrganizationUsage(adminClient, { persistStorageUsed: true })
    const organizations = Object.keys(result.organizations || {}).length

    return new Response(
      JSON.stringify({ ok: true, organizations }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
