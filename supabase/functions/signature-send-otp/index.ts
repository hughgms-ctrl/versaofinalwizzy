import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";
import { resolveSignatureByToken } from "../_shared/signerBridge.ts";

interface ChannelResult {
  channel: 'email' | 'whatsapp';
  ok: boolean;
  message?: string;
  error?: string;
}

async function sendEmailOtp(args: {
  email: string;
  code: string;
}): Promise<ChannelResult> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return { channel: 'email', ok: false, error: "Serviço de e-mail não configurado (RESEND_API_KEY ausente)" };
  }

  try {
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Assinatura Eletrônica <onboarding@resend.dev>",
        to: [args.email],
        subject: `Código de verificação: ${args.code}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1a1a1a; margin-bottom: 8px;">Código de Verificação</h2>
            <p style="color: #555; font-size: 14px;">Use o código abaixo para assinar o documento:</p>
            <div style="background: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #18181b;">${args.code}</span>
            </div>
            <p style="color: #888; font-size: 12px;">Este código expira em 5 minutos. Se você não solicitou, ignore este e-mail.</p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errBody = await emailResponse.text();
      console.error(`[OTP-EMAIL] Resend error [${emailResponse.status}]:`, errBody);
      if (emailResponse.status === 403 && /verify a domain/i.test(errBody)) {
        return {
          channel: 'email',
          ok: false,
          error: "Domínio do Resend não verificado. Verifique no painel Resend ou use WhatsApp.",
        };
      }
      return { channel: 'email', ok: false, error: "Falha ao enviar e-mail" };
    }

    const masked = args.email.replace(/(.{2}).*(@.*)/, "$1***$2");
    return { channel: 'email', ok: true, message: `E-mail enviado para ${masked}` };
  } catch (e: any) {
    console.error("[OTP-EMAIL] Exception:", e);
    return { channel: 'email', ok: false, error: e?.message || "Erro inesperado ao enviar e-mail" };
  }
}

async function sendWhatsappOtp(args: {
  phone: string;
  code: string;
  organizationId: string;
  supabase: any;
}): Promise<ChannelResult> {
  const UAZAPI_BASE_URL = Deno.env.get("UAZAPI_BASE_URL");
  if (!UAZAPI_BASE_URL) {
    return { channel: 'whatsapp', ok: false, error: "WhatsApp não configurado (UAZAPI_BASE_URL ausente)" };
  }

  try {
    const { data: instance } = await args.supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("organization_id", args.organizationId)
      .eq("status", "connected")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!instance || !instance.zapi_token) {
      return { channel: 'whatsapp', ok: false, error: "Nenhuma instância WhatsApp ativa" };
    }

    const cleanPhone = args.phone.replace(/\D/g, '');
    const whatsappPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const baseUrl = UAZAPI_BASE_URL.endsWith('/') ? UAZAPI_BASE_URL.slice(0, -1) : UAZAPI_BASE_URL;

    const waResponse = await fetch(`${baseUrl}/send/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": instance.zapi_token,
      },
      body: JSON.stringify({
        number: whatsappPhone,
        text: `🔐 *Código de Verificação*\n\nSeu código para assinatura do documento: *${args.code}*\n\nEste código expira em 5 minutos.\n\n_Se você não solicitou, ignore esta mensagem._`,
      }),
    });

    if (!waResponse.ok) {
      const errBody = await waResponse.text();
      console.error(`[OTP-WHATSAPP] UAZAPI error [${waResponse.status}]:`, errBody);
      return { channel: 'whatsapp', ok: false, error: "Falha ao enviar WhatsApp" };
    }

    const masked = args.phone.replace(/(\d{2})(\d+)(\d{2})/, "$1***$3");
    return { channel: 'whatsapp', ok: true, message: `WhatsApp enviado para ${masked}` };
  } catch (e: any) {
    console.error("[OTP-WHATSAPP] Exception:", e);
    return { channel: 'whatsapp', ok: false, error: e?.message || "Erro inesperado ao enviar WhatsApp" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signatureToken, email, channel } = await parseJsonBody<{
      signatureToken: string;
      email?: string;
      channel?: 'email' | 'whatsapp' | 'all';
    }>(req);

    if (!signatureToken) {
      return errorResponse("signatureToken is required", 400);
    }

    const supabase = createServiceClient();
    const signature = await resolveSignatureByToken(supabase, signatureToken);

    if (!signature) {
      return errorResponse("Assinatura não encontrada", 404);
    }
    if (signature.status === "signed") {
      return errorResponse("Documento já foi assinado", 400);
    }

    const meta = (signature.metadata as any) || {};
    // Multi-channel support: prefer the explicit list saved in metadata
    let channels: Array<'email' | 'whatsapp'> = Array.isArray(meta.otp_channels) && meta.otp_channels.length > 0
      ? meta.otp_channels
      : [meta.otp_channel || 'email'];

    // If client explicitly requests a single channel, restrict to it
    if (channel && channel !== 'all') {
      channels = [channel as 'email' | 'whatsapp'];
    }

    const targetEmail = email || signature.signer_email;
    const targetPhone = signature.signer_phone;

    // Validate availability of contact info per requested channel
    if (channels.includes('email') && !targetEmail) {
      return errorResponse("E-mail do signatário é obrigatório para verificação por e-mail", 400);
    }
    if (channels.includes('whatsapp') && !targetPhone) {
      return errorResponse("Telefone do signatário é obrigatório para verificação por WhatsApp", 400);
    }
    if (channels.includes('email') && signature.signer_email && targetEmail &&
        signature.signer_email.toLowerCase() !== targetEmail.toLowerCase()) {
      return errorResponse("E-mail não corresponde ao signatário", 400);
    }

    // Generate ONE 6-digit OTP shared across channels (simpler UX: any code works)
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Replace any existing OTP for this signature
    await supabase
      .from("signature_otp_codes")
      .delete()
      .eq("signature_id", signature.id);

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

    // Dispatch in parallel
    const dispatches = await Promise.all(channels.map((c) => {
      if (c === 'email') {
        return sendEmailOtp({ email: targetEmail!, code });
      }
      return sendWhatsappOtp({
        phone: targetPhone!,
        code,
        organizationId: signature.organization_id,
        supabase,
      });
    }));

    const successes = dispatches.filter(d => d.ok);
    const failures = dispatches.filter(d => !d.ok);

    if (successes.length === 0) {
      // Total failure → cleanup so user can retry
      await supabase
        .from("signature_otp_codes")
        .delete()
        .eq("signature_id", signature.id);
      const reason = failures.map(f => `${f.channel}: ${f.error}`).join(' | ');
      return errorResponse(reason || "Erro ao enviar código", 500);
    }

    const messageParts = successes.map(s => s.message!).filter(Boolean);
    const warning = failures.length > 0
      ? ` (Aviso: ${failures.map(f => `${f.channel} falhou`).join(', ')})`
      : '';

    console.log(`[SIGNATURE-OTP] Code dispatched via [${successes.map(s => s.channel).join(', ')}] for signature ${signature.id}`);

    return jsonResponse({
      success: true,
      channels: successes.map(s => s.channel),
      message: `Código enviado: ${messageParts.join(' e ')}${warning}`,
    });
  } catch (error) {
    console.error("Error in signature-send-otp:", error);
    return errorResponse(error.message || "Erro interno", 500);
  }
});
