import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";
import { resolveSignatureByToken } from "../_shared/signerBridge.ts";

type Provider = "evolution" | "uazapi";

interface ChannelResult {
  channel: "email" | "whatsapp";
  ok: boolean;
  message?: string;
  error?: string;
}

function normalizeBaseUrl(value?: string | null): string {
  return (value || "").trim().replace(/\/$/, "");
}

async function loadConnectionSettings(supabase: any) {
  const { data: row } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "whatsapp_connection_settings")
    .maybeSingle();
  const value = row?.value || {};
  return {
    uazapiBaseUrl: normalizeBaseUrl(value.uazapi_base_url || Deno.env.get("UAZAPI_BASE_URL")),
    evolutionBaseUrl: normalizeBaseUrl(value.evolution_base_url || Deno.env.get("EVOLUTION_BASE_URL")),
    evolutionApiKey: value.evolution_api_key || Deno.env.get("EVOLUTION_API_KEY") || "",
  };
}

async function loadProviderStrategy(supabase: any): Promise<{
  primaryProvider: Provider;
  backupProvider: Provider;
  evolutionEnabled: boolean;
  uazapiEnabled: boolean;
}> {
  const { data: row } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "whatsapp_provider_strategy")
    .maybeSingle();
  const value = row?.value || {};
  return {
    primaryProvider: value.primary_provider === "uazapi" ? "uazapi" : "evolution",
    backupProvider: value.backup_provider === "evolution" ? "evolution" : "uazapi",
    evolutionEnabled: value.evolution_enabled ?? true,
    uazapiEnabled: value.uazapi_enabled ?? true,
  };
}

function providerEnabled(provider: Provider, strategy: Awaited<ReturnType<typeof loadProviderStrategy>>) {
  return provider === "evolution" ? strategy.evolutionEnabled : strategy.uazapiEnabled;
}

async function resolveOtpInstance(supabase: any, organizationId: string) {
  const strategy = await loadProviderStrategy(supabase);
  const preferredProviders: Provider[] = [];
  if (providerEnabled(strategy.primaryProvider, strategy)) preferredProviders.push(strategy.primaryProvider);
  if (strategy.backupProvider !== strategy.primaryProvider && providerEnabled(strategy.backupProvider, strategy)) {
    preferredProviders.push(strategy.backupProvider);
  }
  if (!preferredProviders.includes("evolution")) preferredProviders.push("evolution");
  if (!preferredProviders.includes("uazapi")) preferredProviders.push("uazapi");

  const { data: instances } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "connected")
    .order("created_at", { ascending: false });

  for (const provider of preferredProviders) {
    const instance = (instances || []).find((item: any) => (item.provider || "uazapi") === provider);
    if (instance) return instance;
  }
  return (instances || [])[0] || null;
}

