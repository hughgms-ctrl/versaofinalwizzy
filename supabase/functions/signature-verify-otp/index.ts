import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";
import { resolveSignatureByToken } from "../_shared/signerBridge.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signatureToken, code, channel } = await parseJsonBody<{ signatureToken: string; code: string; channel?: 'email' | 'whatsapp' }>(req);

    if (!signatureToken || !code) {
      return errorResponse("signatureToken and code are required", 400);
    }

    const supabase = createServiceClient();

    // Find signature (supports legacy + new signers table)
    const signature = await resolveSignatureByToken(supabase, signatureToken);

    if (!signature) {
      return errorResponse("Assinatura não encontrada", 404);
    }

    if (signature.status === "signed") {
      return errorResponse("Documento já foi assinado", 400);
    }

    const meta = (signature.metadata as any) || {};
    const configuredChannels: Array<'email' | 'whatsapp'> = Array.isArray(meta.otp_channels) && meta.otp_channels.length > 0
      ? meta.otp_channels
      : [meta.otp_channel || 'email'];
    const targetChannel = channel || configuredChannels[0];

    // Find and validate OTP for the requested channel only
    let query = supabase
      .from("signature_otp_codes")
      .select("*")
      .eq("signature_id", signature.id)
      .eq("code", code)
      .eq("verified", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    query = targetChannel === 'whatsapp'
      ? query.not("phone", "is", null)
      : query.is("phone", null);

    const { data: otp, error: otpError } = await query.maybeSingle();

    if (otpError || !otp) {
      return errorResponse("Código inválido ou expirado", 400);
    }

    await supabase
      .from("signature_otp_codes")
      .update({ verified: true })
      .eq("id", otp.id);

    return jsonResponse({ 
      success: true, 
      verified: true,
      otpId: otp.id,
      channel: targetChannel,
    });
  } catch (error) {
    console.error("Error in signature-verify-otp:", error);
    return errorResponse(error.message || "Erro interno", 500);
  }
});
