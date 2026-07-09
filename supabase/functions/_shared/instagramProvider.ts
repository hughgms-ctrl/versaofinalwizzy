// Shared helpers for the Instagram channel.
// Mirrors the shape of whatsappProvider.ts: connection-settings loader with a
// platform_settings DB override + Deno.env fallback, an account resolver, and a
// send helper — but for Instagram's API instead of the WhatsApp gateways.
//
// This app uses "Instagram API with Instagram Login" (Business Login for
// Instagram) — NOT "Instagram API with Facebook Login". That means: no
// Facebook Page is involved anywhere in this flow. Each Wizzy client
// authorizes directly with their own Instagram professional account, and all
// calls after auth go to graph.instagram.com (not graph.facebook.com).
// Reference: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login

export const GRAPH_API_BASE = 'https://graph.instagram.com';
const IG_OAUTH_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const IG_OAUTH_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';

export interface InstagramSendResult {
  ok: boolean;
  status: number;
  igMessageId: string | null;
  responseText: string;
  responseJson: any;
}

export interface InstagramActionResult {
  ok: boolean;
  status: number;
  responseJson: any;
  supported: boolean;
  error?: string;
}

function parseJson(value: string): any {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export async function loadInstagramAppConfig(supabase: any) {
  const { data: row } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'instagram_connection_settings')
    .maybeSingle();
  const value = row?.value || {};
  return {
    appId: value.ig_app_id || Deno.env.get('IG_APP_ID') || '',
    appSecret: value.ig_app_secret || Deno.env.get('IG_APP_SECRET') || '',
    webhookVerifyToken: value.ig_webhook_verify_token || Deno.env.get('IG_WEBHOOK_VERIFY_TOKEN') || '',
  };
}

// Picks the connected Instagram account to act on. When `instagramAccountId` is
// given (e.g. a webhook event already resolved it), narrows to that row;
// otherwise returns the most recently connected account for the org.
export async function resolveInstagramAccount(
  supabase: any,
  organizationId: string,
  instagramAccountId?: string | null,
) {
  let query = supabase
    .from('instagram_accounts')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'connected');
  if (instagramAccountId) query = query.eq('id', instagramAccountId);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error || !data?.length) return null;
  return data[0];
}

export async function findInstagramAccountByBusinessId(supabase: any, igBusinessAccountId: string) {
  const { data } = await supabase
    .from('instagram_accounts')
    .select('*')
    .eq('ig_business_account_id', igBusinessAccountId)
    .maybeSingle();
  return data || null;
}

