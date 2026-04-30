import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";
import { resolveSignatureByToken, markSignerSigned } from "../_shared/signerBridge.ts";

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const cloudflareIp = req.headers.get("cf-connecting-ip");
  const realIp = req.headers.get("x-real-ip");
  if (forwarded) return forwarded.split(",")[0].trim();
  return cloudflareIp || realIp || "unknown";
}

function parseUserAgent(userAgent: string) {
  const ua = userAgent || "";
  const browser = /edg\//i.test(ua) ? "Edge"
    : /opr\//i.test(ua) ? "Opera"
    : /chrome\//i.test(ua) ? "Chrome"
    : /firefox\//i.test(ua) ? "Firefox"
    : /safari\//i.test(ua) && !/chrome\//i.test(ua) ? "Safari"
    : "Desconhecido";
  const os = /windows nt/i.test(ua) ? "Windows"
    : /android/i.test(ua) ? "Android"
    : /iphone|ipad|ipod/i.test(ua) ? "iOS"
    : /mac os x/i.test(ua) ? "macOS"
    : /linux/i.test(ua) ? "Linux"
    : "Desconhecido";
  const deviceType = /mobile|iphone|android/i.test(ua) ? "mobile"
    : /ipad|tablet/i.test(ua) ? "tablet"
    : "desktop";
  return { browser, os, deviceType };
}

function generateVerificationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let out = "";
  const buf = new Uint8Array(10);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 10; i++) {
    out += chars[buf[i] % chars.length];
  }
  return out;
}

