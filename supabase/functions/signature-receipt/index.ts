import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFImage } from "https://esm.sh/pdf-lib@1.17.1";
import QRCode from "https://esm.sh/qrcode@1.5.3";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";

const PUBLIC_ORIGIN = "https://wizzybr.com";
// Try full logo first, fallback to favicon
const LOGO_URLS = [
  "https://wizzybr.com/wizzy-logo-full.png",
  "https://wizzybr.com/favicon.png",
];

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

async function loadLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  for (const url of LOGO_URLS) {
    const bytes = await fetchAsBytes(url);
    const img = await embedImage(pdf, bytes);
    if (img) return img;
  }
  return null;
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

    // ZapSign-like palette (light, very clean)
    const dark = rgb(0.08, 0.09, 0.12);
    const text = rgb(0.20, 0.22, 0.25);
    const muted = rgb(0.45, 0.47, 0.52);
    const purple = rgb(0.55, 0.36, 0.96); // Wizzy
    const greenBg = rgb(0.86, 0.96, 0.89);
    const greenText = rgb(0.10, 0.55, 0.27);
    const cardBorder = rgb(0.88, 0.88, 0.91);
    const sectionLine = rgb(0.85, 0.86, 0.90);

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

    let y = ph - margin;

    // ===== HEADER (title left, logo right) =====
    page.drawText("Relatorio de Assinaturas", {
      x: margin, y: y - 16, size: 22, font: helvBold, color: dark,
    });
    page.drawText(safe("Datas e horarios em UTC-0300 ( America/Sao_Paulo)"), {
      x: margin, y: y - 32, size: 9, font: helv, color: muted,
    });
    page.drawText(safe(`Ultima atualizacao em ${nowFmt}`), {
      x: margin, y: y - 44, size: 9, font: helv, color: muted,
    });

    // Logo Wizzy (top right) - padrão ZapSign, maior
    const logoImg = await loadLogo(pdfDoc);
    if (logoImg) {
      const targetW = 170;
      const ratio = logoImg.height / logoImg.width;
      let finalW = targetW;
      let finalH = targetW * ratio;
      const maxH = 60;
      if (finalH > maxH) {
        finalH = maxH;
        finalW = maxH / ratio;
      }
      page.drawImage(logoImg, {
        x: pw - margin - finalW,
        y: y - finalH + 6,
        width: finalW,
        height: finalH,
      });
    } else {
      page.drawText("Wizzy", {
        x: pw - margin - 90, y: y - 28, size: 28, font: helvBold, color: purple,
      });
    }

    y -= 64;

    // ===== DOCUMENT CARD (with QR on the right) =====
    const docCardH = 124;
    page.drawRectangle({
      x: margin, y: y - docCardH, width: innerW, height: docCardH,
      borderColor: cardBorder, borderWidth: 1,
    });

    // QR code on the right (um pouco menor pra dar espaço ao hash)
    const verifyUrl = verificationCode
      ? `${PUBLIC_ORIGIN}/verificar/${verificationCode}`
      : `${PUBLIC_ORIGIN}/verificar/${signatureId}`;
    const qrSize = 78;
    try {
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 240, margin: 0 });
      const qrBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]), c => c.charCodeAt(0));
      const qrImg = await pdfDoc.embedPng(qrBytes);
      page.drawImage(qrImg, {
        x: pw - margin - qrSize - 12,
        y: y - docCardH + (docCardH - qrSize) / 2,
        width: qrSize, height: qrSize,
      });
    } catch (e) { console.error("QR error:", e); }

    const docTextX = margin + 14;
    const docTextRight = pw - margin - qrSize - 26; // boundary before QR
    const labelSize = 8.5;
    const valueSize = 8.5;
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

    // Hash com fonte adaptativa: tenta caber em 1 linha, senão quebra em 2
    const hashLabel = "Hash do documento original (SHA256):";
    page.drawText(safe(hashLabel), { x: docTextX, y: dy, size: labelSize, font: helvBold, color: dark });
    const hashLabelW = helvBold.widthOfTextAtSize(hashLabel, labelSize);
    const hashFull = documentHash || "N/A";
    const hashAvailFirstLine = docTextRight - docTextX - hashLabelW - 6;
    const hashAvailFullLine = docTextRight - docTextX;

    // Tenta encontrar fonte que caiba o hash inteiro na primeira linha
    let hashSize = valueSize;
    let hashFitsFirstLine = helv.widthOfTextAtSize(hashFull, hashSize) <= hashAvailFirstLine;
    while (!hashFitsFirstLine && hashSize > 6.5) {
      hashSize -= 0.5;
      hashFitsFirstLine = helv.widthOfTextAtSize(hashFull, hashSize) <= hashAvailFirstLine;
    }

    if (hashFitsFirstLine) {
      page.drawText(safe(hashFull), { x: docTextX + hashLabelW + 4, y: dy, size: hashSize, font: helv, color: text });
    } else {
      // Quebra em 2 linhas: parte 1 ao lado do label, parte 2 abaixo
      hashSize = valueSize;
      const half = Math.ceil(hashFull.length / 2);
      // Encontra ponto de corte que caiba na primeira linha (ao lado do label)
      let cut = half;
      while (cut > 8 && helv.widthOfTextAtSize(hashFull.slice(0, cut), hashSize) > hashAvailFirstLine) {
        cut -= 2;
      }
      const part1 = hashFull.slice(0, cut);
      const part2 = hashFull.slice(cut);
      page.drawText(safe(part1), { x: docTextX + hashLabelW + 4, y: dy, size: hashSize, font: helv, color: text });
      dy -= 11;
      page.drawText(safe(part2), { x: docTextX, y: dy, size: hashSize, font: helv, color: text });
    }

    y -= docCardH + 22;

    // ===== ASSINATURAS HEADING =====
    page.drawText("Assinaturas", { x: margin, y, size: 15, font: helvBold, color: dark });
    const countTxt = "1 de 1 Assinaturas";
    page.drawText(safe(countTxt), {
      x: pw - margin - helv.widthOfTextAtSize(countTxt, 9),
      y: y + 3, size: 9, font: helv, color: muted,
    });
    y -= 12;

    // ===== SIGNER CARD =====
    const cardH = 215;
    const cardY = y - cardH;
    page.drawRectangle({
      x: margin, y: cardY, width: innerW, height: cardH,
      borderColor: cardBorder, borderWidth: 1,
    });

    // Right column for signature image
    const rightColW = 170;
    const rightColX = pw - margin - rightColW - 4;

    // Vertical separator between data/right column
    page.drawLine({
      start: { x: rightColX - 8, y: cardY + 8 },
      end: { x: rightColX - 8, y: y - 8 },
      thickness: 0.5, color: sectionLine,
    });

    // ===== Top row: badges =====
    let bx = margin + 14;
    const badgeY = y - 22;

    // "Assinado" green pill
    const pillTxt = "Assinado";
    const pillTxtW = helv.widthOfTextAtSize(pillTxt, 9);
    const pillW = pillTxtW + 18;
    page.drawRectangle({ x: bx, y: badgeY - 4, width: pillW, height: 18, color: greenBg });
    page.drawText(pillTxt, { x: bx + 9, y: badgeY, size: 9, font: helv, color: greenText });
    bx += pillW + 8;

    // "via Wizzy" pill
    const viaTxt = "via Wizzy";
    const viaW = helv.widthOfTextAtSize(viaTxt, 9) + 26;
    page.drawRectangle({ x: bx, y: badgeY - 4, width: viaW, height: 18, color: rgb(0.95, 0.93, 1) });
    page.drawText("v", { x: bx + 7, y: badgeY, size: 10, font: helvBold, color: purple });
    page.drawText(viaTxt, { x: bx + 19, y: badgeY, size: 9, font: helv, color: purple });

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

    // ===== Right column: Assinatura label + image + signer =====
    page.drawText("Assinatura", { x: rightColX, y: y - 22, size: 9, font: helv, color: muted });

    const sigBytes = await fetchAsBytes(signatureUrl);
    const sigImg = await embedImage(pdfDoc, sigBytes);
    if (sigImg) {
      const sw = Math.min(rightColW - 8, 150);
      const sh = Math.min((sigImg.height / sigImg.width) * sw, 60);
      page.drawImage(sigImg, {
        x: rightColX, y: y - 86, width: sw, height: sh,
      });
    }
    page.drawText(safe(signerName || ""), {
      x: rightColX, y: y - 100, size: 9, font: helv, color: text,
    });

    // Selfie thumbnail (if any) - inside right column lower area
    const selfieBytes = await fetchAsBytes(selfieUrl);
    const selfieImg = await embedImage(pdfDoc, selfieBytes);
    if (selfieImg) {
      const ssize = 54;
      page.drawImage(selfieImg, {
        x: rightColX + rightColW - ssize - 4,
        y: cardY + 14,
        width: ssize, height: ssize,
      });
      page.drawText("Selfie", {
        x: rightColX + rightColW - ssize - 4, y: cardY + 6, size: 8, font: helv, color: muted,
      });
    }

    // ===== Bottom block (left col): Pontos de autenticacao + Localizacao =====
    const dataLeftMaxX = rightColX - 16;
    const colGap = 18;
    const colW = (dataLeftMaxX - (margin + 14) - colGap) / 2;
    const col1X = margin + 14;
    const col2X = col1X + colW + colGap;
    const blockTopY = cardY + 96;

    // Column 1: Pontos de autenticacao
    let c1y = blockTopY;
    page.drawText("Pontos de autenticacao:", {
      x: col1X, y: c1y, size: 10, font: helvBold, color: dark,
    });
    c1y -= 14;
    page.drawText(safe(`Telefone: ${signerPhone || "Nao informado"}`), {
      x: col1X, y: c1y, size: 9, font: helv, color: text,
    });
    c1y -= 12;
    // Email may be long: wrap
    const emailFull = `E-mail: ${signerEmail || "Nao informado"}`;
    const emailLines = wrapText(emailFull, helv, 9, colW);
    for (const l of emailLines.slice(0, 2)) {
      page.drawText(safe(l), { x: col1X, y: c1y, size: 9, font: helv, color: text });
      c1y -= 12;
    }
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

    // Column 2: Localizacao + IP + Dispositivo (full data, not cropped)
    let c2y = blockTopY;
    const geoTxt = (geolocation && geolocation.lat != null && geolocation.lng != null)
      ? `${Number(geolocation.lat).toFixed(6)}, ${Number(geolocation.lng).toFixed(6)}`
      : "Nao coletada";
    page.drawText(safe(`Localizacao aproximada: ${geoTxt}`), {
      x: col2X, y: c2y, size: 9, font: helv, color: text,
    });
    c2y -= 12;
    // IP FULL (no truncation)
    page.drawText(safe(`IP: ${signerIp || "Nao coletado"}`), {
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
    for (let i = 1; i < devLines.length && i < 4; i++) {
      c2y -= 11;
      page.drawText(safe(devLines[i]), {
        x: col2X, y: c2y, size: 9, font: helv, color: text,
      });
    }

    y = cardY - 18;

    // ===== Validacao juridica footer =====
    page.drawLine({
      start: { x: margin, y }, end: { x: pw - margin, y },
      thickness: 0.5, color: cardBorder,
    });
    y -= 14;

    page.drawText("VALIDACAO JURIDICA", { x: margin, y, size: 9, font: helvBold, color: purple });
    y -= 12;

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
