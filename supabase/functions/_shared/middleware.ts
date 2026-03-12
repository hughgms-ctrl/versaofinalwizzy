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
