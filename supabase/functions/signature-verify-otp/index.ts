import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signatureToken, code } = await parseJsonBody<{ signatureToken: string; code: string }>(req);

    if (!signatureToken || !code) {
      return errorResponse("signatureToken and code are required", 400);
    }

    const supabase = createServiceClient();

    // Find signature
    const { data: signature, error: sigError } = await supabase
      .from("document_signatures")
      .select("id, status")
      .eq("signature_token", signatureToken)
      .single();

    if (sigError || !signature) {
      return errorResponse("Assinatura não encontrada", 404);
    }

    if (signature.status === "signed") {
      return errorResponse("Documento já foi assinado", 400);
    }

    // Find and validate OTP
    const { data: otp, error: otpError } = await supabase
      .from("signature_otp_codes")
      .select("*")
      .eq("signature_id", signature.id)
      .eq("code", code)
      .eq("verified", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError || !otp) {
      return errorResponse("Código inválido ou expirado", 400);
    }

    // Mark OTP as verified
    await supabase
      .from("signature_otp_codes")
      .update({ verified: true })
      .eq("id", otp.id);

    return jsonResponse({ 
      success: true, 
      verified: true,
      otpId: otp.id,
    });
  } catch (error) {
    console.error("Error in signature-verify-otp:", error);
    return errorResponse(error.message || "Erro interno", 500);
  }
});
