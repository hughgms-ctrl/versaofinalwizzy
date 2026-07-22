/**
 * OAuth `state` assinado (HMAC-SHA256).
 *
 * PROBLEMA que isto resolve: o `state` do OAuth do Google era apenas
 * `base64(JSON({ organization_id, user_id }))` montado no browser — sem
 * assinatura. Qualquer pessoa podia trocar o `organization_id` pelo de OUTRA
 * organização e, ao autorizar com a própria conta Google, gravar o refresh
 * token no `calendar_configs`/`drive_configs` da vítima (ou apontar o backup
 * da vítima para o próprio Drive). Cross-tenant write clássico.
 *
 * SOLUÇÃO: o `state` passa a ser gerado no servidor (passo `login`, já
 * autenticado) e assinado com HMAC. O callback recomputa o HMAC e recusa
 * qualquer `state` adulterado ou expirado. O cliente não escolhe mais a org.
 *
 * Formato do token: `<body>.<sig>` onde
 *   body = base64url(JSON(payload))
 *   sig  = base64url(HMAC_SHA256(body, secret))
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Secret usado para assinar o state. Prefere um secret dedicado
 * (`OAUTH_STATE_SECRET`); se não existir, cai no service_role key — que já é
 * server-only e de alta entropia — para funcionar sem config extra. Configure
 * `OAUTH_STATE_SECRET` quando puder para separar responsabilidades.
 */
export function getStateSecret(): string {
  const secret = Deno.env.get('OAUTH_STATE_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret) throw new Error('OAUTH_STATE_SECRET/SUPABASE_SERVICE_ROLE_KEY não configurado');
  return secret;
}

/** Assina um payload arbitrário. Adiciona `exp` (default: 10 min) se ausente. */
export async function signState(
  payload: Record<string, unknown>,
  secret: string,
  ttlMs = 10 * 60 * 1000,
): Promise<string> {
  const withExp = { ...payload, exp: payload.exp ?? Date.now() + ttlMs };
  const body = toBase64Url(enc.encode(JSON.stringify(withExp)));
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

/**
 * Verifica a assinatura e a expiração. Lança se o state for malformado,
 * adulterado ou expirado. A comparação de assinatura é feita pelo próprio
 * WebCrypto (`verify`), que é constant-time.
 */
export async function verifyState<T = Record<string, unknown>>(
  state: string,
  secret: string,
): Promise<T> {
  const dot = state.indexOf('.');
  if (dot <= 0) throw new Error('Malformed state');
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const key = await importKey(secret);
  const ok = await crypto.subtle.verify('HMAC', key, fromBase64Url(sig), enc.encode(body));
  if (!ok) throw new Error('Invalid state signature');
  const payload = JSON.parse(dec.decode(fromBase64Url(body)));
  if (typeof payload.exp === 'number' && Date.now() > payload.exp) {
    throw new Error('State expired');
  }
  return payload as T;
}
