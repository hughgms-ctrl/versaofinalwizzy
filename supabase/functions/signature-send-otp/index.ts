import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signatureToken, email, channel } = await parseJsonBody<{ 
      signatureToken: string; 
      email?: string;
      channel?: 'email' | 'whatsapp';
    }>(req);

    if (!signatureToken) {
      return errorResponse("signatureToken is required", 400);
    }

    const supabase = createServiceClient();

    // Find signature by token
    const { data: signature, error: sigError } = await supabase
      .from("document_signatures")
      .select("id, status, signer_email, signer_phone, metadata")
      .eq("signature_token", signatureToken)
      .single();

    if (sigError || !signature) {
      return errorResponse("Assinatura não encontrada", 404);
    }

    if (signature.status === "signed") {
      return errorResponse("Documento já foi assinado", 400);
    }

    const otpChannel = channel || (signature.metadata as any)?.otp_channel || 'email';
    const targetEmail = email || signature.signer_email;
    const targetPhone = signature.signer_phone;

    if (otpChannel === 'email' && !targetEmail) {
      return errorResponse("E-mail do signatário é obrigatório para verificação por e-mail", 400);
    }

    if (otpChannel === 'whatsapp' && !targetPhone) {
      return errorResponse("Telefone do signatário é obrigatório para verificação por WhatsApp", 400);
    }

    // Validate email matches if provided
    if (otpChannel === 'email' && signature.signer_email && targetEmail && 
        signature.signer_email.toLowerCase() !== targetEmail.toLowerCase()) {
      return errorResponse("E-mail não corresponde ao signatário", 400);
    }

    // Generate 6-digit OTP
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

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
        email: targetEmail || null,
        phone: targetPhone || null,
        code,
        expires_at: expiresAt,
      });

    if (otpError) {
      console.error("Error storing OTP:", otpError);
      return errorResponse("Erro ao gerar código", 500);
    }

    // Send OTP based on channel
    if (otpChannel === 'whatsapp') {
      // Send via UAZAPI (WhatsApp)
      const UAZAPI_BASE_URL = Deno.env.get("UAZAPI_BASE_URL");
      const UAZAPI_ADMIN_TOKEN = Deno.env.get("UAZAPI_ADMIN_TOKEN");

      if (!UAZAPI_BASE_URL || !UAZAPI_ADMIN_TOKEN) {
        console.error("UAZAPI not configured");
        return errorResponse("Serviço WhatsApp não configurado", 500);
      }

      // Get org's active instance
      const { data: orgData } = await supabase
        .from("document_signatures")
        .select("organization_id")
        .eq("id", signature.id)
        .single();

      if (!orgData) {
        return errorResponse("Organização não encontrada", 500);
      }

      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("instance_name, api_token")
        .eq("organization_id", orgData.organization_id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!instance) {
        return errorResponse("Nenhuma instância WhatsApp ativa encontrada", 500);
      }

      // Clean phone number
      const cleanPhone = targetPhone!.replace(/\D/g, '');
      const whatsappPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      const waResponse = await fetch(`${UAZAPI_BASE_URL}/${instance.instance_name}/messages/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${instance.api_token}`,
        },
        body: JSON.stringify({
          phone: whatsappPhone,
          message: `🔐 *Código de Verificação*\n\nSeu código para assinatura do documento: *${code}*\n\nEste código expira em 5 minutos.\n\n_Se você não solicitou, ignore esta mensagem._`,
        }),
      });

      if (!waResponse.ok) {
        const errBody = await waResponse.text();
        console.error(`UAZAPI error [${waResponse.status}]:`, errBody);
        return errorResponse("Erro ao enviar código via WhatsApp", 500);
      }

      const maskedPhone = targetPhone!.replace(/(\d{2})(\d+)(\d{2})/, "$1***$3");
      console.log(`[SIGNATURE-OTP] Code sent via WhatsApp to ${maskedPhone} for signature ${signature.id}`);

      return jsonResponse({ 
        success: true, 
        channel: 'whatsapp',
        message: `Código enviado via WhatsApp para ${maskedPhone}`,
      });
    } else {
      // Send via Resend (Email)
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
          from: "Assinatura Eletrônica <onboarding@resend.dev>",
          to: [targetEmail],
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

      const maskedEmail = targetEmail!.replace(/(.{2}).*(@.*)/, "$1***$2");
      console.log(`[SIGNATURE-OTP] Code sent to ${maskedEmail} for signature ${signature.id}`);

      return jsonResponse({ 
        success: true, 
        channel: 'email',
        message: `Código enviado para ${maskedEmail}`,
      });
    }
  } catch (error) {
    console.error("Error in signature-send-otp:", error);
    return errorResponse(error.message || "Erro interno", 500);
  }
});
