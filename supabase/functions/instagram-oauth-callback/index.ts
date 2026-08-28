import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchInstagramProfile,
  loadInstagramAppConfig,
  subscribeAccountToWebhooks,
  verifyOAuthState,
} from '../_shared/instagramProvider.ts';

// Webhook fields to double-check against Meta's current documentation at
// implementation/App-Review time — names have shifted across API versions.
const WEBHOOK_SUBSCRIBE_FIELDS = ['comments', 'messages', 'messaging_postbacks', 'mentions'];

// Kept in sync with instagram-oauth-start's REQUESTED_SCOPES; recorded on the
// account row for display in the connect UI ("permissions granted").
const REQUESTED_SCOPES_FALLBACK = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
];

function safeOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function redirectTo(baseOrigin: string | null, params: Record<string, string>) {
  const target = new URL(`${baseOrigin || ''}/settings`.replace(/^\/\//, 'https://'));
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

// A causa real da falha ficava só no log da edge function: a tela dizia
// "connection_failed" e nada mais, o que não distingue segredo errado de
// permissão faltando ou de recusa da Meta. Como o retorno é um redirect no
// navegador, a mensagem viaja na URL — limpa de qualquer segredo antes.
function sanitizeDetail(message: string, secrets: Array<string | undefined>): string {
  let out = message;
  for (const secret of secrets) {
    if (secret && secret.length >= 6) out = out.split(secret).join('***');
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, 300);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Step 1 of Meta's webhook handshake reuses the same path in some app
  // configurations — but the dedicated verification is on instagram-webhook.
  // This function only ever expects the OAuth redirect's `code`/`state` (or
  // `error` when the user cancels the consent dialog).
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error');

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const appConfig = await loadInstagramAppConfig(supabase);

  if (oauthError) {
    console.error('[instagram-oauth-callback] Meta returned an error:', oauthError);
    return redirectTo(null, {
      instagram_error: 'access_denied',
      instagram_error_detail: sanitizeDetail(String(oauthError), [appConfig.appSecret]),
    });
  }

  if (!code || !state) {
    return redirectTo(null, { instagram_error: 'missing_code_or_state' });
  }

  // Sem app id/secret nada abaixo funciona, e o erro que a Meta devolve nesse
  // caso ("Invalid platform app") não deixa isso óbvio.
  if (!appConfig.appId || !appConfig.appSecret) {
    return redirectTo(null, { instagram_error: 'app_not_configured' });
  }

  const statePayload = await verifyOAuthState(appConfig.appSecret, state);
  if (!statePayload) {
    return redirectTo(null, { instagram_error: 'invalid_or_expired_state' });
  }

  const returnOrigin = safeOrigin(statePayload.origin);

  // Em qual etapa a conexão morreu. Vai junto no retorno: cada etapa aponta
  // para um culpado diferente (segredo do app, permissão, banco).
  let step = 'token_exchange';

  try {
    const redirectUri = `${supabaseUrl}/functions/v1/instagram-oauth-callback`;
    const { accessToken: shortLivedToken, igUserId } = await exchangeCodeForShortLivedToken(
      appConfig.appId,
      appConfig.appSecret,
      redirectUri,
      code,
    );

    step = 'long_lived_token';
    const { accessToken: longLivedToken, expiresIn } = await exchangeForLongLivedToken(
      appConfig.appSecret,
      shortLivedToken,
    );

    // Instagram Login flow returns the account's own user id at code-exchange
    // time already — this profile fetch is just to get the username to show
    // in the connect UI, not to resolve which account was authorized.
    step = 'profile';
    const profile = await fetchInstagramProfile(longLivedToken);
    const resolvedIgUserId = profile.igUserId || igUserId;

    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    step = 'save';
    const { data: existing } = await supabase
      .from('instagram_accounts')
      .select('id')
      .eq('organization_id', statePayload.organizationId)
      .eq('ig_business_account_id', resolvedIgUserId)
      .maybeSingle();

    const upsertPayload = {
      organization_id: statePayload.organizationId,
      workspace_id: statePayload.workspaceId,
      ig_business_account_id: resolvedIgUserId,
      ig_username: profile.username || null,
      ig_name: profile.name || null,
      ig_profile_pic_url: profile.profilePicUrl || null,
      facebook_page_id: null,
      page_access_token: longLivedToken,
      long_lived_user_token: longLivedToken,
      token_expires_at: tokenExpiresAt,
      status: 'connected',
      // Reconectar precisa desfazer TODO o desligamento anterior: 'expired' e
      // 'disconnected' também zeram is_active, e sem isto a conta voltava
      // marcada como conectada mas invisível para o webhook e para os fluxos,
      // que filtram por is_active.
      is_active: true,
      scopes: REQUESTED_SCOPES_FALLBACK,
      connected_at: new Date().toISOString(),
      disconnected_at: null,
    };

    // O erro de gravação era descartado: a autorização dava certo, a linha não
    // era salva e a tela ainda assim comemorava "Instagram conectado!".
    const saveResult = existing?.id
      ? await supabase.from('instagram_accounts').update(upsertPayload).eq('id', existing.id)
      : await supabase.from('instagram_accounts').insert(upsertPayload);
    if (saveResult.error) throw new Error(`Falha ao salvar a conta: ${saveResult.error.message}`);

    const subscribeResult = await subscribeAccountToWebhooks(resolvedIgUserId, longLivedToken, WEBHOOK_SUBSCRIBE_FIELDS);
    if (!subscribeResult.ok) {
      console.error('[instagram-oauth-callback] webhook subscribe failed:', subscribeResult.json);
    }

    return redirectTo(returnOrigin, { instagram_connected: '1', instagram_username: profile.username || '' });
  } catch (error: any) {
    console.error('[instagram-oauth-callback] error at step', step, error);
    return redirectTo(returnOrigin, {
      instagram_error: 'connection_failed',
      instagram_error_step: step,
      instagram_error_detail: sanitizeDetail(error?.message || String(error), [appConfig.appSecret, appConfig.appId]),
    });
  }
});
