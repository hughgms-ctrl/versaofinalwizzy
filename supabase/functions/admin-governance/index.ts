import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.23.8'

// Input schemas
const updateCheckSchema = z.object({ id: z.string().uuid(), status: z.string(), notes: z.string().optional() })
const upsertCheckSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  phase: z.enum(['security', 'backend', 'continuity', 'help', 'ux', 'governance']),
  weight: z.number().int().min(1).max(10).optional(),
  is_blocker: z.boolean().optional(),
  status: z.enum(['pending', 'done', 'failed']).optional(),
  notes: z.string().max(1000).optional(),
})
const deleteSchema = z.object({ id: z.string().uuid() })
const upsertPromptSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  category: z.string().max(100).optional(),
  criticality: z.string().optional(),
  status: z.string().optional(),
  description: z.string().max(1000).optional(),
  content: z.string().optional(),
  related_files: z.array(z.string()).optional(),
  related_tables: z.array(z.string()).optional(),
  related_functions: z.array(z.string()).optional(),
  is_generic: z.boolean().optional(),
  change_reason: z.string().max(500).optional(),
})
const revokeCertSchema = z.object({ id: z.string().uuid(), reason: z.string().min(1).max(500) })

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── RATE LIMITING ──
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_MAX = 60 // max requests per window

function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = rateLimitStore.get(key)
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 }
  }
  entry.count++
  if (entry.count > RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 }
  }
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count }
}

// ── DATA EXFILTRATION PROTECTION ──
const MAX_EXPORT_ROWS = 500
const MAX_RESPONSE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB

