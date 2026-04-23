import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, StandardFonts, rgb, degrees } from "https://esm.sh/pdf-lib@1.17.1";
import QRCode from "https://esm.sh/qrcode@1.5.3";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";

const PUBLIC_ORIGIN = "https://wizzybr.com";

// Sanitize text to safe WinAnsi (avoid pdf-lib encoding errors)
function safe(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

function maskIp(ip: string | null | undefined): string {
  if (!ip) return "N/A";
  const parts = String(ip).split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  return ip.substring(0, Math.min(8, ip.length)) + "...";
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars - 1) + "…";
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

async function embedImage(pdf: PDFDocument, bytes: Uint8Array | null) {
  if (!bytes) return null;
  try {
    return await pdf.embedPng(bytes);
  } catch {
    try {
      return await pdf.embedJpg(bytes);
    } catch (e) {
      console.error("embedImage failed:", e);
      return null;
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    } = await parseJsonBody<Record<string, any>>(req);

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
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const verifyUrl = `${PUBLIC_ORIGIN}/verificar/${verificationCode}`;
    const hashShort = (documentHash || "").substring(0, 12);

    // ============ 1. Add footer to all pages ============
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;

    pages.forEach((page, idx) => {
      const { width } = page.getSize();
      const footerY = 28; // ~1cm from bottom
      const footerColor = rgb(0.42, 0.42, 0.42); // #6b6b6b

      // Horizontal line
      page.drawLine({
        start: { x: 36, y: footerY + 14 },
        end: { x: width - 36, y: footerY + 14 },
        thickness: 0.5,
        color: footerColor,
      });

      const line1 = safe(`Documento assinado eletronicamente por ${signerName || "Signatario"}`);
      const line2 = safe(`Hash: ${hashShort} | Pagina ${idx + 1} de ${totalPages} | Verifique em ${PUBLIC_ORIGIN.replace("https://", "")}/verificar/${verificationCode}`);

      const maxWidth = width - 72;
      const fontSize = 7;

      // Truncate if needed
      let l1 = line1;
      while (helv.widthOfTextAtSize(l1, fontSize) > maxWidth && l1.length > 5) {
        l1 = l1.substring(0, l1.length - 2) + "…";
      }
      let l2 = line2;
      while (helv.widthOfTextAtSize(l2, fontSize) > maxWidth && l2.length > 5) {
        l2 = l2.substring(0, l2.length - 2) + "…";
      }

      page.drawText(l1, { x: 36, y: footerY + 5, size: fontSize, font: helv, color: footerColor });
      page.drawText(l2, { x: 36, y: footerY - 5, size: fontSize, font: helv, color: footerColor });
    });

    // ============ 2. Append signatures page ============
    const sigPage = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width: pw, height: ph } = sigPage.getSize();
    const margin = 40;
    let y = ph - margin;

    const dark = rgb(0.1, 0.1, 0.1);
    const muted = rgb(0.4, 0.4, 0.4);
    const accent = rgb(0.15, 0.39, 0.92); // primary blue
    const line = rgb(0.85, 0.85, 0.85);

    // Header
    sigPage.drawText("WIZZY", { x: margin, y, size: 18, font: helvBold, color: accent });
    sigPage.drawText("PAGINA DE ASSINATURAS", { x: pw - margin - helvBold.widthOfTextAtSize("PAGINA DE ASSINATURAS", 12), y: y + 3, size: 12, font: helvBold, color: dark });
    y -= 12;
    sigPage.drawText("Comprovante de assinatura eletronica avancada", { x: margin, y, size: 8, font: helv, color: muted });
    y -= 22;

    sigPage.drawLine({ start: { x: margin, y }, end: { x: pw - margin, y }, thickness: 1.5, color: dark });
    y -= 18;

    // Document info
    sigPage.drawText(safe(`Documento: ${documentName || "N/A"}`), { x: margin, y, size: 11, font: helvBold, color: dark });
    y -= 16;
    sigPage.drawText("Hash do documento original (SHA-256):", { x: margin, y, size: 9, font: helv, color: muted });
    y -= 12;
    // Hash in 2 lines if long
    const hashFull = documentHash || "N/A";
    const hashLine1 = hashFull.substring(0, 64);
    const hashLine2 = hashFull.substring(64);
    sigPage.drawText(safe(hashLine1), { x: margin, y, size: 8, font: helv, color: dark });
    if (hashLine2) {
      y -= 10;
      sigPage.drawText(safe(hashLine2), { x: margin, y, size: 8, font: helv, color: dark });
    }
    y -= 18;

    sigPage.drawLine({ start: { x: margin, y }, end: { x: pw - margin, y }, thickness: 0.5, color: line });
    y -= 16;

    // DADOS DO DOCUMENTO
    sigPage.drawText("DADOS DO DOCUMENTO", { x: margin, y, size: 9, font: helvBold, color: muted });
    y -= 14;
    const docLines = [
      `ID: ${signatureId}`,
      `Numero de paginas: ${totalPages}`,
      `Codigo de verificacao: ${verificationCode || "N/A"}`,
    ];
    for (const dl of docLines) {
      sigPage.drawText(safe(dl), { x: margin, y, size: 9, font: helv, color: dark });
      y -= 12;
    }
    y -= 6;

    sigPage.drawLine({ start: { x: margin, y }, end: { x: pw - margin, y }, thickness: 0.5, color: line });
    y -= 16;

    // SIGNATARIO
    sigPage.drawText("SIGNATARIO", { x: margin, y, size: 9, font: helvBold, color: muted });
    y -= 16;

    // Embed images side by side
    const selfieBytes = await fetchAsBytes(selfieUrl);
    const sigBytes = await fetchAsBytes(signatureImageUrl);
    const selfieImg = await embedImage(pdfDoc, selfieBytes);
    const sigImg = await embedImage(pdfDoc, sigBytes);

    const imgY = y - 80;
    const textX = margin;
    const imgsX = pw - margin - 180;

    // Signer text
    let ty = y;
    sigPage.drawText(safe(signerName || "Nome nao informado"), { x: textX, y: ty, size: 12, font: helvBold, color: dark });
    ty -= 14;
    if (signerCpf) {
      sigPage.drawText(safe(`CPF: ${signerCpf}`), { x: textX, y: ty, size: 9, font: helv, color: dark });
      ty -= 11;
    }
    if (signerEmail) {
      sigPage.drawText(safe(`E-mail: ${signerEmail}`), { x: textX, y: ty, size: 9, font: helv, color: dark });
      ty -= 11;
    }
    if (signerPhone) {
      sigPage.drawText(safe(`Telefone: ${signerPhone}`), { x: textX, y: ty, size: 9, font: helv, color: dark });
      ty -= 11;
    }

    // Images
    if (sigImg) {
      const sw = 80;
      const sh = (sigImg.height / sigImg.width) * sw;
      sigPage.drawImage(sigImg, { x: imgsX, y: imgY + (80 - sh) / 2, width: sw, height: Math.min(sh, 60) });
      sigPage.drawText("Assinatura", { x: imgsX, y: imgY - 10, size: 7, font: helv, color: muted });
    }
    if (selfieImg) {
      sigPage.drawImage(selfieImg, { x: imgsX + 90, y: imgY, width: 80, height: 80 });
      sigPage.drawText("Selfie", { x: imgsX + 90, y: imgY - 10, size: 7, font: helv, color: muted });
    }

    y = imgY - 28;

    // Authentication details
    const signedDate = signedAt ? new Date(signedAt) : new Date();
    const dateStr = signedDate.toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZone: "America/Sao_Paulo",
    });

    const channel = otpChannel === "whatsapp" ? "WhatsApp" : "E-mail";
    const authLines = [
      `Autenticado em: ${dateStr} (UTC-3)`,
      `Metodo: OTP via ${channel} + ${selfieImg ? "Selfie + " : ""}Assinatura manuscrita`,
      `IP: ${maskIp(signerIp)}`,
      `Dispositivo: ${signerBrowser || "?"} / ${signerOs || "?"} / ${deviceType || "?"}`,
    ];
    if (geolocation && geolocation.lat && geolocation.lng) {
      authLines.push(`Geolocalizacao: ${Number(geolocation.lat).toFixed(2)}, ${Number(geolocation.lng).toFixed(2)}`);
    }
    for (const al of authLines) {
      sigPage.drawText(safe(al), { x: margin, y, size: 9, font: helv, color: dark });
      y -= 12;
    }
    y -= 8;

    sigPage.drawLine({ start: { x: margin, y }, end: { x: pw - margin, y }, thickness: 0.5, color: line });
    y -= 16;

    // VALIDACAO JURIDICA
    sigPage.drawText("VALIDACAO JURIDICA", { x: margin, y, size: 9, font: helvBold, color: muted });
    y -= 14;
    const legalText = "Este documento foi assinado eletronicamente conforme MP 2.200-2/2001 (art. 10, paragrafo 2) e Lei 14.063/2020.";
    // wrap
    const words = legalText.split(" ");
    let curLine = "";
    const maxW = pw - 2 * margin;
    for (const w of words) {
      const test = curLine ? curLine + " " + w : w;
      if (helv.widthOfTextAtSize(test, 9) > maxW) {
        sigPage.drawText(safe(curLine), { x: margin, y, size: 9, font: helv, color: dark });
        y -= 11;
        curLine = w;
      } else {
        curLine = test;
      }
    }
    if (curLine) {
      sigPage.drawText(safe(curLine), { x: margin, y, size: 9, font: helv, color: dark });
      y -= 11;
    }
    y -= 12;

    // QR Code
    try {
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 220, margin: 1 });
      const qrBase64 = qrDataUrl.split(",")[1];
      const qrBytes = Uint8Array.from(atob(qrBase64), c => c.charCodeAt(0));
      const qrImg = await pdfDoc.embedPng(qrBytes);
      const qrSize = 90;
      sigPage.drawImage(qrImg, { x: margin, y: y - qrSize, width: qrSize, height: qrSize });

      sigPage.drawText("Para verificar a autenticidade,", { x: margin + qrSize + 14, y: y - 18, size: 9, font: helv, color: dark });
      sigPage.drawText("acesse:", { x: margin + qrSize + 14, y: y - 30, size: 9, font: helv, color: dark });
      sigPage.drawText(safe(verifyUrl), { x: margin + qrSize + 14, y: y - 46, size: 10, font: helvBold, color: accent });
      sigPage.drawText("ou escaneie o QR Code ao lado.", { x: margin + qrSize + 14, y: y - 64, size: 8, font: helv, color: muted });

      y -= qrSize + 10;
    } catch (e) {
      console.error("QR generation error:", e);
    }

    // Footer of signatures page (reserved for ICP-Brasil)
    sigPage.drawLine({ start: { x: margin, y: 60 }, end: { x: pw - margin, y: 60 }, thickness: 0.5, color: line });
    sigPage.drawText("Espaco reservado para futura camada de certificacao ICP-Brasil A1 - Wizzy LTDA", {
      x: margin, y: 48, size: 7, font: helv, color: muted,
    });
    sigPage.drawText(`ID assinatura: ${signatureId}`, { x: margin, y: 36, size: 7, font: helv, color: muted });

    // Save
    const stampedBytes = await pdfDoc.save();

    // Upload
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
