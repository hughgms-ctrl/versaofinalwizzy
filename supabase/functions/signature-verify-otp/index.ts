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

    // Anti-brute-force: fetch the active OTP for this channel WITHOUT matching the
    // code, so we can count attempts on the row itself. A 6-digit code has 1M
    // combinations; with no per-code attempt cap it is brute-forceable online.
    const MAX_VERIFY_ATTEMPTS = 5;

    let query = supabase
      .from("signature_otp_codes")
      .select("id, code, attempts")
      .eq("signature_id", signature.id)
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

    const attempts = otp.attempts ?? 0;

    // Burn the code once the attempt cap is reached. We EXPIRE it (move expires_at
    // to the past) instead of setting verified=true: in signature-complete a
    // verified=true row counts as a PASSED channel, so marking a burned code
    // verified would bypass OTP entirely.
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      await supabase
        .from("signature_otp_codes")
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq("id", otp.id);
      return errorResponse("Muitas tentativas. Solicite um novo código.", 429);
    }

    if (otp.code !== code) {
      const newAttempts = attempts + 1;
      const update: Record<string, unknown> = { attempts: newAttempts };
      if (newAttempts >= MAX_VERIFY_ATTEMPTS) {
        // Last allowed try failed → burn the code (expire, never mark verified).
        update.expires_at = new Date(Date.now() - 1000).toISOString();
      }
      await supabase
        .from("signature_otp_codes")
        .update(update)
        .eq("id", otp.id);

      const remaining = Math.max(0, MAX_VERIFY_ATTEMPTS - newAttempts);
      return errorResponse(
        remaining > 0
          ? `Código inválido. ${remaining} tentativa(s) restante(s).`
          : "Código inválido. Muitas tentativas — solicite um novo código.",
        400,
      );
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