async function sendEmailOtp(args: { email: string; code: string }): Promise<ChannelResult> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return { channel: "email", ok: false, error: "Servico de e-mail nao configurado" };
  }

  try {
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Wizzy Sign <no-reply@wizzybr.com>",
        to: [args.email],
        subject: `Codigo de verificacao: ${args.code}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1a1a1a; margin-bottom: 8px;">Codigo de verificacao</h2>
            <p style="color: #555; font-size: 14px;">Use o codigo abaixo para assinar o documento:</p>
            <div style="background: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #18181b;">${args.code}</span>
            </div>
            <p style="color: #888; font-size: 12px;">Este codigo expira em 5 minutos. Se voce nao solicitou, ignore este e-mail.</p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errBody = await emailResponse.text();
      console.error(`[OTP-EMAIL] Resend error [${emailResponse.status}]:`, errBody);
      if (emailResponse.status === 403 && /verify a domain/i.test(errBody)) {
        return { channel: "email", ok: false, error: "Dominio do Resend nao verificado. Verifique no painel Resend ou use WhatsApp." };
      }
      return { channel: "email", ok: false, error: "Falha ao enviar e-mail" };
    }

    const masked = args.email.replace(/(.{2}).*(@.*)/, "$1***$2");
    return { channel: "email", ok: true, message: `E-mail enviado para ${masked}` };
  } catch (e: any) {
    console.error("[OTP-EMAIL] Exception:", e);
    return { channel: "email", ok: false, error: e?.message || "Erro inesperado ao enviar e-mail" };
  }
}

async function sendWhatsappOtp(args: {
  phone: string;
  code: string;
  organizationId: string;
  supabase: any;
}): Promise<ChannelResult> {
  try {
    const connectionSettings = await loadConnectionSettings(args.supabase);
    const instance = await resolveOtpInstance(args.supabase, args.organizationId);
    if (!instance) {
      return { channel: "whatsapp", ok: false, error: "Nenhuma instancia WhatsApp ativa" };
    }

    const cleanPhone = args.phone.replace(/\D/g, "");
    const whatsappPhone = cleanPhone;
    const message = `Codigo de verificacao\n\nSeu codigo para assinatura do documento: ${args.code}\n\nEste codigo expira em 5 minutos.\n\nSe voce nao solicitou, ignore esta mensagem.`;

    if ((instance.provider || "uazapi") === "evolution") {
      const evolutionBaseUrl = connectionSettings.evolutionBaseUrl;
      const evolutionApiKey = instance.evolution_api_key || connectionSettings.evolutionApiKey || instance.zapi_token;
      const instanceName = instance.evolution_instance_name || instance.zapi_instance_id;

      if (!evolutionBaseUrl || !evolutionApiKey || !instanceName) {
        return { channel: "whatsapp", ok: false, error: "Evolution API nao configurada para esta instancia" };
      }

      const response = await fetch(`${evolutionBaseUrl}/message/sendText/${instanceName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evolutionApiKey,
        },
        body: JSON.stringify({
          number: whatsappPhone,
          text: message,
          delay: 1000,
          linkPreview: false,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`[OTP-WHATSAPP] Evolution error [${response.status}]:`, errBody);
        return { channel: "whatsapp", ok: false, error: "Falha ao enviar WhatsApp via Evolution" };
      }

      const masked = args.phone.replace(/(\d{2})(\d+)(\d{2})/, "$1***$3");
      return { channel: "whatsapp", ok: true, message: `WhatsApp enviado para ${masked}` };
    }

    if (!connectionSettings.uazapiBaseUrl || !instance.zapi_token) {
      return { channel: "whatsapp", ok: false, error: "UAZAPI nao configurada para esta instancia" };
    }

    const response = await fetch(`${connectionSettings.uazapiBaseUrl}/send/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": instance.zapi_token,
      },
      body: JSON.stringify({
        number: whatsappPhone,
        text: message,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[OTP-WHATSAPP] UAZAPI error [${response.status}]:`, errBody);
      return { channel: "whatsapp", ok: false, error: "Falha ao enviar WhatsApp" };
    }

    const masked = args.phone.replace(/(\d{2})(\d+)(\d{2})/, "$1***$3");
    return { channel: "whatsapp", ok: true, message: `WhatsApp enviado para ${masked}` };
  } catch (e: any) {
    console.error("[OTP-WHATSAPP] Exception:", e);
    return { channel: "whatsapp", ok: false, error: e?.message || "Erro inesperado ao enviar WhatsApp" };
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
      channel?: "email" | "whatsapp";
    }>(req);

    if (!signatureToken) {
      return errorResponse("signatureToken is required", 400);
    }

    const supabase = createServiceClient();
    const signature = await resolveSignatureByToken(supabase, signatureToken);

    if (!signature) {
      return errorResponse("Assinatura nao encontrada", 404);
    }
    if (signature.status === "signed") {
      return errorResponse("Documento ja foi assinado", 400);
    }

    const meta = (signature.metadata as any) || {};
    const configuredChannels: Array<"email" | "whatsapp"> = Array.isArray(meta.otp_channels) && meta.otp_channels.length > 0
      ? meta.otp_channels
      : [meta.otp_channel || "email"];

    const targetChannel = channel || configuredChannels[0];
    if (!configuredChannels.includes(targetChannel)) {
      return errorResponse("Canal OTP invalido para esta assinatura", 400);
    }

    const targetEmail = email || signature.signer_email;
    const targetPhone = signature.signer_phone;

    if (targetChannel === "email" && !targetEmail) {
      return errorResponse("E-mail do signatario e obrigatorio para verificacao por e-mail", 400);
    }
    if (targetChannel === "whatsapp" && !targetPhone) {
      return errorResponse("Telefone do signatario e obrigatorio para verificacao por WhatsApp", 400);
    }
    if (targetChannel === "email" && signature.signer_email && targetEmail &&
        signature.signer_email.toLowerCase() !== targetEmail.toLowerCase()) {
      return errorResponse("E-mail nao corresponde ao signatario", 400);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await supabase
      .from("signature_otp_codes")
      .delete()
      .eq("signature_id", signature.id)
      .eq("email", targetChannel === "email" ? (targetEmail || "") : "")
      .eq("phone", targetChannel === "whatsapp" ? (targetPhone || null) : null);

    const { error: otpError } = await supabase
      .from("signature_otp_codes")
      .insert({
        signature_id: signature.id,
        email: targetChannel === "email" ? (targetEmail || "") : "",
        phone: targetChannel === "whatsapp" ? (targetPhone || null) : null,
        code,
        expires_at: expiresAt,
        verified: false,
      });

    if (otpError) {
      console.error("Error storing OTP:", otpError);
      return errorResponse("Erro ao gerar codigo", 500);
    }

    const dispatch = targetChannel === "email"
      ? await sendEmailOtp({ email: targetEmail!, code })
      : await sendWhatsappOtp({
          phone: targetPhone!,
          code,
          organizationId: signature.organization_id,
          supabase,
        });

    if (!dispatch.ok) {
      await supabase
        .from("signature_otp_codes")
        .delete()
        .eq("signature_id", signature.id)
        .eq("code", code);
      return errorResponse(dispatch.error || "Erro ao enviar codigo", 500);
    }

    console.log(`[SIGNATURE-OTP] Code dispatched via [${dispatch.channel}] for signature ${signature.id}`);

    return jsonResponse({
      success: true,
      channel: dispatch.channel,
      message: dispatch.message || "Codigo enviado",
    });
  } catch (error: any) {
    console.error("Error in signature-send-otp:", error);
    return errorResponse(error?.message || "Erro interno", 500);
  }
});
