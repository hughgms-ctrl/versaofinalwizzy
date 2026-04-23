import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await parseJsonBody<{ signer_id: string; channel?: "email" }>(req);
    if (!body.signer_id) return errorResponse("signer_id is required", 400);

    const supabase = createServiceClient();

    const { data: signer, error } = await (supabase as any)
      .from("document_signers")
      .select("*, generated_document:generated_documents(name, organization_id)")
      .eq("id", body.signer_id)
      .maybeSingle();

    if (error || !signer) return errorResponse("Signatário não encontrado", 404);
    if (!signer.signer_email) return errorResponse("Signatário sem e-mail", 400);

    const origin = req.headers.get("origin") || "https://wizzybr.com";
    const link = `${origin.includes("lovableproject") || origin.includes("lovable.app") ? "https://wizzybr.com" : origin}/sign/${signer.signature_token}`;

    const docName = signer.generated_document?.name || "Documento";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a1a;">Olá ${signer.signer_name},</h2>
        <p style="color: #4a4a4a; font-size: 15px;">
          Você foi convidado(a) para assinar o documento:
          <strong>${docName}</strong>.
        </p>
        <p style="color: #4a4a4a; font-size: 15px;">
          Clique no botão abaixo para revisar e assinar:
        </p>
        <p style="text-align: center; margin: 32px 0;">
          <a href="${link}" style="background: #2563eb; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
            Assinar documento
          </a>
        </p>
        <p style="color: #6b7280; font-size: 13px; word-break: break-all;">
          Ou copie este link: <a href="${link}">${link}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">
          Este é um link único e pessoal. Não compartilhe com terceiros.
        </p>
      </div>
    `;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      return errorResponse("E-mail não configurado no servidor", 500);
    }

    const resp = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: "Wizzy <onboarding@resend.dev>",
        to: [signer.signer_email],
        subject: `Assinatura solicitada — ${docName}`,
        html,
      }),
    });

    const respJson = await resp.json();
    if (!resp.ok) {
      console.error("Resend error", respJson);
      return errorResponse(respJson?.message || "Falha ao enviar e-mail", 500);
    }

    await (supabase as any)
      .from("document_signers")
      .update({ sent_at: new Date().toISOString(), status: signer.status === "pending" ? "sent" : signer.status })
      .eq("id", signer.id);

    return jsonResponse({ success: true, message_id: respJson.id });
  } catch (e: any) {
    console.error("send-signer-link error", e);
    return errorResponse(e.message || "Internal error", 500);
  }
});
