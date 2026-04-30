import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";
import { buildReceiptPdf } from "../_shared/buildReceiptPdf.ts";

const PUBLIC_ORIGIN = "https://wizzybr.com";

function safe(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

async function fetchAsBytes(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch (e) {
    console.error("fetchAsBytes error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await parseJsonBody<Record<string, any>>(req);
    const {
      signatureId,
      pdfUrl,
      signerName,
      signerEmail,
      signerPhone,
      signerCpf,
      documentName,
      documentHash,
      verificationCode,
      selfieUrl,
      signatureImageUrl,
      signedAt,
      signerIp,
      signerBrowser,
      signerOs,
      deviceType,
      otpChannel,
      geolocation,
      signerDevice,
    } = body;

    if (!signatureId || !pdfUrl) {
      return errorResponse("signatureId and pdfUrl are required", 400);
    }

    const supabase = createServiceClient();

    // Load original PDF
    const originalBytes = await fetchAsBytes(pdfUrl);
    if (!originalBytes) {
      return errorResponse("Could not load original PDF", 500);
    }

    const pdfDoc = await PDFDocument.load(originalBytes);
    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const hashShort = (documentHash || "").substring(0, 12);

    // ============ 1. Add small footer to all original pages ============
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;

    pages.forEach((page, idx) => {
      const { width } = page.getSize();
      const footerY = 28;
      const footerColor = rgb(0.42, 0.42, 0.42);

      page.drawLine({
        start: { x: 36, y: footerY + 14 },
        end: { x: width - 36, y: footerY + 14 },
        thickness: 0.5, color: footerColor,
      });

      const line1 = safe(`Documento assinado eletronicamente por ${signerName || "Signatario"}`);
      const line2 = safe(`Hash: ${hashShort} | Pagina ${idx + 1} de ${totalPages} | Verifique em ${PUBLIC_ORIGIN.replace("https://", "")}/verificar/${verificationCode}`);

      const maxWidth = width - 72;
      const fontSize = 7;

      let l1 = line1;
      while (helv.widthOfTextAtSize(l1, fontSize) > maxWidth && l1.length > 5) {
        l1 = l1.substring(0, l1.length - 2) + "...";
      }
      let l2 = line2;
      while (helv.widthOfTextAtSize(l2, fontSize) > maxWidth && l2.length > 5) {
        l2 = l2.substring(0, l2.length - 2) + "...";
      }

      page.drawText(l1, { x: 36, y: footerY + 5, size: fontSize, font: helv, color: footerColor });
      page.drawText(l2, { x: 36, y: footerY - 5, size: fontSize, font: helv, color: footerColor });
    });

    // ============ 2. Append the new receipt PDF (same layout as standalone) ============
    try {
      const receiptBytes = await buildReceiptPdf({
        signatureId,
        signerName,
        signerEmail,
        signerPhone,
        signerCpf,
        documentName,
        documentHash,
        verificationCode,
        selfieUrl,
        signatureUrl: signatureImageUrl,
        signedAt,
        signerIp,
        signerBrowser,
        signerOs,
        deviceType,
        signerDevice,
        otpChannel,
        geolocation,
        createdAt: body.createdAt || signedAt,
      });
      const receiptDoc = await PDFDocument.load(receiptBytes);
      const copied = await pdfDoc.copyPages(receiptDoc, receiptDoc.getPageIndices());
      copied.forEach((p) => pdfDoc.addPage(p));
    } catch (e) {
      console.error("Failed to append receipt to signed PDF:", e);
    }

    // Save
    const stampedBytes = await pdfDoc.save();

    const stampedFileName = `signatures/${signatureId}/signed_${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("contact-files")
      .upload(stampedFileName, stampedBytes, { contentType: "application/pdf", upsert: true });

    if (upErr) {
      console.error("Upload stamped error:", upErr);
      return errorResponse("Erro ao salvar PDF assinado", 500);
    }

    const { data: { publicUrl: stampedUrl } } = supabase.storage
      .from("contact-files")
      .getPublicUrl(stampedFileName);

    return jsonResponse({ success: true, signedPdfUrl: stampedUrl });
  } catch (error: any) {
    console.error("signature-stamp-pdf error:", error);
    return errorResponse(error?.message || "Erro interno", 500);
  }
});
