import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";
import { buildReceiptPdf, SignerEntry } from "../_shared/buildReceiptPdf.ts";
import { fetchBytesOrDownload } from "../_shared/storageDownload.ts";

const PUBLIC_ORIGIN = "https://wizzybr.com";

function safe(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await parseJsonBody<Record<string, any>>(req);
    const { signatureId, generatedDocumentId } = body;

    if (!signatureId && !generatedDocumentId) {
      return errorResponse("signatureId or generatedDocumentId is required", 400);
    }

    const supabase = createServiceClient();

    // 1) Resolve generated_document_id
    let docId: string | null = generatedDocumentId || null;
    let documentName: string | null = body.documentName || null;
    let originalPdfUrl: string | null = body.pdfUrl || null;
    let documentHash: string = body.documentHash || "";
    let verificationCode: string = body.verificationCode || "";
    let createdAt: string | null = null;

    if (signatureId) {
      const { data: sig } = await supabase
        .from("document_signatures")
        .select("id, generated_document_id, metadata, created_at, generated_document:generated_documents(id, name, pdf_url, created_at)")
        .eq("id", signatureId)
        .maybeSingle();
      if (sig) {
        docId = docId || sig.generated_document_id;
        documentName = documentName || (sig as any).generated_document?.name || null;
        originalPdfUrl = originalPdfUrl || (sig as any).generated_document?.pdf_url || null;
        documentHash = documentHash || (sig.metadata as any)?.document_hash || "";
        verificationCode = verificationCode || (sig.metadata as any)?.verification_code || "";
        createdAt = (sig as any).generated_document?.created_at || sig.created_at;
      }
    }

    if (!docId) return errorResponse("generated_document not found", 404);

    if (!originalPdfUrl || !documentName || !createdAt) {
      const { data: doc } = await supabase
        .from("generated_documents")
        .select("id, name, pdf_url, created_at")
        .eq("id", docId)
        .maybeSingle();
      if (doc) {
        documentName = documentName || doc.name;
        originalPdfUrl = originalPdfUrl || doc.pdf_url;
        createdAt = createdAt || doc.created_at;
      }
    }

    if (!originalPdfUrl) return errorResponse("Original PDF not available yet", 400);

    // 2) Compute hash from the ORIGINAL PDF (so it's stable across re-stamps)
    if (!documentHash) {
      try {
        const buf = await fetchBytesOrDownload(originalPdfUrl, supabase);
        if (buf) {
          const hashBuf = await crypto.subtle.digest("SHA-256", buf);
          documentHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
        }
      } catch (e) {
        console.error("hash error", e);
      }
    }

    // 3) Load ALL signers for this document (signed + pending)
    const { data: signersDb } = await supabase
      .from("document_signers")
      .select("id, signer_name, signer_email, signer_phone, signer_cpf, status, signed_at, signature_id, order")
      .eq("generated_document_id", docId)
      .order("order", { ascending: true });

    // Also bring legacy signatures that aren't tied to a document_signers row
    const { data: legacySigs } = await supabase
      .from("document_signatures")
      .select("id, signer_name, signer_email, signer_phone, signer_cpf, status, signed_at, signature_url, signed_pdf_url, metadata, created_at")
      .eq("generated_document_id", docId)
      .order("created_at", { ascending: true });

    // Build a map signature_id -> signature row
    const sigById = new Map<string, any>();
    (legacySigs || []).forEach((s: any) => sigById.set(s.id, s));

    const signers: SignerEntry[] = [];

    // From signers table (preferred when there are signer rows)
    if (signersDb && signersDb.length > 0) {
      for (const sn of signersDb as any[]) {
        const linked = sn.signature_id ? sigById.get(sn.signature_id) : null;
        const isSigned = sn.status === "signed";
        const meta = (linked?.metadata || {}) as any;
        signers.push({
          signatureId: linked?.id || sn.id,
          signerName: sn.signer_name,
          signerEmail: sn.signer_email,
          signerPhone: sn.signer_phone,
          signerCpf: sn.signer_cpf,
          status: isSigned ? "signed" : "pending",
          signedAt: sn.signed_at,
          signatureUrl: linked?.signature_url || meta.signature_url,
          selfieUrl: meta.selfie_url,
          signerIp: meta.signer_ip,
          signerBrowser: meta.signer_browser,
          signerOs: meta.signer_os,
          deviceType: meta.signer_device_type,
          otpChannel: meta.otp_channel,
          geolocation: meta.geolocation,
        });
        if (linked) sigById.delete(linked.id); // consumed
      }
    }
    // Append remaining legacy signatures (single-signer flow)
    for (const s of sigById.values()) {
      const meta = (s.metadata || {}) as any;
      signers.push({
        signatureId: s.id,
        signerName: s.signer_name,
        signerEmail: s.signer_email,
        signerPhone: s.signer_phone,
        signerCpf: s.signer_cpf,
        status: s.status === "signed" ? "signed" : "pending",
        signedAt: s.signed_at,
        signatureUrl: s.signature_url || meta.signature_url,
        selfieUrl: meta.selfie_url,
        signerIp: meta.signer_ip,
        signerBrowser: meta.signer_browser,
        signerOs: meta.signer_os,
        deviceType: meta.signer_device_type,
        otpChannel: meta.otp_channel,
        geolocation: meta.geolocation,
      });
    }

    if (signers.length === 0) {
      return errorResponse("No signers/signatures found", 400);
    }

    // Pick a verification code from a signed signature if not provided
    if (!verificationCode) {
      const firstSigned = (legacySigs || []).find((s: any) => (s.metadata as any)?.verification_code);
      verificationCode = (firstSigned?.metadata as any)?.verification_code || "";
    }

    // 4) Always start from ORIGINAL PDF (avoid stacking footers)
    const originalBytes = await fetchBytesOrDownload(originalPdfUrl, supabase);
    if (!originalBytes) return errorResponse("Could not load original PDF", 500);

    const pdfDoc = await PDFDocument.load(originalBytes);
    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const hashShort = (documentHash || "").substring(0, 12);
    const signedCount = signers.filter(s => s.status === "signed").length;

    // Compact footer (single line) — avoid clutter / overlap
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;
    pages.forEach((page, idx) => {
      const { width } = page.getSize();
      const footerY = 22;
      const footerColor = rgb(0.45, 0.45, 0.45);
      page.drawLine({
        start: { x: 36, y: footerY + 12 },
        end: { x: width - 36, y: footerY + 12 },
        thickness: 0.5, color: footerColor,
      });
      const verifyShort = verificationCode
        ? `${PUBLIC_ORIGIN.replace("https://", "")}/verificar/${verificationCode}`
        : "";
      const line = safe(`Assinado por ${signedCount}/${signers.length} signatario(s) | Hash ${hashShort} | Pag ${idx + 1}/${totalPages}${verifyShort ? ` | ${verifyShort}` : ""}`);
      const fontSize = 7;
      let l = line;
      const maxWidth = width - 72;
      while (helv.widthOfTextAtSize(l, fontSize) > maxWidth && l.length > 5) {
        l = l.substring(0, l.length - 2) + "...";
      }
      page.drawText(l, { x: 36, y: footerY + 2, size: fontSize, font: helv, color: footerColor });
    });

    // 5) Append CONSOLIDATED receipt (all signers in same report)
    try {
      const receiptBytes = await buildReceiptPdf({
        documentName,
        documentHash,
        verificationCode,
        createdAt,
        signers,
      }, supabase);
      const receiptDoc = await PDFDocument.load(receiptBytes);
      const copied = await pdfDoc.copyPages(receiptDoc, receiptDoc.getPageIndices());
      copied.forEach((p) => pdfDoc.addPage(p));
    } catch (e) {
      console.error("Failed to append receipt:", e);
    }

    const stampedBytes = await pdfDoc.save();
    const stampedFileName = `signatures/${docId}/signed_${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("contact-files")
      .upload(stampedFileName, stampedBytes, { contentType: "application/pdf", upsert: true });

    if (upErr) {
      console.error("Upload error:", upErr);
      return errorResponse("Erro ao salvar PDF assinado", 500);
    }

    const { data: { publicUrl: stampedUrl } } = supabase.storage
      .from("contact-files")
      .getPublicUrl(stampedFileName);

    // 6) Persist consolidated URL on the document AND on this signature
    const allSigned = signedCount === signers.length;
    await supabase.from("generated_documents").update({
      signed_pdf_url: stampedUrl,
      signing_status: allSigned ? "signed" : "partial",
      ...(allSigned ? { status: "signed", signed_at: new Date().toISOString() } : {}),
    }).eq("id", docId);

    if (signatureId) {
      await supabase.from("document_signatures").update({
        signed_pdf_url: stampedUrl,
      }).eq("id", signatureId);
    }
    // Propagate consolidated URL to ALL signatures of the document so any
    // signer who already signed can re-download the latest version.
    await supabase.from("document_signatures").update({
      signed_pdf_url: stampedUrl,
    }).eq("generated_document_id", docId);

    return jsonResponse({ success: true, signedPdfUrl: stampedUrl, allSigned, signedCount, totalSigners: signers.length });
  } catch (error: any) {
    console.error("signature-stamp-pdf error:", error);
    return errorResponse(error?.message || "Erro interno", 500);
  }
});