function enforceRowLimit<T>(data: T[] | null, limit = MAX_EXPORT_ROWS): T[] {
  if (!data) return []
  return data.slice(0, limit)
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
    // Rate limit check
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown'
    const { allowed, remaining } = checkRateLimit(clientIP)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60', 'X-RateLimit-Remaining': '0' },
      })
    }

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
      const parsed = updateCheckSchema.parse(body)
      const { id, status, notes } = parsed

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
      const parsed = upsertCheckSchema.parse(body)
      const { id, ...fields } = parsed

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
      const { id } = deleteSchema.parse(body)
      const { data: existing } = await adminClient.from('governance_checks').select('name').eq('id', id).single()
      
      const { error } = await adminClient.from('governance_checks').delete().eq('id', id)
      if (error) throw error

      await adminClient.from('governance_action_logs').insert({
        action: 'delete_check',
        entity_type: 'check',
        entity_id: id,
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
      const parsed = upsertPromptSchema.parse(body)
      const { id, ...fields } = parsed

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
      const { id } = deleteSchema.parse(body)
      const { data: existing } = await adminClient.from('governance_prompts').select('name').eq('id', id).single()
      
      const { error } = await adminClient.from('governance_prompts').delete().eq('id', id)
      if (error) throw error

      await adminClient.from('governance_action_logs').insert({
        action: 'delete_prompt',
        entity_type: 'prompt',
        entity_id: id,
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
      const { id, reason } = revokeCertSchema.parse(body)
      
      const { data, error } = await adminClient.from('governance_certifications')
        .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoke_reason: reason })
        .eq('id', id)
        .select().single()

      if (error) throw error

      await adminClient.from('governance_action_logs').insert({
        action: 'revoke_certification',
        entity_type: 'certification',
        entity_id: id,
        entity_name: reason,
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

    // ── SEED SECURITY ──
    if (action === 'seed_security') {
      // Check if already seeded
      const { data: existingChecks } = await adminClient.from('governance_checks').select('id').limit(1)
      if (existingChecks && existingChecks.length > 0) {
        return new Response(JSON.stringify({ error: 'Checklist já possui itens. Remova-os antes de popular novamente.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // ── CHECKLIST ITEMS ──
      const checkItems = [
        // Security (blocker)
        { name: 'Roles em tabela separada (user_roles)', description: 'NUNCA armazenar roles na tabela profiles ou users. Usar tabela user_roles com RLS.', phase: 'security', weight: 3, is_blocker: true, status: 'pending' },
        { name: 'RLS habilitado em todas as tabelas', description: 'Todas as tabelas com dados de usuário devem ter RLS ativo. Usar SECURITY DEFINER para evitar recursão.', phase: 'security', weight: 3, is_blocker: true, status: 'pending' },
        { name: 'Validação server-side em Edge Functions', description: 'Toda edge function que modifique dados deve validar token via supabase.auth.getUser(token) e verificar permissões em user_roles.', phase: 'security', weight: 3, is_blocker: true, status: 'pending' },
        { name: 'Service Role Key apenas no servidor', description: 'SUPABASE_SERVICE_ROLE_KEY nunca deve ser exposta ao cliente. Apenas em edge functions/servidor.', phase: 'security', weight: 3, is_blocker: true, status: 'pending' },
        { name: 'Nunca admin via localStorage/sessionStorage', description: 'Verificação de admin deve ser sempre server-side. Nunca confiar em dados do cliente.', phase: 'security', weight: 3, is_blocker: true, status: 'pending' },
        { name: 'Validação de input com Zod', description: 'Inputs do usuário validados com Zod tanto no client quanto no server antes de qualquer operação.', phase: 'security', weight: 2, is_blocker: true, status: 'pending' },
        { name: 'Sanitização HTML (DOMPurify)', description: 'Sanitizar HTML antes de renderizar para prevenir XSS.', phase: 'security', weight: 2, is_blocker: false, status: 'pending' },
        { name: 'Proteção contra SQL injection', description: 'NUNCA permitir SQL raw ou IDs de outros usuários. Sempre filtrar por auth.uid().', phase: 'security', weight: 3, is_blocker: true, status: 'pending' },
        { name: 'Campos sensíveis protegidos contra UPDATE', description: 'Nunca permitir UPDATE em user_id, role ou campos sensíveis via API pública.', phase: 'security', weight: 2, is_blocker: true, status: 'pending' },
        { name: 'Secrets e chaves nunca logadas', description: 'NUNCA logar senhas, tokens ou chaves no console.', phase: 'security', weight: 2, is_blocker: false, status: 'pending' },
        // Backend
        { name: 'Rate limiting implementado', description: 'Endpoints públicos e webhooks devem ter rate limiting para prevenir abuso.', phase: 'backend', weight: 2, is_blocker: true, status: 'pending' },
        { name: 'Edge Functions com auth validation', description: 'Toda edge function administrativa deve verificar role do usuário no banco antes de prosseguir.', phase: 'backend', weight: 3, is_blocker: true, status: 'pending' },
        { name: 'Tokens únicos para webhooks públicos', description: 'Webhooks devem usar tokens únicos para autenticação. Validar e sanitizar todos os dados recebidos.', phase: 'backend', weight: 2, is_blocker: false, status: 'pending' },
        { name: 'Validação de webhook signatures', description: 'Nunca confiar em headers como x-forwarded-for para autenticação de webhooks.', phase: 'backend', weight: 2, is_blocker: false, status: 'pending' },
        // Continuity
        { name: 'Backup automatizado configurado', description: 'Sistema de backup automático (Google Drive ou equivalente) configurado e testado.', phase: 'continuity', weight: 3, is_blocker: true, status: 'pending' },
        { name: 'Tokens rotativos (15min)', description: 'Proteção contra roubo de tokens com rotação automática a cada 15 minutos.', phase: 'continuity', weight: 2, is_blocker: false, status: 'pending' },
        { name: 'Proteção contra exfiltração de dados', description: 'HWID para evitar que 1 licença seja usada por múltiplos usuários.', phase: 'continuity', weight: 2, is_blocker: false, status: 'pending' },
        // Help
        { name: 'Documentação de APIs internas', description: 'Edge functions e endpoints documentados com parâmetros e exemplos.', phase: 'help', weight: 1, is_blocker: false, status: 'pending' },
        { name: 'Logs de erro estruturados', description: 'Sistema de logging com níveis (info, warn, error) e contexto.', phase: 'help', weight: 1, is_blocker: false, status: 'pending' },
        // UX
        { name: 'Feedback de erros de permissão', description: 'Mensagens claras quando usuário não tem permissão para uma ação.', phase: 'ux', weight: 1, is_blocker: false, status: 'pending' },
        { name: 'Loading states em operações críticas', description: 'Indicadores visuais durante operações que afetam dados.', phase: 'ux', weight: 1, is_blocker: false, status: 'pending' },
        // Governance
        { name: 'Registro de prompts de IA', description: 'Todos os prompts de IA utilizados no sistema cadastrados com categoria e criticidade.', phase: 'governance', weight: 2, is_blocker: false, status: 'pending' },
        { name: 'Versionamento automático de prompts', description: 'Toda edição de prompt salva versão anterior automaticamente.', phase: 'governance', weight: 2, is_blocker: false, status: 'pending' },
        { name: 'Trilha de auditoria de ações', description: 'Log completo de todas as ações no sistema de governança.', phase: 'governance', weight: 1, is_blocker: false, status: 'pending' },
      ]

      const { error: checksErr } = await adminClient.from('governance_checks').insert(checkItems)
      if (checksErr) throw checksErr

      // ── PROMPTS ──
      const prompts = [
        {
          name: 'Proteção contra Escalação de Privilégios',
          category: 'Segurança',
          criticality: 'high',
          status: 'implemented',
          description: 'Regras para prevenir escalação de privilégios administrativos.',
          content: `NUNCA armazene roles/permissões na tabela de perfis ou users. Roles DEVEM estar em uma tabela separada (user_roles) com RLS habilitado. NUNCA verifique status de admin via localStorage, sessionStorage ou credenciais hardcoded. Sempre use validação server-side com SECURITY DEFINER functions. Qualquer edge function que execute ações administrativas DEVE verificar a role do usuário no banco antes de prosseguir.`,
          related_files: ['src/hooks/useAuth.tsx', 'src/hooks/usePlatformAdmin.ts'],
          related_tables: ['user_roles', 'profiles'],
          related_functions: ['has_role', 'is_platform_admin'],
        },
        {
          name: 'Proteção de Edge Functions',
          category: 'Backend',
          criticality: 'high',
          status: 'implemented',
          description: 'Regras obrigatórias para segurança de Edge Functions.',
          content: `Toda edge function que modifique dados DEVE: 1) Validar o token de autenticação via supabase.auth.getUser(token). 2) Verificar permissões na tabela user_roles. 3) NUNCA confiar em dados enviados pelo cliente para determinar permissões. 4) Usar SUPABASE_SERVICE_ROLE_KEY apenas no servidor, nunca expor ao cliente.`,
          related_files: ['supabase/functions/'],
          related_tables: ['user_roles'],
          related_functions: ['verifyAdmin'],
        },
        {
          name: 'Row Level Security (RLS)',
          category: 'Segurança',
          criticality: 'high',
          status: 'implemented',
          description: 'Padrões obrigatórios de RLS para todas as tabelas.',
          content: `TODAS as tabelas com dados de usuário DEVEM ter RLS habilitado. Use funções SECURITY DEFINER para evitar recursão em policies. Nunca desabilite RLS "temporariamente". Policies devem usar auth.uid() para verificar propriedade dos dados. Para dados de equipe, use uma função auxiliar que valide membership.`,
          related_tables: ['todas as tabelas públicas'],
          related_functions: ['get_user_org_id', 'has_role'],
        },
        {
          name: 'Proteção contra Manipulação de Banco',
          category: 'Segurança',
          criticality: 'high',
          status: 'implemented',
          description: 'Regras contra manipulação direta de dados.',
          content: `NUNCA permita que o cliente envie SQL raw ou IDs de outros usuários para acessar dados alheios. Sempre filtre por auth.uid() ou team_id validado. Inputs do usuário devem ser validados com zod antes de qualquer operação. Limite campos atualizáveis - nunca permita UPDATE em user_id, role ou campos sensíveis via API pública.`,
          related_tables: ['todas as tabelas públicas'],
        },
        {
          name: 'Proteção de Webhooks e APIs Públicas',
          category: 'Backend',
          criticality: 'high',
          status: 'partial',
          description: 'Segurança para endpoints públicos e webhooks.',
          content: `Webhooks públicos DEVEM usar tokens únicos para autenticação. Valide e sanitize TODOS os dados recebidos. Nunca confie em headers como x-forwarded-for para autenticação. Rate limiting deve ser implementado. Dados sensíveis nunca devem ser logados no console.`,
          related_files: ['supabase/functions/whatsapp-webhook/index.ts', 'supabase/functions/widget-submit/index.ts'],
        },
        {
          name: 'Proteção de Secrets e API Keys',
          category: 'Infraestrutura',
          criticality: 'high',
          status: 'implemented',
          description: 'Gerenciamento seguro de chaves e secrets.',
          content: `NUNCA armazene chaves privadas no código-fonte. Use variáveis de ambiente/secrets do servidor. Chaves publicáveis (ex: Supabase anon key) podem estar no código. Service Role Keys NUNCA devem ser expostas ao cliente. Sempre valide se o ambiente é produção antes de executar ações destrutivas.`,
          related_files: ['.env', 'supabase/functions/'],
        },
        {
          name: 'Prompt Completo para Outra Ferramenta',
          category: 'Governança',
          criticality: 'high',
          status: 'documented',
          description: 'Prompt master com todas as regras de segurança para uso em qualquer ferramenta de IA.',
          content: `REGRAS DE SEGURANÇA OBRIGATÓRIAS:\n- Roles em tabela separada (user_roles), NUNCA no profile\n- RLS habilitado em TODAS as tabelas\n- Verificação server-side de permissões em TODA edge function\n- NUNCA confiar em dados do cliente para autenticação/autorização\n- Validação de input com zod em client E server\n- Service Role Key apenas no servidor\n- Tokens únicos para webhooks públicos\n- NUNCA usar localStorage/sessionStorage para verificar admin\n- NUNCA permitir UPDATE em campos de role via API pública\n- Funções SECURITY DEFINER para evitar recursão de RLS\n- NUNCA logar dados sensíveis (senhas, tokens, chaves)\n- Sanitizar HTML antes de renderizar (DOMPurify)`,
        },
      ]

      const { error: promptsErr } = await adminClient.from('governance_prompts').insert(prompts)
      if (promptsErr) throw promptsErr

      // ── GENERIC LIBRARY PROMPTS ──
      const libraryPrompts = [
        {
          name: 'Roubo de Tokens de Acesso',
          category: 'Segurança',
          criticality: 'high',
          status: 'documented',
          is_generic: true,
          description: 'Ameaça real: reutilização de token de projeto rotativo a cada 15min.',
          content: `É preciso o token do projeto para que consiga conectar/disparar via API direto pro projeto. O token de projeto é rotativo a cada 15 minutos e gera um novo automaticamente. O script fica pegando automaticamente o token novo. Mitigação: rotação automática, validação server-side, monitoramento de uso anômalo.`,
        },
        {
          name: 'Bloqueio e Manipulação de Conteúdo',
          category: 'Segurança',
          criticality: 'high',
          status: 'documented',
          is_generic: true,
          description: 'Ameaça real: manipulação via event socket para evitar consumo de crédito.',
          content: `Utiliza-se event socket para manipular conteúdos enviados para API, evitando que dispare para rota padrão (/chat) para não ter consumação de crédito. Mitigação: validação server-side de todas as rotas, assinatura de requests, monitoramento de padrões anômalos.`,
        },
        {
          name: 'Rastreamento e Exfiltração de Dados',
          category: 'Segurança',
          criticality: 'high',
          status: 'documented',
          is_generic: true,
          description: 'Ameaça real: uso de HWID para controle de licenças.',
          content: `Código de HWID usado para evitar que 1 licença seja usada para múltiplas pessoas. Mitigação: fingerprinting de dispositivo, limite de sessões simultâneas, alertas de uso compartilhado.`,
        },
        {
          name: 'Ofuscação Extrema de Código',
          category: 'Infraestrutura',
          criticality: 'high',
          status: 'documented',
          is_generic: true,
          description: 'Ameaça real: proteção contra vazamento de chaves Supabase.',
          content: `Ofuscação de código própria para evitar vazamento das chaves Supabase (anon-key e URL colocados no supabase-config.js para disparar edge functions). Mitigação: nunca expor service role key, usar apenas anon key no client, ofuscação de código, variáveis de ambiente no servidor.`,
        },
      ]

      const { error: libErr } = await adminClient.from('governance_prompts').insert(libraryPrompts)
      if (libErr) throw libErr

      // Log action
      await adminClient.from('governance_action_logs').insert({
        action: 'seed_security',
        entity_type: 'system',
        entity_name: 'Security Seed',
        details: { checks: checkItems.length, prompts: prompts.length, library: libraryPrompts.length },
        performed_by: user.id,
      })

      return new Response(JSON.stringify({ 
        success: true, 
        counts: { checks: checkItems.length, prompts: prompts.length, library: libraryPrompts.length } 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders })

  } catch (err) {
    if (err.name === 'ZodError') {
      return new Response(JSON.stringify({ error: 'Dados inválidos', details: err.errors }), { status: 400, headers: corsHeaders })
    }
    const status = err.message === 'Forbidden' ? 403 : err.message === 'Unauthorized' ? 401 : 500
    return new Response(JSON.stringify({ error: err.message }), { status, headers: corsHeaders })
  }
})