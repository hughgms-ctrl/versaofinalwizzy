/**
 * Shared Edge Function Middleware
 * Provides: CORS, Auth validation, Rate limiting (in-memory), Error handling, Input validation
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ==================== CORS ====================
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-webhook-token, x-api-key',
};

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

// ==================== Response Helpers ====================
export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status = 400) {
  console.error(`[ERROR ${status}] ${message}`);
  return jsonResponse({ error: message }, status);
}

/**
 * Resposta de erro que NÃO vaza detalhes internos ao cliente.
 * Loga o erro completo (message + stack) no server, mas devolve apenas uma
 * mensagem genérica e segura. Use nos catch-all dos endpoints públicos em vez de
 * `errorResponse(error.message, 500)` — expor error.message/stack a um chamador
 * não autenticado revela nomes de tabela, SQL, caminhos e versões de lib.
 */
export function safeErrorResponse(
  error: unknown,
  context: string,
  publicMessage = 'Erro interno. Tente novamente.',
  status = 500,
) {
  console.error(`[${context}]`, error instanceof Error ? (error.stack || error.message) : error);
  return jsonResponse({ error: publicMessage }, status);
}

// ==================== Client IP ====================
/**
 * Extrai o IP do chamador a partir dos headers de proxy do Supabase/Cloudflare.
 * x-forwarded-for pode ser uma lista ("client, proxy1, proxy2"); o primeiro é o
 * cliente original. Usado como identificador do rate limit.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip')
    || req.headers.get('x-real-ip')
    || 'unknown';
}

// ==================== Auth ====================
export interface AuthContext {
  userId: string;
  organizationId: string;
  supabase: ReturnType<typeof createClient>;
}

export async function authenticateUser(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new AuthError('Missing Authorization header', 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new AuthError('Invalid or expired token', 401);
  }

  // Get organization from profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', user.id)
    .single();

  if (!profile?.organization_id) {
    throw new AuthError('User has no organization', 403);
  }

  return {
    userId: user.id,
    organizationId: profile.organization_id,
    supabase,
  };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

// ==================== Rate Limiting (in-memory) ====================
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { maxRequests: 60, windowMs: 60_000 }
): boolean {
  const key = `${config.keyPrefix || 'rl'}:${identifier}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + config.windowMs });
    return true;
  }

  entry.count++;
  if (entry.count > config.maxRequests) {
    return false;
  }
  return true;
}

// Cleanup stale entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 60_000);

// ==================== Rate Limiting (DB-backed, shared across isolates) ====================
export interface DbRateLimitConfig {
  /** Nome lógico do endpoint/ação (ex.: 'signature-send-otp'). */
  bucket: string;
  maxRequests: number;
  windowSeconds: number;
}

/**
 * Rate limit compartilhado entre todos os isolates via RPC atômica no Postgres
 * (tabela rate_limits + função check_rate_limit — migration 20260705130000).
 *
 * Retorna `true` se a requisição é PERMITIDA, `false` se estourou o limite.
 *
 * FAIL-OPEN: se a RPC não existir ainda (migration não aplicada) ou o banco
 * falhar, permite a requisição. Assim o deploy das edge functions não quebra
 * produção antes do sync da migration pelo Lovable — o limite passa a valer
 * assim que a RPC existir. O rate limiter in-memory (checkRateLimit) continua
 * ativo como 1ª camada nesse meio-tempo.
 *
 * @param client um Supabase client com service_role (createServiceClient()).
 *   Tipado de forma estrutural (só precisa de `.rpc`) para aceitar clients
 *   criados por qualquer import specifier (npm: / esm.sh).
 */
export async function checkRateLimitDb(
  client: { rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }> },
  identifier: string,
  config: DbRateLimitConfig,
): Promise<boolean> {
  if (!identifier || identifier === 'unknown') return true; // sem IP confiável → não bloqueia
  try {
    const { data, error } = await client.rpc('check_rate_limit', {
      p_bucket: config.bucket,
      p_identifier: identifier,
      p_max_requests: config.maxRequests,
      p_window_seconds: config.windowSeconds,
    });
    if (error) {
      console.error(`[RATE-LIMIT] RPC error (fail-open) bucket=${config.bucket}:`, error.message);
      return true;
    }
    return data !== false; // RPC devolve boolean; qualquer coisa != false = permite
  } catch (e) {
    console.error(`[RATE-LIMIT] Exception (fail-open) bucket=${config.bucket}:`, e);
    return true;
  }
}

// ==================== Webhook Auth ====================
export function validateWebhookToken(req: Request): boolean {
  const expectedToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
  if (!expectedToken) return true; // No token configured = skip validation

  const token = req.headers.get('x-webhook-token') || req.headers.get('x-api-key');
  return token === expectedToken;
}

// ==================== Input Validation ====================
export async function parseJsonBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const text = await req.text();
    if (!text || text.trim() === '') {
      return {} as T;
    }
    return JSON.parse(text) as T;
  } catch {
    throw new ValidationError('Invalid JSON body');
  }
}

export class ValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
  }
}

// ==================== Service Client ====================
export function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  }

  return createClient(supabaseUrl, serviceKey);
}

// ==================== Main Handler Wrapper ====================
type HandlerFn = (req: Request) => Promise<Response>;

export function withMiddleware(
  handler: HandlerFn,
  options?: {
    rateLimit?: RateLimitConfig;
    requireAuth?: boolean;
    allowedMethods?: string[];
  }
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      // CORS
      const corsResponse = handleCors(req);
      if (corsResponse) return corsResponse;

      // Method check
      if (options?.allowedMethods && !options.allowedMethods.includes(req.method)) {
        return errorResponse(`Method ${req.method} not allowed`, 405);
      }

      // Rate limiting
      if (options?.rateLimit) {
        const ip = req.headers.get('x-forwarded-for') || 'unknown';
        if (!checkRateLimit(ip, options.rateLimit)) {
          return errorResponse('Rate limit exceeded', 429);
        }
      }

      return await handler(req);
    } catch (error) {
      if (error instanceof AuthError) {
        return errorResponse(error.message, error.status);
      }
      if (error instanceof ValidationError) {
        return errorResponse(error.message, 400);
      }
      
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[UNHANDLED ERROR]', error);
      return errorResponse(message, 500);
    }
  };
}
