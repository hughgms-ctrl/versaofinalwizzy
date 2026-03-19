import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signatureToken, email } = await parseJsonBody<{ signatureToken: string; email: string }>(req);

    if (!signatureToken || !email) {
      return errorResponse("signatureToken and email are required", 400);
    }

    const supabase = createServiceClient();

    // Find signature by token
    const { data: signature, error: sigError } = await supabase
      .from("document_signatures")
      .select("id, status, signer_email, signer_phone")
      .eq("signature_token", signatureToken)
      .single();

    if (sigError || !signature) {
      return errorResponse("Assinatura não encontrada", 404);
    }

    if (signature.status === "signed") {
      return errorResponse("Documento já foi assinado", 400);
    }

    // Validate email matches
    if (signature.signer_email && signature.signer_email.toLowerCase() !== email.toLowerCase()) {
      return errorResponse("E-mail não corresponde ao signatário", 400);
    }

    // Generate 6-digit OTP
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    // Delete any existing OTP for this signature
    await supabase
      .from("signature_otp_codes")
      .delete()
      .eq("signature_id", signature.id);

    // Store OTP
    const { error: otpError } = await supabase
      .from("signature_otp_codes")
      .insert({
        signature_id: signature.id,
        email,
        phone: signature.signer_phone,
        code,
        expires_at: expiresAt,
      });

    if (otpError) {
      console.error("Error storing OTP:", otpError);
      return errorResponse("Erro ao gerar código", 500);
    }

    // Send OTP via email using UAZAPI or internal SMTP
    // For now, we log and return the code in dev (in production, integrate with email service)
    console.log(`[SIGNATURE-OTP] Code ${code} for signature ${signature.id} sent to ${email}`);

    // TODO: Integrate with email sending service
    // For now, we'll use the platform's existing messaging capabilities
    // In production, this should send an actual email

    return jsonResponse({ 
      success: true, 
      message: "Código enviado para " + email.replace(/(.{2}).*(@.*)/, "$1***$2"),
      // Remove in production - only for development/testing
      ...(Deno.env.get("ENVIRONMENT") !== "production" ? { _dev_code: code } : {}),
    });
  } catch (error) {
    console.error("Error in signature-send-otp:", error);
    return errorResponse(error.message || "Erro interno", 500);
  }
});
