import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, getClientIp, checkRateLimitDb, safeErrorResponse } from "../_shared/middleware.ts";

function maskIp(ip: string | null | undefined): string {
  if (!ip) return "N/A";
  const parts = String(ip).split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  return "***";
}

function maskEmail(email: string | null | undefined): string {
  if (!email) return "N/A";
  const [u, d] = email.split("@");
  if (!d) return email;
  return `${u.substring(0, Math.min(2, u.length))}***@${d}`;
}

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "N/A";
  const s = String(phone);
  if (s.length < 4) return "***";
  return s.substring(0, 4) + "****" + s.substring(s.length - 2);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let code = url.searchParams.get("code") || url.searchParams.get("hash");

    if (!code && req.method === "POST") {
      try {
        const body = await req.json();
        code = body.code || body.hash;
      } catch {
        // ignore
      }
    }

    if (!code) {
      return errorResponse("Código ou hash é obrigatório", 400);
    }

    const supabase = createServiceClient();

    // Rate limit por IP (impede enumeração de códigos/hashes de verificação).
    const ip = getClientIp(req);
    if (!(await checkRateLimitDb(supabase, ip, { bucket: "signature-verify-public", maxRequests: 40, windowSeconds: 60 }))) {
      return errorResponse("Muitas solicitações. Aguarde um momento e tente novamente.", 429);
    }

    const trimmed = code.trim();

    // Try to find by verification_code first, then by document_hash
    let { data: evidence } = await supabase
      .from("signature_evidence")
      .select("*, signature:document_signatures(id, signer_name, signer_email, signer_phone, signing_method, signed_at, signed_pdf_url, generated_document:generated_documents(id, name))")
      .eq("verification_code", trimmed)
      .maybeSingle();

    if (!evidence) {
      const { data: byHash } = await supabase
        .from("signature_evidence")
        .select("*, signature:document_signatures(id, signer_name, signer_email, signer_phone, signing_method, signed_at, signed_pdf_url, generated_document:generated_documents(id, name))")
        .eq("document_hash", trimmed)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      evidence = byHash;
    }

    if (!evidence) {
      return jsonResponse({ found: false });
    }

    const sig = (evidence as any).signature;
    const meta = (evidence as any).metadata || {};

    return jsonResponse({
      found: true,
      verification_code: (evidence as any).verification_code,
      document: {
        name: sig?.generated_document?.name || "Documento",
        hash: (evidence as any).document_hash,
        signed_at: sig?.signed_at || (evidence as any).signed_at,
        signed_pdf_url: sig?.signed_pdf_url || null,
        receipt_pdf_url: (evidence as any).receipt_pdf_url || null,
      },
      signer: {
        name: sig?.signer_name || "N/A",
        email_masked: maskEmail(sig?.signer_email),
        phone_masked: maskPhone(sig?.signer_phone),
      },
      authentication: {
        method: meta.signature_method || sig?.signing_method || "internal",
        otp_channel: meta.otp_channel || "email",
        otp_channels: meta.otp_channels || [meta.otp_channel || "email"],
        ip_masked: maskIp((evidence as any).signer_ip),
        browser: meta.browser || null,
        os: meta.os || null,
        device_type: meta.device_type || null,
        has_selfie: !!(evidence as any).selfie_url,
        has_geolocation: !!(evidence as any).geolocation,
      },
      legal: {
        law_reference: meta.law_reference || "Lei 14.063/2020 + MP 2.200-2/2001",
      },
    });
  } catch (error) {
    return safeErrorResponse(error, "signature-verify-public");
  }
});