// Shared by instagram-webhook (inbound DM/comment ingest) and
// instagram-rule-execute (send_dm action) so both land on the same
// contact/conversation rows instead of racing to create duplicates.
export async function ensureInstagramContact(
  supabase: any,
  account: any,
  igsid: string,
  username?: string | null,
) {
  const { data: existing } = await supabase
    .from('instagram_contacts')
    .select('*')
    .eq('instagram_account_id', account.id)
    .eq('igsid', igsid)
    .maybeSingle();

  if (existing) {
    if (username && existing.username !== username) {
      await supabase.from('instagram_contacts').update({ username }).eq('id', existing.id);
    }
    return existing;
  }

  const { data: created, error } = await supabase
    .from('instagram_contacts')
    .insert({
      organization_id: account.organization_id,
      instagram_account_id: account.id,
      igsid,
      username: username || null,
      workspace_id: account.workspace_id || null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return created;
}

export async function ensureInstagramConversation(supabase: any, account: any, contact: any) {
  const { data: existing } = await supabase
    .from('instagram_conversations')
    .select('*')
    .eq('instagram_account_id', account.id)
    .eq('contact_id', contact.id)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from('instagram_conversations')
    .insert({
      organization_id: account.organization_id,
      instagram_account_id: account.id,
      contact_id: contact.id,
      workspace_id: account.workspace_id || null,
      assigned_to: account.default_assignee_id || null,
      department_id: account.default_department_id || null,
      conversation_status_id: account.default_conversation_status_id || null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return created;
}

// `account.page_access_token` holds the Instagram User long-lived access
// token (column name is a holdover from the Facebook-Login-with-Page design;
// this app uses Instagram Login, so there is no Facebook Page token here).
export async function sendInstagramMessage(
  account: any,
  igsid: string,
  text: string,
): Promise<InstagramSendResult> {
  const endpoint = `${GRAPH_API_BASE}/${account.ig_business_account_id}/messages`;
  const response = await fetch(`${endpoint}?access_token=${encodeURIComponent(account.page_access_token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: igsid }, message: { text } }),
  });
  const responseText = await response.text();
  const responseJson = parseJson(responseText);
  return {
    ok: response.ok,
    status: response.status,
    igMessageId: responseJson?.message_id || null,
    responseText,
    responseJson,
  };
}

// Sends a message with a single URL button, using Instagram's "generic
// template" attachment (the same structure Messenger Platform uses).
// `buttonUrl` should already be a Wizzy tracked-link redirect URL, not the
// final destination, so click-through can be detected for follow-ups.
export async function sendInstagramButtonMessage(
  account: any,
  igsid: string,
  text: string,
  buttonLabel: string,
  buttonUrl: string,
): Promise<InstagramSendResult> {
  const endpoint = `${GRAPH_API_BASE}/${account.ig_business_account_id}/messages`;
  const response = await fetch(`${endpoint}?access_token=${encodeURIComponent(account.page_access_token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: igsid },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [
              {
                title: text.slice(0, 80),
                subtitle: text.length > 80 ? text.slice(80, 160) : undefined,
                buttons: [{ type: 'web_url', url: buttonUrl, title: buttonLabel.slice(0, 20) }],
              },
            ],
          },
        },
      },
    }),
  });
  const responseText = await response.text();
  const responseJson = parseJson(responseText);
  return {
    ok: response.ok,
    status: response.status,
    igMessageId: responseJson?.message_id || null,
    responseText,
    responseJson,
  };
}

