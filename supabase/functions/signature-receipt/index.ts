import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import QRCode from "https://esm.sh/qrcode@1.5.3";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";

const PUBLIC_ORIGIN = "https://wizzybr.com";

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
  return "***";
}

async function fetchAsBytes(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

async function embedImage(pdf: PDFDocument, bytes: Uint8Array | null) {
  if (!bytes) return null;
  try { return await pdf.embedPng(bytes); } catch {
    try { return await pdf.embedJpg(bytes); } catch { return null; }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      signatureId,
      signerName,
      signerEmail,
      signerPhone,
      signerCpf,
      documentName,
      documentHash,
      verificationCode,
      selfieUrl,
      signatureUrl,
      signedAt,
      signerIp,
      signerBrowser,
      signerOs,
      deviceType,
      otpChannel,
      geolocation,
    } = await parseJsonBody<Record<string, any>>(req);

    if (!signatureId) {
      return errorResponse("signatureId is required", 400);
    }

    const supabase = createServiceClient();

    const pdfDoc = await PDFDocument.create();
    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width: pw, height: ph } = page.getSize();
    const margin = 40;
    let y = ph - margin;

    const dark = rgb(0.1, 0.1, 0.1);
    const muted = rgb(0.4, 0.4, 0.4);
    const accent = rgb(0.15, 0.39, 0.92);
    const line = rgb(0.85, 0.85, 0.85);

    // Header
    page.drawText("WIZZY", { x: margin, y, size: 18, font: helvBold, color: accent });
    const titleTxt = "COMPROVANTE DE ASSINATURA";
    page.drawText(titleTxt, { x: pw - margin - helvBold.widthOfTextAtSize(titleTxt, 12), y: y + 3, size: 12, font: helvBold, color: dark });
    y -= 12;
    page.drawText("Assinatura eletronica avancada - MP 2.200-2/2001 + Lei 14.063/2020", { x: margin, y, size: 8, font: helv, color: muted });
    y -= 22;

    page.drawLine({ start: { x: margin, y }, end: { x: pw - margin, y }, thickness: 1.5, color: dark });
    y -= 18;

    // Document
    page.drawText(safe(`Documento: ${documentName || "N/A"}`), { x: margin, y, size: 11, font: helvBold, color: dark });
    y -= 16;
    page.drawText("Hash SHA-256 do documento original:", { x: margin, y, size: 9, font: helv, color: muted });
    y -= 12;
    const hashFull = documentHash || "N/A";
    page.drawText(safe(hashFull.substring(0, 64)), { x: margin, y, size: 8, font: helv, color: dark });
    if (hashFull.length > 64) {
      y -= 10;
      page.drawText(safe(hashFull.substring(64)), { x: margin, y, size: 8, font: helv, color: dark });
    }
    y -= 18;

    page.drawLine({ start: { x: margin, y }, end: { x: pw - margin, y }, thickness: 0.5, color: line });
    y -= 16;

    // Signer
    page.drawText("SIGNATARIO", { x: margin, y, size: 9, font: helvBold, color: muted });
    y -= 16;

    const selfieBytes = await fetchAsBytes(selfieUrl);
    const sigBytes = await fetchAsBytes(signatureUrl);
    const selfieImg = await embedImage(pdfDoc, selfieBytes);
    const sigImg = await embedImage(pdfDoc, sigBytes);

    const imgsX = pw - margin - 180;
    const imgY = y - 80;

    let ty = y;
    page.drawText(safe(signerName || "Nome nao informado"), { x: margin, y: ty, size: 12, font: helvBold, color: dark });
    ty -= 14;
    if (signerCpf) { page.drawText(safe(`CPF: ${signerCpf}`), { x: margin, y: ty, size: 9, font: helv, color: dark }); ty -= 11; }
    if (signerEmail) { page.drawText(safe(`E-mail: ${signerEmail}`), { x: margin, y: ty, size: 9, font: helv, color: dark }); ty -= 11; }
    if (signerPhone) { page.drawText(safe(`Telefone: ${signerPhone}`), { x: margin, y: ty, size: 9, font: helv, color: dark }); ty -= 11; }

    if (sigImg) {
      const sw = 80;
      const sh = (sigImg.height / sigImg.width) * sw;
      page.drawImage(sigImg, { x: imgsX, y: imgY + (80 - Math.min(sh, 60)) / 2, width: sw, height: Math.min(sh, 60) });
      page.drawText("Assinatura", { x: imgsX, y: imgY - 10, size: 7, font: helv, color: muted });
    }
    if (selfieImg) {
      page.drawImage(selfieImg, { x: imgsX + 90, y: imgY, width: 80, height: 80 });
      page.drawText("Selfie", { x: imgsX + 90, y: imgY - 10, size: 7, font: helv, color: muted });
    }

    y = imgY - 28;

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
      page.drawText(safe(al), { x: margin, y, size: 9, font: helv, color: dark });
      y -= 12;
    }
    y -= 8;

    page.drawLine({ start: { x: margin, y }, end: { x: pw - margin, y }, thickness: 0.5, color: line });
    y -= 16;

    page.drawText("VALIDACAO JURIDICA", { x: margin, y, size: 9, font: helvBold, color: muted });
    y -= 14;
    const legalText = "Este documento foi assinado eletronicamente conforme MP 2.200-2/2001 (art. 10, paragrafo 2) e Lei 14.063/2020.";
    const words = legalText.split(" ");
    let curLine = "";
    const maxW = pw - 2 * margin;
    for (const w of words) {
      const test = curLine ? curLine + " " + w : w;
      if (helv.widthOfTextAtSize(test, 9) > maxW) {
        page.drawText(safe(curLine), { x: margin, y, size: 9, font: helv, color: dark });
        y -= 11;
        curLine = w;
      } else {
        curLine = test;
      }
    }
    if (curLine) {
      page.drawText(safe(curLine), { x: margin, y, size: 9, font: helv, color: dark });
      y -= 11;
    }
    y -= 12;

    // QR
    const verifyUrl = verificationCode ? `${PUBLIC_ORIGIN}/verificar/${verificationCode}` : `${PUBLIC_ORIGIN}/verificar/${signatureId}`;
    try {
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 220, margin: 1 });
      const qrBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]), c => c.charCodeAt(0));
      const qrImg = await pdfDoc.embedPng(qrBytes);
      const qrSize = 90;
      page.drawImage(qrImg, { x: margin, y: y - qrSize, width: qrSize, height: qrSize });

      page.drawText("Para verificar a autenticidade,", { x: margin + qrSize + 14, y: y - 18, size: 9, font: helv, color: dark });
      page.drawText("acesse:", { x: margin + qrSize + 14, y: y - 30, size: 9, font: helv, color: dark });
      page.drawText(safe(verifyUrl), { x: margin + qrSize + 14, y: y - 46, size: 10, font: helvBold, color: accent });
      page.drawText("ou escaneie o QR Code ao lado.", { x: margin + qrSize + 14, y: y - 64, size: 8, font: helv, color: muted });
    } catch (e) {
      console.error("QR error:", e);
    }

    page.drawLine({ start: { x: margin, y: 60 }, end: { x: pw - margin, y: 60 }, thickness: 0.5, color: line });
    page.drawText("Espaco reservado para futura camada de certificacao ICP-Brasil A1 - Wizzy LTDA", {
      x: margin, y: 48, size: 7, font: helv, color: muted,
    });
    page.drawText(`ID assinatura: ${signatureId}`, { x: margin, y: 36, size: 7, font: helv, color: muted });

    const pdfBytes = await pdfDoc.save();

    const receiptFileName = `signatures/${signatureId}/receipt_${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("contact-files")
      .upload(receiptFileName, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      console.error("Error uploading receipt:", uploadError);
      return errorResponse("Erro ao salvar comprovante", 500);
    }

    const { data: { publicUrl: receiptUrl } } = supabase.storage
      .from("contact-files")
      .getPublicUrl(receiptFileName);

    await supabase
      .from("signature_evidence")
      .update({ receipt_pdf_url: receiptUrl })
      .eq("signature_id", signatureId);

    return jsonResponse({ success: true, receiptUrl });
  } catch (error: any) {
    console.error("Error in signature-receipt:", error);
    return errorResponse(error?.message || "Erro interno", 500);
  }
});