// Robust base64 decoder for data-URL images coming from <canvas>/<img>.
// Strips the data: prefix, removes whitespace, validates content, and pads.
function decodeDataUrlImage(dataUrl: string): { buffer: Uint8Array; contentType: string } {
  if (!dataUrl || typeof dataUrl !== "string") {
    throw new Error("Imagem vazia");
  }

  // Extract content type if present (default png)
  let contentType = "image/png";
  const headerMatch = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  if (headerMatch) {
    contentType = headerMatch[1];
  }

  // Strip data URL prefix and any whitespace/newlines
  let b64 = dataUrl.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  // Keep only valid base64 chars (defensive)
  b64 = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  // Pad to length % 4 == 0
  while (b64.length % 4 !== 0) b64 += "=";

  if (b64.length === 0) {
    throw new Error("Imagem vazia (base64 sem conteúdo)");
  }

  try {
    const bin = atob(b64);
    const buffer = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    if (buffer.byteLength < 100) {
      throw new Error("Imagem muito pequena ou vazia");
    }
    return { buffer, contentType };
  } catch (e: any) {
    throw new Error(`Falha ao decodificar imagem: ${e?.message || "base64 inválido"}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      signatureToken,
      selfieImage,
      signatureImage,
      signerDevice,
      requireSelfie,
      geolocation,
    } = await parseJsonBody<{
      signatureToken: string;
      selfieImage: string | null;
      signatureImage: string;
      signerDevice: string;
      requireSelfie?: boolean;
      geolocation?: { lat: number; lng: number; accuracy?: number } | null;
    }>(req);

    if (!signatureToken || !signatureImage) {
      return errorResponse("signatureToken and signatureImage are required", 400);
    }

    const supabase = createServiceClient();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const signerIp = getClientIp(req);
    const signerUserAgent = signerDevice || req.headers.get("user-agent") || "unknown";
    const uaInfo = parseUserAgent(signerUserAgent);

    const resolved = await resolveSignatureByToken(supabase, signatureToken);
    if (!resolved) {
      return errorResponse("Assinatura não encontrada", 404);
    }
    if (resolved.status === "signed") {
      return errorResponse("Documento já foi assinado", 400);
    }

    // Re-fetch with the joined generated_document for hashing/stamping
    const { data: signature, error: sigError } = await supabase
      .from("document_signatures")
      .select("*, generated_document:generated_documents(id, name, pdf_url, filled_data)")
      .eq("id", resolved.id)
      .single();

    if (sigError || !signature) {
      return errorResponse("Assinatura não encontrada", 404);
    }

    const meta = (signature.metadata || {}) as Record<string, any>;
    const selfieRequired = requireSelfie ?? (meta.require_selfie !== false);
    if (selfieRequired && !selfieImage) {
      return errorResponse("Selfie é obrigatória para esta assinatura", 400);
    }

    const configuredChannels: Array<'email' | 'whatsapp'> = Array.isArray(meta.otp_channels) && meta.otp_channels.length > 0
      ? meta.otp_channels
      : [meta.otp_channel || 'email'];

    const { data: otpVerifiedRows } = await supabase
      .from("signature_otp_codes")
      .select("id, phone, verified, otp_verified_at:created_at")
      .eq("signature_id", signature.id)
      .eq("verified", true)
      .order("created_at", { ascending: false });

    const verifiedChannels = new Set<string>((otpVerifiedRows || []).map((row: any) => row.phone ? 'whatsapp' : 'email'));
    const missingChannels = configuredChannels.filter((channel) => !verifiedChannels.has(channel));
    const otpVerifiedAt = (otpVerifiedRows || [])[0]?.otp_verified_at || null;

    if (missingChannels.length > 0) {
      return errorResponse(`Verificação OTP pendente: ${missingChannels.map((c) => c === 'whatsapp' ? 'WhatsApp' : 'e-mail').join(' e ')}`, 400);
    }

    // Document hash from original PDF
    let documentHash = "";
    const originalPdfUrl: string | null = signature.generated_document?.pdf_url || null;
    if (originalPdfUrl) {
      try {
        const pdfResponse = await fetch(originalPdfUrl);
        const pdfBuffer = await pdfResponse.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", pdfBuffer);
        documentHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, "0"))
          .join("");
      } catch (e) {
        console.error("Error hashing PDF:", e);
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(signature.generated_document?.filled_data || {}));
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        documentHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, "0"))
          .join("");
      }
    }

    // Selfie upload
    let selfieUrl: string | null = null;
    if (selfieImage) {
      try {
        const { buffer: selfieBuffer, contentType: selfieType } = decodeDataUrlImage(selfieImage);
        const ext = selfieType.split("/")[1] || "png";
        const selfieFileName = `signatures/${signature.id}/selfie_${Date.now()}.${ext}`;
        const { error: selfieUploadError } = await supabase.storage
          .from("contact-files")
          .upload(selfieFileName, selfieBuffer, { contentType: selfieType, upsert: true });
        if (selfieUploadError) {
          console.error("Error uploading selfie:", selfieUploadError);
          return errorResponse("Erro ao salvar selfie", 500);
        }
        const { data: { publicUrl } } = supabase.storage.from("contact-files").getPublicUrl(selfieFileName);
        selfieUrl = publicUrl;
      } catch (e: any) {
        console.error("Selfie decode failed:", e);
        return errorResponse(`Selfie inválida: ${e?.message || "formato não reconhecido"}`, 400);
      }
    }

    // Signature image upload
    let signatureUrl: string;
    try {
      const { buffer: sigBuffer, contentType: sigType } = decodeDataUrlImage(signatureImage);
      const ext = sigType.split("/")[1] || "png";
      const sigFileName = `signatures/${signature.id}/signature_${Date.now()}.${ext}`;
      const { error: sigUploadError } = await supabase.storage
        .from("contact-files")
        .upload(sigFileName, sigBuffer, { contentType: sigType, upsert: true });
      if (sigUploadError) {
        console.error("Error uploading signature:", sigUploadError);
        return errorResponse("Erro ao salvar assinatura", 500);
      }
      const { data: { publicUrl } } = supabase.storage.from("contact-files").getPublicUrl(sigFileName);
      signatureUrl = publicUrl;
    } catch (e: any) {
      console.error("Signature decode failed:", e);
      return errorResponse(`Assinatura inválida: ${e?.message || "desenhe sua assinatura antes de enviar"}`, 400);
    }

    const signedAt = new Date().toISOString();
    const verificationCode = generateVerificationCode();

    // Evidence record
    const { error: evidenceError } = await supabase
      .from("signature_evidence")
      .insert({
        signature_id: signature.id,
        document_hash: documentHash,
        signer_ip: signerIp,
        signer_device: signerUserAgent,
        selfie_url: selfieUrl,
        otp_verified_at: otpVerifiedAt,
        signed_at: signedAt,
        verification_code: verificationCode,
        geolocation: geolocation || null,
        original_pdf_url: originalPdfUrl,
        metadata: {
          user_agent: signerUserAgent,
          browser: uaInfo.browser,
          os: uaInfo.os,
          device_type: uaInfo.deviceType,
          signature_method: selfieRequired ? "internal_advanced" : "internal_otp_only",
          law_reference: "MP 2.200-2/2001 + Lei 14.063/2020",
          require_selfie: selfieRequired,
          otp_channel: meta.otp_channel || "email",
          otp_channels: configuredChannels,
        },
      });

    if (evidenceError) {
      console.error("Error creating evidence:", evidenceError);
      return errorResponse("Erro ao registrar evidência", 500);
    }

    // Stamp PDF (footer + signatures page + QR)
    let signedPdfUrl: string | null = null;
    if (originalPdfUrl) {
      try {
        const stampResp = await fetch(`${SUPABASE_URL}/functions/v1/signature-stamp-pdf`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            signatureId: signature.id,
            pdfUrl: originalPdfUrl,
            signerName: signature.signer_name,
            signerEmail: signature.signer_email,
            signerPhone: signature.signer_phone,
            signerCpf: signature.signer_cpf,
            documentName: signature.generated_document?.name,
            documentHash,
            verificationCode,
            selfieUrl,
            signatureImageUrl: signatureUrl,
            signedAt,
            signerIp,
            signerBrowser: uaInfo.browser,
            signerOs: uaInfo.os,
            deviceType: uaInfo.deviceType,
            otpChannel: meta.otp_channel || "email",
            geolocation,
            signerDevice: signerUserAgent,
          }),
        });
        if (stampResp.ok) {
          const stampData = await stampResp.json();
          signedPdfUrl = stampData.signedPdfUrl;
        } else {
          console.error("stamp-pdf failed:", await stampResp.text());
        }
      } catch (e) {
        console.error("Error stamping PDF:", e);
      }
    }

    // Update signature record
    await supabase
      .from("document_signatures")
      .update({
        status: "signed",
        signed_at: signedAt,
        signature_url: signatureUrl,
        signed_pdf_url: signedPdfUrl,
        metadata: {
          ...meta,
          document_hash: documentHash,
          verification_code: verificationCode,
          selfie_url: selfieUrl,
          signer_ip: signerIp,
          signer_device: signerUserAgent,
          signer_browser: uaInfo.browser,
          signer_os: uaInfo.os,
          signer_device_type: uaInfo.deviceType,
          geolocation: geolocation || null,
          signing_method_detail: selfieRequired ? "internal_advanced_otp_selfie" : "internal_otp_only",
        },
      })
      .eq("id", signature.id);

    // Propagate to document_signers row (if this signature originated from one)
    await markSignerSigned(supabase, signature.id, signedAt);

    // Only mark the generated_document as fully signed when there are no
    // remaining pending signers. Multi-signer documents need every signer.
    const { count: pendingSigners } = await supabase
      .from("document_signers")
      .select("id", { count: "exact", head: true })
      .eq("generated_document_id", signature.generated_document_id)
      .neq("status", "signed");

    if (!pendingSigners || pendingSigners === 0) {
      await supabase
        .from("generated_documents")
        .update({
          signing_status: "signed",
          status: "signed",
        })
        .eq("id", signature.generated_document_id);
    }

    // Receipt
    let receiptPdfUrl: string | null = null;
    try {
      const receiptResp = await fetch(`${SUPABASE_URL}/functions/v1/signature-receipt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          signatureId: signature.id,
          signerName: signature.signer_name,
          signerEmail: signature.signer_email,
          signerPhone: signature.signer_phone,
          signerCpf: signature.signer_cpf,
          documentName: signature.generated_document?.name,
          documentHash,
          verificationCode,
          selfieUrl,
          signatureUrl,
          signedAt,
          signerIp,
          signerDevice: signerUserAgent,
          signerBrowser: uaInfo.browser,
          signerOs: uaInfo.os,
          deviceType: uaInfo.deviceType,
          otpChannel: meta.otp_channel || "email",
          geolocation,
        }),
      });
      if (receiptResp.ok) {
        const receiptData = await receiptResp.json();
        receiptPdfUrl = receiptData.receiptUrl;
      }
    } catch (e) {
      console.error("Error generating receipt:", e);
    }

    // Resume flow executions if waiting
    const { data: executions } = await supabase
      .from("flow_executions")
      .select("*")
      .eq("conversation_id", signature.conversation_id)
      .eq("status", "waiting_signature");

    if (executions && executions.length > 0) {
      for (const exec of executions) {
        await supabase
          .from("flow_executions")
          .update({ status: "running" })
          .eq("id", exec.id);
      }
    }

    return jsonResponse({
      success: true,
      signatureUrl,
      selfieUrl,
      documentHash,
      signedPdfUrl,
      receiptPdfUrl,
      verificationCode,
      verificationUrl: `https://wizzybr.com/verificar/${verificationCode}`,
      signedAt,
      pendingSigners: pendingSigners ?? 0,
      allSigned: !pendingSigners || pendingSigners === 0,
    });
  } catch (error: any) {
    console.error("Error in signature-complete:", error);
    return errorResponse(error?.message || "Erro interno", 500);
  }
});