export async function replyToComment(account: any, commentId: string, message: string): Promise<InstagramActionResult> {
  try {
    const endpoint = `${GRAPH_API_BASE}/${commentId}/replies`;
    const response = await fetch(`${endpoint}?access_token=${encodeURIComponent(account.page_access_token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const responseText = await response.text();
    return { ok: response.ok, status: response.status, responseJson: parseJson(responseText), supported: true };
  } catch (error) {
    return { ok: false, status: 0, responseJson: null, supported: true, error: String(error) };
  }
}

// NOTE: liking an Instagram comment is not part of the officially documented
// Graph API surface the way Facebook Page comment likes are (POST
// /{comment-id}/likes there). Attempt it and degrade gracefully — a 400/404
// here should be treated by callers as "unsupported", not a hard pipeline
// failure, since reply/DM steps still need to run. Confirm against current
// Meta docs before relying on this in production.
export async function likeComment(account: any, commentId: string): Promise<InstagramActionResult> {
  try {
    const endpoint = `${GRAPH_API_BASE}/${commentId}/likes`;
    const response = await fetch(`${endpoint}?access_token=${encodeURIComponent(account.page_access_token)}`, {
      method: 'POST',
    });
    const responseText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      responseJson: parseJson(responseText),
      supported: response.status !== 400 && response.status !== 404,
    };
  } catch (error) {
    return { ok: false, status: 0, responseJson: null, supported: false, error: String(error) };
  }
}

// ==================== OAuth (Instagram Login / Business Login for Instagram) ====================
// Used by instagram-oauth-start / instagram-oauth-callback.

export function buildInstagramAuthorizeUrl(appId: string, redirectUri: string, scopes: string[], state: string) {
  const url = new URL(IG_OAUTH_AUTHORIZE_URL);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(','));
  url.searchParams.set('state', state);
  return url.toString();
}

// POST https://api.instagram.com/oauth/access_token (form-encoded) — returns a
// short-lived token PLUS the Instagram-scoped user id directly (no separate
// "list linked pages" step needed, since there's no Page in this flow).
export async function exchangeCodeForShortLivedToken(
  appId: string,
  appSecret: string,
  redirectUri: string,
  code: string,
) {
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });
  const response = await fetch(IG_OAUTH_TOKEN_URL, { method: 'POST', body });
  const json = await response.json();
  if (!response.ok) throw new Error(`Falha ao trocar code por token: ${JSON.stringify(json)}`);
  return { accessToken: json.access_token as string, igUserId: String(json.user_id) };
}

// GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token
export async function exchangeForLongLivedToken(appSecret: string, shortLivedToken: string) {
  const url = new URL(`${GRAPH_API_BASE}/access_token`);
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('access_token', shortLivedToken);
  const response = await fetch(url.toString());
  const json = await response.json();
  if (!response.ok) throw new Error(`Falha ao gerar long-lived token: ${JSON.stringify(json)}`);
  return { accessToken: json.access_token as string, expiresIn: Number(json.expires_in || 0) };
}

export async function fetchInstagramProfile(accessToken: string) {
  const url = new URL(`${GRAPH_API_BASE}/me`);
  url.searchParams.set('fields', 'user_id,username,account_type');
  url.searchParams.set('access_token', accessToken);
  const response = await fetch(url.toString());
  const json = await response.json();
  if (!response.ok) throw new Error(`Falha ao buscar perfil do Instagram: ${JSON.stringify(json)}`);
  return { igUserId: String(json.user_id || json.id), username: json.username as string | undefined };
}

// Webhook delivery is per-authorized-account, not automatic once the app-level
// webhook is configured in the dashboard — each connected account must call
// this once after authorizing (POST /{ig-user-id}/subscribed_apps) or no
// events for that account will ever arrive.
export async function subscribeAccountToWebhooks(igUserId: string, accessToken: string, fields: string[]) {
  const url = new URL(`${GRAPH_API_BASE}/${igUserId}/subscribed_apps`);
  url.searchParams.set('subscribed_fields', fields.join(','));
  url.searchParams.set('access_token', accessToken);
  const response = await fetch(url.toString(), { method: 'POST' });
  const json = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, json };
}

// ==================== OAuth state signing ====================
// Meta's OAuth `state` param round-trips through Facebook's servers, so we
// can't store server-side session data against it — instead we HMAC-sign the
// org/workspace/user binding + a short TTL directly into the state string,
// using the app secret as the signing key (already required for token
// exchange, so no extra secret to provision).

export interface OAuthStatePayload {
  organizationId: string;
  workspaceId: string | null;
  userId: string;
  origin: string;
  nonce: string;
  iat: number;
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signOAuthState(secret: string, payload: OAuthStatePayload): Promise<string> {
  const encoded = btoa(JSON.stringify(payload));
  const signature = await hmacSha256Hex(secret, encoded);
  return `${encoded}.${signature}`;
}

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

export async function verifyOAuthState(secret: string, state: string): Promise<OAuthStatePayload | null> {
  const [encoded, signature] = String(state || '').split('.');
  if (!encoded || !signature) return null;

  const expectedSig = await hmacSha256Hex(secret, encoded);
  if (expectedSig !== signature) return null;

  try {
    const payload = JSON.parse(atob(encoded)) as OAuthStatePayload;
    if (!payload?.iat || Date.now() - payload.iat > OAUTH_STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

// ==================== Webhook signature verification ====================

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

// Verifies Meta's X-Hub-Signature-256 header against the raw request body.
// If no appSecret is configured yet (bootstrap phase, before IG_APP_SECRET is
// set), verification is skipped rather than rejecting every event — this
// mirrors the fail-open convention used elsewhere for not-yet-configured
// secrets (see whatsappProvider.ts's connection-settings loader).
export async function verifyWebhookSignature(req: Request, rawBody: string, appSecret: string): Promise<boolean> {
  if (!appSecret) return true;
  const signatureHeader = req.headers.get('x-hub-signature-256');
  if (!signatureHeader) return false;

  const expectedSig = signatureHeader.replace(/^sha256=/, '');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const computedSig = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return timingSafeEqualHex(computedSig, expectedSig);
}
