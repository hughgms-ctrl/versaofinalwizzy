// Data Deletion Request Callback — required by Meta for App Review.
//
// Meta POSTs a signed_request here when a user asks for their data to be
// deleted. Two things must happen, per Meta's spec:
//   1. actually delete that user's data, and
//   2. respond with { url, confirmation_code } so the person can check status.
//
// GET on the same endpoint serves the human-readable status page that `url`
// points at — keeping both halves in one function means the URL we hand Meta
// can never drift from the handler that produced the code.
//
// SCOPE: `user_id` in the payload is an Instagram-scoped id. In practice the
// people exercising this are the END CUSTOMERS who messaged a client's account
// (matched on instagram_contacts.igsid) — deleting a contact cascades to their
// tags, conversations, messages and pending follow-ups via the FKs. If instead
// the id belongs to a connected professional account, we deauthorize it rather
// than deleting the org's whole workspace: destroying a paying client's account
// on an unauthenticated-user-initiated request would be the wrong blast radius,
// and account deletion is handled by the documented process at
// /exclusao-de-dados.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadInstagramAppConfig, parseSignedRequest } from '../_shared/instagramProvider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

// Ambiguous characters (0/O, 1/I) left out: this code gets read off a screen and
// typed by hand into the status page.
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateConfirmationCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return 'WZ' + Array.from(bytes).map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

async function readSignedRequest(req: Request): Promise<string> {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({}));
    return String(body?.signed_request || '');
  }
  const form = await req.formData().catch(() => null);
  return String(form?.get('signed_request') || '');
}

function statusPage(title: string, message: string, code?: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Wizzy</title>
<style>
  body { margin:0; background:#0b0b12; color:#cbd5e1; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 40rem; margin: 0 auto; padding: 4rem 1.5rem; line-height: 1.7; }
  h1 { color:#fff; font-size:1.5rem; margin-bottom:1rem; }
  code { background:#1e1e2c; color:#fff; padding:.2rem .5rem; border-radius:.35rem; font-size:1rem; }
  a { color:#fff; }
  .muted { color:#64748b; font-size:.875rem; margin-top:2.5rem; }
</style>
</head>
<body><main>
  <h1>${escapeHtml(title)}</h1>
  <p>${message}</p>
  ${code ? `<p>Código de confirmação: <code>${escapeHtml(code)}</code></p>` : ''}
  <p class="muted">Dúvidas sobre seus dados? Escreva para
    <a href="mailto:privacidade@wizzy.app">privacidade@wizzy.app</a>
    ou consulte as <a href="/exclusao-de-dados">instruções de exclusão de dados</a>.</p>
</main></body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ---- Status page (the `url` we returned to Meta) ----
  if (req.method === 'GET') {
    const code = new URL(req.url).searchParams.get('code') || '';
    if (!code) {
      return htmlResponse(statusPage(
        'Exclusão de dados',
        'Informe o código de confirmação recebido para consultar o andamento do pedido.',
      ));
    }

    const { data: request } = await supabase
      .from('instagram_data_deletion_requests')
      .select('confirmation_code, status, created_at')
      .eq('confirmation_code', code)
      .maybeSingle();

    if (!request) {
      return htmlResponse(statusPage(
        'Pedido não encontrado',
        'Não localizamos nenhum pedido de exclusão com esse código. Confira se ele foi digitado corretamente.',
      ), 404);
    }

    const when = new Date(request.created_at).toLocaleDateString('pt-BR');
    const message = request.status === 'failed'
      ? `Recebemos o pedido em ${when}, mas houve uma falha ao processá-lo automaticamente. Nossa equipe foi notificada e concluirá a exclusão manualmente.`
      : request.status === 'nothing_to_delete'
        ? `Pedido recebido em ${when}. Não havia nenhum dado associado a esta conta do Instagram em nossos sistemas.`
        : `Pedido recebido e <strong>concluído</strong> em ${when}. Os dados associados a esta conta do Instagram foram removidos dos nossos sistemas.`;

    return htmlResponse(statusPage('Exclusão de dados', message, request.confirmation_code));
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // ---- Deletion request from Meta ----
  const confirmationCode = generateConfirmationCode();
  const statusUrl = `${supabaseUrl}/functions/v1/instagram-data-deletion?code=${confirmationCode}`;

  try {
    const appConfig = await loadInstagramAppConfig(supabase);
    const signedRequest = await readSignedRequest(req);
    const payload = await parseSignedRequest(signedRequest, appConfig.appSecret);

    if (!payload?.user_id) {
      console.error('[instagram-data-deletion] invalid or unverifiable signed_request');
      return jsonResponse({ error: 'invalid signed_request' }, 401);
    }

    const igsid = String(payload.user_id);

    // Contacts first: this is the common case, and the cascade takes their
    // conversations, messages, tags and pending follow-ups with them.
    const { data: deletedContacts, error: contactsError } = await supabase
      .from('instagram_contacts')
      .delete()
      .eq('igsid', igsid)
      .select('id, organization_id');

    if (contactsError) throw contactsError;

    let organizationId: string | null = deletedContacts?.[0]?.organization_id || null;
    let deauthorizedAccounts = 0;

    // Fall back to treating the id as a connected professional account: revoke
    // it rather than deleting, for the blast-radius reason in the header note.
    if (!deletedContacts?.length) {
      const { data: accounts } = await supabase
        .from('instagram_accounts')
        .update({
          status: 'disconnected',
          is_active: false,
          disconnected_at: new Date().toISOString(),
          page_access_token: null,
          long_lived_user_token: null,
          token_expires_at: null,
        })
        .eq('ig_business_account_id', igsid)
        .select('id, organization_id');

      deauthorizedAccounts = accounts?.length || 0;
      organizationId = accounts?.[0]?.organization_id || null;
    }

    const deletedCount = deletedContacts?.length || 0;
    await supabase.from('instagram_data_deletion_requests').insert({
      confirmation_code: confirmationCode,
      igsid,
      organization_id: organizationId,
      status: deletedCount || deauthorizedAccounts ? 'completed' : 'nothing_to_delete',
      deleted_counts: { contacts: deletedCount, accounts_deauthorized: deauthorizedAccounts },
    });

    return jsonResponse({ url: statusUrl, confirmation_code: confirmationCode });
  } catch (error) {
    console.error('[instagram-data-deletion] error:', error);

    // Still hand back a tracking code: Meta requires the {url, confirmation_code}
    // shape, and a code that resolves to an honest "failed, we're on it" page is
    // better for the user than an error Meta will simply retry against.
    try {
      await supabase.from('instagram_data_deletion_requests').insert({
        confirmation_code: confirmationCode,
        igsid: 'unknown',
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    } catch (logError) {
      console.error('[instagram-data-deletion] failed to record the failure:', logError);
    }

    return jsonResponse({ url: statusUrl, confirmation_code: confirmationCode });
  }
});
