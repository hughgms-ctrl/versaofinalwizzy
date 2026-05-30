import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  checkRateLimit,
  corsHeaders,
  createServiceClient,
  jsonResponse,
  parseJsonBody,
} from "../_shared/middleware.ts";

const PUBLIC_APP_ORIGIN = "https://wizzybr.com";
const ALLOWED_REDIRECT_ORIGINS = new Set([
  "https://wizzybr.com",
  "https://wizzyai.lovable.app",
]);

function normalizeEmail(email?: string | null) {
  return (email || "").trim().toLowerCase();
}

function resolveRedirectTo(value?: string | null) {
  try {
    const url = new URL(value || `${PUBLIC_APP_ORIGIN}/auth?mode=reset`);
    if (!ALLOWED_REDIRECT_ORIGINS.has(url.origin)) {
      return `${PUBLIC_APP_ORIGIN}/auth?mode=reset`;
    }

    url.pathname = "/auth";
    url.search = "?mode=reset";
    return url.toString();
  } catch {
    return `${PUBLIC_APP_ORIGIN}/auth?mode=reset`;
  }
}

function buildBrandedRecoveryLink(redirectTo: string, hashedToken?: string | null, fallbackLink?: string | null) {
  if (!hashedToken) {
    return fallbackLink || redirectTo;
  }

  const url = new URL(redirectTo);
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", "recovery");
  return url.toString();
}

function buildRecoveryEmailHtml(actionLink: string) {
  return `
    <div style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
        Use este link para criar uma nova senha na sua conta Wizzy.
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;padding:28px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:540px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:26px 30px 16px 30px;border-bottom:1px solid #eef0f4;">
                  <div style="font-size:22px;font-weight:700;letter-spacing:.2px;color:#111827;">Wizzy</div>
                  <div style="font-size:13px;color:#6b7280;margin-top:4px;">Gestao inteligente de conversas</div>
                </td>
              </tr>
              <tr>
                <td style="padding:30px;">
                  <h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.25;color:#111827;">Redefinir sua senha</h1>
                  <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#374151;">
                    Recebemos uma solicitacao para redefinir a senha da sua conta Wizzy.
                  </p>
                  <p style="margin:0 0 26px 0;font-size:15px;line-height:1.6;color:#374151;">
                    Clique no botao abaixo para criar uma nova senha. O link e pessoal e temporario.
                  </p>
                  <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 26px 0;">
                    <tr>
                      <td>
                        <a href="${actionLink}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 22px;border-radius:8px;">
                          Criar nova senha
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
                    Por seguranca, este link expira automaticamente. Se voce nao pediu essa alteracao, nenhuma acao e necessaria.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 30px 26px 30px;border-top:1px solid #eef0f4;color:#6b7280;font-size:12px;line-height:1.6;">
                  Este e um e-mail transacional da Wizzy enviado para proteger o acesso a sua conta.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function buildRecoveryEmailText(actionLink: string) {
  return [
    "Wizzy",
    "",
    "Redefinir sua senha",
    "",
    "Recebemos uma solicitacao para redefinir a senha da sua conta Wizzy.",
    "Use o link seguro abaixo para criar uma nova senha:",
    "",
    actionLink,
    "",
    "Se voce nao solicitou esta redefinicao, ignore este e-mail. Sua senha atual continuara a mesma.",
  ].join("\n");
}

async function sendRecoveryEmail(email: string, actionLink: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY nao configurada");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Wizzy <suporte@wizzybr.com>",
      to: [email],
      subject: "Criar nova senha na Wizzy",
      text: buildRecoveryEmailText(actionLink),
      html: buildRecoveryEmailHtml(actionLink),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("[AUTH-RECOVERY] Resend error:", response.status, body);
    throw new Error("Falha ao enviar e-mail de recuperacao");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(ip, { keyPrefix: "auth-recovery-ip", maxRequests: 8, windowMs: 60 * 60 * 1000 })) {
    return jsonResponse({ success: true });
  }

  try {
    const { email: rawEmail, redirectTo } = await parseJsonBody<{ email?: string; redirectTo?: string }>(req);
    const email = normalizeEmail(rawEmail);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ success: true });
    }

    if (!checkRateLimit(email, { keyPrefix: "auth-recovery-email", maxRequests: 3, windowMs: 60 * 60 * 1000 })) {
      return jsonResponse({ success: true });
    }

    const supabase = createServiceClient();
    const resolvedRedirectTo = resolveRedirectTo(redirectTo);
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: resolvedRedirectTo,
      },
    });

    if (error) {
      console.error("[AUTH-RECOVERY] generateLink error:", error.message);
      return jsonResponse({ success: true });
    }

    const actionLink = buildBrandedRecoveryLink(
      resolvedRedirectTo,
      data?.properties?.hashed_token,
      data?.properties?.action_link,
    );

    if (actionLink) {
      await sendRecoveryEmail(email, actionLink);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("[AUTH-RECOVERY] Unexpected error:", error);
    return jsonResponse({ success: true });
  }
});
