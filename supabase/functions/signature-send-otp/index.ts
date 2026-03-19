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

    // Send OTP via Resend
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return errorResponse("Serviço de e-mail não configurado", 500);
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Assinatura <noreply@wizzyai.com.br>",
        to: [email],
        subject: `Código de verificação: ${code}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1a1a1a; margin-bottom: 8px;">Código de Verificação</h2>
            <p style="color: #555; font-size: 14px;">Use o código abaixo para assinar o documento:</p>
            <div style="background: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #18181b;">${code}</span>
            </div>
            <p style="color: #888; font-size: 12px;">Este código expira em 5 minutos. Se você não solicitou, ignore este e-mail.</p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errBody = await emailResponse.text();
      console.error(`Resend error [${emailResponse.status}]:`, errBody);
      return errorResponse("Erro ao enviar e-mail com código", 500);
    }

    console.log(`[SIGNATURE-OTP] Code sent to ${email} for signature ${signature.id}`);

    return jsonResponse({ 
      success: true, 
      message: "Código enviado para " + email.replace(/(.{2}).*(@.*)/, "$1***$2"),
    });
  } catch (error) {
    console.error("Error in signature-send-otp:", error);
    return errorResponse(error.message || "Erro interno", 500);
  }
});
