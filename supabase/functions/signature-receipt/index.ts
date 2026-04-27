import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, StandardFonts, rgb, PDFFont } from "https://esm.sh/pdf-lib@1.17.1";
import QRCode from "https://esm.sh/qrcode@1.5.3";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";

const PUBLIC_ORIGIN = "https://wizzybr.com";
const LOGO_URL = "https://wizzybr.com/favicon.png";

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

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text).split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
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
      signerDevice,
      otpChannel,
      geolocation,
      createdAt,
    } = await parseJsonBody<Record<string, any>>(req);

    if (!signatureId) {
      return errorResponse("signatureId is required", 400);
    }

    const supabase = createServiceClient();

    // Fetch signature creation date if not provided
    let docCreatedAt = createdAt;
    if (!docCreatedAt) {
      const { data: sigRow } = await supabase
        .from("document_signatures")
        .select("created_at, generated_document:generated_documents(created_at)")
        .eq("id", signatureId)
        .maybeSingle();
      docCreatedAt =
        (sigRow as any)?.generated_document?.created_at ||
        (sigRow as any)?.created_at ||
        signedAt;
    }

    const pdfDoc = await PDFDocument.create();
    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width: pw, height: ph } = page.getSize();
    const margin = 36;
    const innerW = pw - 2 * margin;
    let y = ph - margin;

    // ZapSign-like palette
    const dark = rgb(0.13, 0.13, 0.13);
    const text = rgb(0.2, 0.2, 0.22);
    const muted = rgb(0.45, 0.45, 0.5);
    const purple = rgb(0.55, 0.36, 0.96); // Wizzy purple
    const greenBg = rgb(0.85, 0.96, 0.88);
    const greenText = rgb(0.13, 0.55, 0.27);
    const cardBg = rgb(1, 1, 1);
    const cardBorder = rgb(0.88, 0.88, 0.9);
    const cardHeaderBg = rgb(0.97, 0.97, 0.98);

    const dateFmt = (iso: string | null | undefined) => {
      if (!iso) return "N/A";
      const d = new Date(iso);
      return d.toLocaleString("pt-BR", {
        day: "2-digit", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        timeZone: "America/Sao_Paulo",
      });
    };

    const nowFmt = new Date().toLocaleString("pt-BR", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZone: "America/Sao_Paulo",
    });

    // ===== HEADER =====
    page.drawText("Relatório de Assinaturas", {
      x: margin, y: y - 14, size: 20, font: helvBold, color: dark,
    });
    page.drawText(safe("Datas e horarios em UTC-0300 ( America/Sao_Paulo)"), {
      x: margin, y: y - 30, size: 9, font: helv, color: muted,
    });
    page.drawText(safe(`Ultima atualizacao em ${nowFmt}`), {
      x: margin, y: y - 42, size: 9, font: helv, color: muted,
    });

    // Wizzy Logo (top right)
    const logoBytes = await fetchAsBytes(LOGO_URL);
    const logoImg = await embedImage(pdfDoc, logoBytes);
    if (logoImg) {
      const lh = 36;
      const lw = (logoImg.width / logoImg.height) * lh;
      const maxLw = 110;
      const finalLw = Math.min(lw, maxLw);
      const finalLh = (logoImg.height / logoImg.width) * finalLw;
      page.drawImage(logoImg, {
        x: pw - margin - finalLw,
        y: y - finalLh,
        width: finalLw,
        height: finalLh,
      });
      page.drawText("Wizzy", {
        x: pw - margin - finalLw - 56,
        y: y - 22,
        size: 18,
        font: helvBold,
        color: purple,
      });
    } else {
      page.drawText("Wizzy", {
        x: pw - margin - 60, y: y - 22, size: 22, font: helvBold, color: purple,
      });
    }

    y -= 70;

    // ===== DOCUMENT CARD =====
    const docCardH = 110;
    page.drawRectangle({
      x: margin, y: y - docCardH, width: innerW, height: docCardH,
      color: cardBg, borderColor: cardBorder, borderWidth: 1,
    });

    // QR code on the right
    const verifyUrl = verificationCode
      ? `${PUBLIC_ORIGIN}/verificar/${verificationCode}`
      : `${PUBLIC_ORIGIN}/verificar/${signatureId}`;
    try {
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 240, margin: 0 });
      const qrBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]), c => c.charCodeAt(0));
      const qrImg = await pdfDoc.embedPng(qrBytes);
      const qrSize = 80;
      page.drawImage(qrImg, {
        x: pw - margin - qrSize - 12,
        y: y - docCardH + (docCardH - qrSize) / 2,
        width: qrSize, height: qrSize,
      });
    } catch (e) { console.error("QR error:", e); }

    const docTextX = margin + 14;
    const labelSize = 9;
    const valueSize = 9;
    let dy = y - 18;

    const drawKV = (label: string, value: string) => {
      const lblW = helvBold.widthOfTextAtSize(label, labelSize);
      page.drawText(safe(label), { x: docTextX, y: dy, size: labelSize, font: helvBold, color: dark });
      page.drawText(safe(value), { x: docTextX + lblW + 4, y: dy, size: valueSize, font: helv, color: text });
      dy -= 13;
    };

    drawKV("Status:", "Assinado");
    drawKV("Documento:", documentName || "N/A");
    drawKV("Numero:", signatureId);
    drawKV("Data da criacao:", dateFmt(docCreatedAt));
    // Hash can be long - render label then wrapped value below
    const hashLabel = "Hash do documento original (SHA256):";
    page.drawText(safe(hashLabel), { x: docTextX, y: dy, size: labelSize, font: helvBold, color: dark });
    const hashLabelW = helvBold.widthOfTextAtSize(hashLabel, labelSize);
    const hashAvail = innerW - hashLabelW - 28 - 100; // leave room for QR
    const hashFull = documentHash || "N/A";
    const hashLines = wrapText(hashFull, helv, valueSize, hashAvail);
    page.drawText(safe(hashLines[0] || ""), { x: docTextX + hashLabelW + 4, y: dy, size: valueSize, font: helv, color: text });
    if (hashLines[1]) {
      dy -= 11;
      page.drawText(safe(hashLines[1]), { x: docTextX, y: dy, size: valueSize, font: helv, color: text });
    }

    y -= docCardH + 22;

    // ===== ASSINATURAS HEADING =====
    page.drawText("Assinaturas", { x: margin, y, size: 14, font: helvBold, color: dark });
    const countTxt = "1 de 1 Assinaturas";
    page.drawText(safe(countTxt), {
      x: pw - margin - helv.widthOfTextAtSize(countTxt, 9),
      y: y + 3, size: 9, font: helv, color: muted,
    });
    y -= 14;

    // ===== SIGNER CARD =====
    const cardH = 200;
    const cardY = y - cardH;
    page.drawRectangle({
      x: margin, y: cardY, width: innerW, height: cardH,
      color: cardBg, borderColor: cardBorder, borderWidth: 1,
    });

    // Status badges row
    let bx = margin + 14;
    const badgeY = y - 22;

    // "Assinado" green pill
    const pillTxt = "Assinado";
    const pillTxtW = helv.widthOfTextAtSize(pillTxt, 9);
    const pillW = pillTxtW + 18;
    page.drawRectangle({ x: bx, y: badgeY - 4, width: pillW, height: 18, color: greenBg });
    page.drawText(pillTxt, { x: bx + 9, y: badgeY, size: 9, font: helv, color: greenText });
    bx += pillW + 10;

    // "via Wizzy" pill (with check)
    const viaTxt = "via Wizzy";
    const viaTxtW = helv.widthOfTextAtSize(viaTxt, 9);
    const viaW = viaTxtW + 26;
    page.drawText("✓", { x: bx + 6, y: badgeY, size: 10, font: helvBold, color: purple });
    page.drawText(viaTxt, { x: bx + 18, y: badgeY, size: 9, font: helv, color: text });

    // Right column: "Assinatura" label + image
    const rightColX = margin + innerW - 170;
    page.drawText("Assinatura", { x: rightColX, y: y - 22, size: 9, font: helv, color: muted });

    const sigBytes = await fetchAsBytes(signatureUrl);
    const sigImg = await embedImage(pdfDoc, sigBytes);
    if (sigImg) {
      const sw = 130;
      const sh = Math.min((sigImg.height / sigImg.width) * sw, 50);
      page.drawImage(sigImg, {
        x: rightColX, y: y - 80, width: sw, height: sh,
      });
    }
    page.drawText(safe(signerName || "N/A"), {
      x: rightColX, y: y - 95, size: 9, font: helv, color: text,
    });

    // Signer name (large)
    let ly = badgeY - 22;
    page.drawText(safe((signerName || "Nome nao informado").toUpperCase()), {
      x: margin + 14, y: ly, size: 13, font: helvBold, color: dark,
    });
    ly -= 16;

    page.drawText(safe(`Data e hora da assinatura: ${dateFmt(signedAt)}`), {
      x: margin + 14, y: ly, size: 9, font: helv, color: text,
    });
    ly -= 12;
    page.drawText(safe(`Token: ${signatureId}`), {
      x: margin + 14, y: ly, size: 9, font: helv, color: text,
    });
    ly -= 18;

    // Selfie thumbnail (if any) - small inline
    const selfieBytes = await fetchAsBytes(selfieUrl);
    const selfieImg = await embedImage(pdfDoc, selfieBytes);

    // ===== Bottom section of signer card: 2 columns =====
    const bottomY = cardY + 14;
    const colGap = 20;
    const colW = (innerW - 28 - colGap) / 2;
    const col1X = margin + 14;
    const col2X = col1X + colW + colGap;

    // Column 1: Pontos de autenticacao
    let c1y = bottomY + 78;
    page.drawText("Pontos de autenticacao:", {
      x: col1X, y: c1y, size: 10, font: helvBold, color: dark,
    });
    c1y -= 14;
    page.drawText(safe(`Telefone: ${signerPhone || "N/A"}`), {
      x: col1X, y: c1y, size: 9, font: helv, color: text,
    });
    c1y -= 12;
    page.drawText(safe(`E-mail: ${signerEmail || "N/A"}`), {
      x: col1X, y: c1y, size: 9, font: helv, color: text,
    });
    c1y -= 12;
    if (signerCpf) {
      page.drawText(safe(`CPF: ${signerCpf}`), {
        x: col1X, y: c1y, size: 9, font: helv, color: text,
      });
      c1y -= 12;
    }
    const channel = otpChannel === "whatsapp" ? "WhatsApp"
      : otpChannel === "sms" ? "SMS" : "E-mail";
    page.drawText(safe(`Canal OTP: ${channel}`), {
      x: col1X, y: c1y, size: 9, font: helv, color: text,
    });

    // Column 2: Localizacao + IP + Dispositivo
    let c2y = bottomY + 78;
    const geoTxt = (geolocation && geolocation.lat && geolocation.lng)
      ? `${Number(geolocation.lat).toFixed(6)}, ${Number(geolocation.lng).toFixed(6)}`
      : "Nao coletada";
    page.drawText(safe(`Localizacao aproximada: ${geoTxt}`), {
      x: col2X, y: c2y, size: 9, font: helv, color: text,
    });
    c2y -= 12;
    page.drawText(safe(`IP: ${signerIp || "N/A"}`), {
      x: col2X, y: c2y, size: 9, font: helv, color: text,
    });
    c2y -= 12;

    const deviceFull = signerDevice
      || `${signerBrowser || "?"} / ${signerOs || "?"} / ${deviceType || "?"}`;
    const devLabel = "Dispositivo: ";
    page.drawText(devLabel, { x: col2X, y: c2y, size: 9, font: helv, color: text });
    const devLabelW = helv.widthOfTextAtSize(devLabel, 9);
    const devLines = wrapText(deviceFull, helv, 9, colW - devLabelW);
    if (devLines[0]) {
      page.drawText(safe(devLines[0]), {
        x: col2X + devLabelW, y: c2y, size: 9, font: helv, color: text,
      });
    }
    for (let i = 1; i < devLines.length && i < 3; i++) {
      c2y -= 11;
      page.drawText(safe(devLines[i]), {
        x: col2X, y: c2y, size: 9, font: helv, color: text,
      });
    }

    // Optional selfie thumbnail (top-right corner of bottom area)
    if (selfieImg) {
      page.drawImage(selfieImg, {
        x: rightColX + 90, y: bottomY + 4, width: 36, height: 36,
      });
      page.drawText("Selfie", {
        x: rightColX + 90, y: bottomY - 6, size: 7, font: helv, color: muted,
      });
    }

    y = cardY - 18;

    // ===== Validacao juridica footer =====
    page.drawLine({
      start: { x: margin, y }, end: { x: pw - margin, y },
      thickness: 0.5, color: cardBorder,
    });
    y -= 14;

    const legalText =
      "Este documento foi assinado eletronicamente conforme MP 2.200-2/2001 (art. 10, paragrafo 2) e Lei 14.063/2020. " +
      "Para verificar a autenticidade, acesse: " + verifyUrl;
    const legalLines = wrapText(legalText, helv, 8, innerW);
    for (const l of legalLines) {
      page.drawText(safe(l), { x: margin, y, size: 8, font: helv, color: muted });
      y -= 10;
    }

    // Footer brand line
    page.drawText(safe(`ID assinatura: ${signatureId}  |  Wizzy - wizzybr.com`), {
      x: margin, y: 32, size: 7, font: helv, color: muted,
    });

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
