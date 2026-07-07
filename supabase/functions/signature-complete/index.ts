import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody, checkRateLimitDb, safeErrorResponse } from "../_shared/middleware.ts";
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

async function computeDocumentHash(pdfUrl: string | null, fallbackData: any): Promise<string> {
  if (pdfUrl) {
    try {
      const pdfResponse = await fetch(pdfUrl);
      const pdfBuffer = await pdfResponse.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", pdfBuffer);
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
    } catch (e) {
      console.error("Error hashing PDF:", e);
    }
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(fallbackData || {}));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
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

    // Rate limit por IP (impede finalização em massa / varredura de tokens).
    if (!(await checkRateLimitDb(supabase, signerIp, { bucket: "signature-complete", maxRequests: 20, windowSeconds: 60 }))) {
      return errorResponse("Muitas solicitações. Aguarde um momento e tente novamente.", 429);
    }

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

    const originalPdfUrl: string | null = signature.generated_document?.pdf_url || null;
    const documentHash = await computeDocumentHash(originalPdfUrl, signature.generated_document?.filled_data || {});

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

    // Mark THIS signature as signed BEFORE stamping so the consolidated
    // stamp call (which reads ALL signatures) sees it as signed.
    await supabase
      .from("document_signatures")
      .update({
        status: "signed",
        signed_at: signedAt,
        signature_url: signatureUrl,
        metadata: {
          ...meta,
          document_hash: documentHash,
          verification_code: verificationCode,
          selfie_url: selfieUrl,
          signature_url: signatureUrl,
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

    // Pack public links show one review/signing flow, but each document still
    // needs its own signer row, evidence, stamped PDF and receipt. When the
    // signer is part of a pack submission, mirror the same signing act to the
    // matching signer on every sibling document from that submission.
    const { data: currentSigner } = meta.from_signer_id
      ? await supabase
        .from("document_signers")
        .select("id, order, signer_name, signer_email, signer_phone, signer_cpf, metadata")
        .eq("id", meta.from_signer_id)
        .maybeSingle()
      : await supabase
        .from("document_signers")
        .select("id, order, signer_name, signer_email, signer_phone, signer_cpf, metadata")
        .eq("signature_id", signature.id)
        .maybeSingle();

    const { data: currentDoc } = await supabase
      .from("generated_documents")
      .select("id, pack_id, submission_group")
      .eq("id", signature.generated_document_id)
      .maybeSingle();

    if (currentSigner && currentDoc?.pack_id && currentDoc?.submission_group) {
      const currentSignerMeta = (currentSigner.metadata || {}) as Record<string, any>;
      const packSignerKey = currentSignerMeta.pack_signer_key || null;

      const { data: siblingDocs } = await supabase
        .from("generated_documents")
        .select("id")
        .eq("pack_id", currentDoc.pack_id)
        .eq("submission_group", currentDoc.submission_group);

      const siblingDocIds = (siblingDocs || []).map((d: any) => d.id).filter((id: string) => id !== signature.generated_document_id);

      if (siblingDocIds.length > 0) {
        const { data: siblingSigners } = await supabase
          .from("document_signers")
          .select("id, generated_document_id, signature_token, signature_id, status, order, signer_name, signer_email, signer_phone, signer_cpf, metadata")
          .in("generated_document_id", siblingDocIds)
          .neq("status", "signed");

        const samePersonSigners = (siblingSigners || []).filter((s: any) => {
          const siblingMeta = (s.metadata || {}) as Record<string, any>;
          if (packSignerKey) return siblingMeta.pack_signer_key === packSignerKey;
          return Number(s.order || 0) === Number(currentSigner.order || 0);
        });

        for (const siblingSigner of samePersonSigners) {
          if (!siblingSigner.signature_token) continue;
          const siblingResolved = await resolveSignatureByToken(supabase, siblingSigner.signature_token);
          if (!siblingResolved || siblingResolved.status === "signed") continue;

          const { data: siblingSignature } = await supabase
            .from("document_signatures")
            .select("*, generated_document:generated_documents(id, name, pdf_url, filled_data)")
            .eq("id", siblingResolved.id)
            .maybeSingle();
          if (!siblingSignature) continue;

          const siblingMeta = (siblingSignature.metadata || {}) as Record<string, any>;
          const siblingOriginalPdfUrl: string | null = siblingSignature.generated_document?.pdf_url || null;
          const siblingDocumentHash = await computeDocumentHash(
            siblingOriginalPdfUrl,
            siblingSignature.generated_document?.filled_data || {},
          );
          const siblingVerificationCode = generateVerificationCode();

          await supabase.from("signature_evidence").insert({
            signature_id: siblingSignature.id,
            document_hash: siblingDocumentHash,
            signer_ip: signerIp,
            signer_device: signerUserAgent,
            selfie_url: selfieUrl,
            otp_verified_at: otpVerifiedAt,
            signed_at: signedAt,
            verification_code: siblingVerificationCode,
            geolocation: geolocation || null,
            original_pdf_url: siblingOriginalPdfUrl,
            metadata: {
              user_agent: signerUserAgent,
              browser: uaInfo.browser,
              os: uaInfo.os,
              device_type: uaInfo.deviceType,
              signature_method: selfieRequired ? "internal_advanced" : "internal_otp_only",
              law_reference: "MP 2.200-2/2001 + Lei 14.063/2020",
              require_selfie: selfieRequired,
              otp_channel: siblingMeta.otp_channel || meta.otp_channel || "email",
              otp_channels: siblingMeta.otp_channels || configuredChannels,
              pack_signed_from_signature_id: signature.id,
            },
          });

          await supabase
            .from("document_signatures")
            .update({
              status: "signed",
              signed_at: signedAt,
              signature_url: signatureUrl,
              metadata: {
                ...siblingMeta,
                document_hash: siblingDocumentHash,
                verification_code: siblingVerificationCode,
                selfie_url: selfieUrl,
                signature_url: signatureUrl,
                signer_ip: signerIp,
                signer_device: signerUserAgent,
                signer_browser: uaInfo.browser,
                signer_os: uaInfo.os,
                signer_device_type: uaInfo.deviceType,
                geolocation: geolocation || null,
                signing_method_detail: selfieRequired ? "internal_advanced_otp_selfie" : "internal_otp_only",
                pack_signed_from_signature_id: signature.id,
              },
            })
            .eq("id", siblingSignature.id);

          await markSignerSigned(supabase, siblingSignature.id, signedAt);

          if (siblingOriginalPdfUrl) {
            try {
              const stampResp = await fetch(`${SUPABASE_URL}/functions/v1/signature-stamp-pdf`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${SERVICE_KEY}`,
                },
                body: JSON.stringify({
                  signatureId: siblingSignature.id,
                  generatedDocumentId: siblingSignature.generated_document_id,
                  documentHash: siblingDocumentHash,
                  verificationCode: siblingVerificationCode,
                }),
              });
              if (!stampResp.ok) {
                console.error("sibling stamp-pdf failed:", await stampResp.text());
              } else {
                await stampResp.json().catch(() => null);
              }
            } catch (e) {
              console.error("Error stamping sibling PDF:", e);
            }
          }

          try {
            const siblingReceiptResp = await fetch(`${SUPABASE_URL}/functions/v1/signature-receipt`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SERVICE_KEY}`,
              },
              body: JSON.stringify({
                signatureId: siblingSignature.id,
                signerName: siblingSignature.signer_name,
                signerEmail: siblingSignature.signer_email,
                signerPhone: siblingSignature.signer_phone,
                signerCpf: siblingSignature.signer_cpf,
                documentName: siblingSignature.generated_document?.name,
                documentHash: siblingDocumentHash,
                verificationCode: siblingVerificationCode,
                selfieUrl,
                signatureUrl,
                signedAt,
                signerIp,
                signerDevice: signerUserAgent,
                signerBrowser: uaInfo.browser,
                signerOs: uaInfo.os,
                deviceType: uaInfo.deviceType,
                otpChannel: siblingMeta.otp_channel || meta.otp_channel || "email",
                geolocation,
              }),
            });
            if (!siblingReceiptResp.ok) {
              console.error("sibling receipt failed:", await siblingReceiptResp.text());
            }
          } catch (e) {
            console.error("Error generating sibling receipt:", e);
          }
        }
      }
    }

    const { count: pendingSigners } = await supabase
      .from("document_signers")
      .select("id", { count: "exact", head: true })
      .eq("generated_document_id", signature.generated_document_id)
      .neq("status", "signed");

    // Generate / regenerate the CONSOLIDATED stamped PDF for the document.
    // The stamp function reads ALL signers/signatures, so multiple signers
    // share the same final PDF (with pending ones shown faded).
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
            generatedDocumentId: signature.generated_document_id,
            documentHash,
            verificationCode,
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

    let packSignedDocuments: any[] = [];
    if (currentSigner && currentDoc?.pack_id && currentDoc?.submission_group) {
      try {
        const { data: packDocsForDownload } = await supabase
          .from("generated_documents")
          .select("id, name, signed_pdf_url")
          .eq("pack_id", currentDoc.pack_id)
          .eq("submission_group", currentDoc.submission_group)
          .order("created_at", { ascending: true });

        const packDocIds = (packDocsForDownload || []).map((doc: any) => doc.id);
        const { data: packSignersForDownload } = packDocIds.length > 0
          ? await supabase
            .from("document_signers")
            .select("generated_document_id, signature_id")
            .in("generated_document_id", packDocIds)
            .eq("order", currentSigner.order || 0)
          : { data: [] };

        const signatureIds = (packSignersForDownload || [])
          .map((signer: any) => signer.signature_id)
          .filter(Boolean);
        const { data: receipts } = signatureIds.length > 0
          ? await supabase
            .from("signature_evidence")
            .select("signature_id, receipt_pdf_url")
            .in("signature_id", signatureIds)
          : { data: [] };

        const signatureByDoc = new Map<string, string>();
        for (const signer of packSignersForDownload || []) {
          if (signer.signature_id) signatureByDoc.set(signer.generated_document_id, signer.signature_id);
        }
        const receiptBySignature = new Map<string, string>();
        for (const receipt of receipts || []) {
          if (receipt.receipt_pdf_url) receiptBySignature.set(receipt.signature_id, receipt.receipt_pdf_url);
        }

        packSignedDocuments = (packDocsForDownload || []).map((doc: any) => {
          const sigId = signatureByDoc.get(doc.id);
          return {
            id: doc.id,
            name: doc.name,
            signedPdfUrl: doc.signed_pdf_url || null,
            receiptPdfUrl: sigId ? (receiptBySignature.get(sigId) || null) : null,
          };
        });
      } catch (e) {
        console.error("Error loading pack signed documents:", e);
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
      packSignedDocuments,
    });
  } catch (error) {
    return safeErrorResponse(error, "signature-complete");
  }
});
