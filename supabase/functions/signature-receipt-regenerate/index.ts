import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signatureId } = await parseJsonBody<{ signatureId: string }>(req);
    if (!signatureId) return errorResponse("signatureId is required", 400);

    const supabase = createServiceClient();

    // Load signature + evidence + document
    const { data: sig, error: sigErr } = await supabase
      .from("document_signatures")
      .select("*, generated_document:generated_documents(id, name, created_at)")
      .eq("id", signatureId)
      .maybeSingle();

    if (sigErr || !sig) return errorResponse("Assinatura não encontrada", 404);

    const { data: ev } = await supabase
      .from("signature_evidence")
      .select("*")
      .eq("signature_id", signatureId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const meta = (ev as any)?.metadata || {};
    const geo = (ev as any)?.geolocation || null;

    const payload = {
      signatureId: sig.id,
      signerName: sig.signer_name,
      signerEmail: sig.signer_email,
      signerPhone: sig.signer_phone,
      signerCpf: sig.signer_cpf,
      documentName: sig.generated_document?.name,
      documentHash: (ev as any)?.document_hash || null,
      verificationCode: (ev as any)?.verification_code || null,
      selfieUrl: (ev as any)?.selfie_url || null,
      signatureUrl: sig.signature_url,
      signedAt: sig.signed_at,
      signerIp: (ev as any)?.signer_ip || null,
      signerBrowser: meta.browser || null,
      signerOs: meta.os || null,
      deviceType: meta.device_type || null,
      signerDevice: meta.device || meta.user_agent || null,
      otpChannel: meta.otp_channel || "email",
      geolocation: geo,
      createdAt: sig.generated_document?.created_at || sig.created_at,
    };

    // Invoke signature-receipt internally
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const r = await fetch(`${SUPABASE_URL}/functions/v1/signature-receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await r.json();
    if (!r.ok) return errorResponse(result?.error || "Falha ao regerar recibo", 500);

    return jsonResponse({ success: true, receiptUrl: result.receiptUrl });
  } catch (e: any) {
    console.error("signature-receipt-regenerate error:", e);
    return errorResponse(e?.message || "Erro interno", 500);
  }
});
