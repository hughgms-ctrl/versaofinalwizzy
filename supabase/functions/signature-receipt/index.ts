import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFImage } from "https://esm.sh/pdf-lib@1.17.1";
import QRCode from "https://esm.sh/qrcode@1.5.3";
import { corsHeaders, jsonResponse, errorResponse, createServiceClient, parseJsonBody } from "../_shared/middleware.ts";

const PUBLIC_ORIGIN = "https://wizzybr.com";
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
  // Quebra preservando palavras; se uma palavra é maior que maxWidth, quebra dentro dela
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    let word = w;
    // Se a palavra sozinha excede a largura, quebra por caracteres
    while (font.widthOfTextAtSize(word, size) > maxWidth && word.length > 1) {
      let cut = word.length;
      while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > maxWidth) cut--;
      const head = word.slice(0, cut);
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(head);
      word = word.slice(cut);
    }
    const test = cur ? cur + " " + word : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth) {
      if (cur) lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Build a single A4 page with the receipt and return a fresh PDFDocument.
 * Used both for standalone download and for appending into the signed PDF.
 */
export async function buildReceiptPdf(input: Record<string, any>): Promise<Uint8Array> {
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
  } = input;

  const pdfDoc = await PDFDocument.create();
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width: pw, height: ph } = page.getSize();
  const margin = 36;
  const innerW = pw - 2 * margin;

  // Palette
  const dark = rgb(0.08, 0.09, 0.12);
  const text = rgb(0.20, 0.22, 0.25);
  const muted = rgb(0.45, 0.47, 0.52);
  const purple = rgb(0.55, 0.36, 0.96);
  const greenBg = rgb(0.86, 0.96, 0.89);
  const greenText = rgb(0.10, 0.55, 0.27);
  const greenSolid = rgb(0.16, 0.65, 0.34);
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

  // ===== HEADER =====
  page.drawText("Relatorio de Assinaturas", {
    x: margin, y: y - 16, size: 22, font: helvBold, color: dark,
  });
  page.drawText(safe("Datas e horarios em UTC-0300 ( America/Sao_Paulo)"), {
    x: margin, y: y - 32, size: 9, font: helv, color: muted,
  });
  page.drawText(safe(`Ultima atualizacao em ${nowFmt}`), {
    x: margin, y: y - 44, size: 9, font: helv, color: muted,
  });

  // Logo (top right)
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
      width: finalW, height: finalH,
    });
  } else {
    page.drawText("Wizzy", {
      x: pw - margin - 90, y: y - 28, size: 28, font: helvBold, color: purple,
    });
  }

  y -= 64;

  // ===== DOCUMENT CARD (no QR here — QR moved to bottom) =====
  const docCardH = 110;
  page.drawRectangle({
    x: margin, y: y - docCardH, width: innerW, height: docCardH,
    borderColor: cardBorder, borderWidth: 1,
  });

  const docTextX = margin + 14;
  const docTextRight = pw - margin - 14;
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
  drawKV("Numero:", signatureId || "N/A");
  drawKV("Data da criacao:", dateFmt(createdAt));

  // Hash em linha cheia (sem QR ao lado, há espaço)
  const hashLabel = "Hash do documento original (SHA256):";
  page.drawText(safe(hashLabel), { x: docTextX, y: dy, size: labelSize, font: helvBold, color: dark });
  const hashLabelW = helvBold.widthOfTextAtSize(hashLabel, labelSize);
  const hashFull = documentHash || "N/A";
  const availFirst = docTextRight - docTextX - hashLabelW - 6;
  let hashSize = valueSize;
  if (helv.widthOfTextAtSize(hashFull, hashSize) <= availFirst) {
    page.drawText(safe(hashFull), { x: docTextX + hashLabelW + 4, y: dy, size: hashSize, font: helv, color: text });
  } else {
    // Quebra em 2 linhas
    let cut = hashFull.length;
    while (cut > 8 && helv.widthOfTextAtSize(hashFull.slice(0, cut), hashSize) > availFirst) cut--;
    page.drawText(safe(hashFull.slice(0, cut)), { x: docTextX + hashLabelW + 4, y: dy, size: hashSize, font: helv, color: text });
    dy -= 11;
    page.drawText(safe(hashFull.slice(cut)), { x: docTextX, y: dy, size: hashSize, font: helv, color: text });
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
  const cardH = 320;
  const cardY = y - cardH;
  page.drawRectangle({
    x: margin, y: cardY, width: innerW, height: cardH,
    borderColor: cardBorder, borderWidth: 1,
  });

  // Right column for signature/selfie
  const rightColW = 170;
  const rightColX = pw - margin - rightColW - 4;
  const rightColCenterX = rightColX + rightColW / 2;

  // Vertical separator
  page.drawLine({
    start: { x: rightColX - 8, y: cardY + 8 },
    end: { x: rightColX - 8, y: y - 8 },
    thickness: 0.5, color: sectionLine,
  });

  // ===== Top row: badges (all green: "Assinado" + "via Wizzy Sign") =====
  let bx = margin + 14;
  const badgeY = y - 22;

  const pillTxt = "Assinado";
  const pillTxtW = helv.widthOfTextAtSize(pillTxt, 9);
  const pillW = pillTxtW + 18;
  page.drawRectangle({ x: bx, y: badgeY - 4, width: pillW, height: 18, color: greenBg });
  page.drawText(pillTxt, { x: bx + 9, y: badgeY, size: 9, font: helv, color: greenText });
  bx += pillW + 8;

  // "via Wizzy Sign" — agora todo verde
  const viaTxt = "via Wizzy Sign";
  const viaTxtW = helv.widthOfTextAtSize(viaTxt, 9);
  const viaW = viaTxtW + 28;
  page.drawRectangle({ x: bx, y: badgeY - 4, width: viaW, height: 18, color: greenBg });
  // círculo verde sólido com check
  page.drawCircle({ x: bx + 9, y: badgeY + 4, size: 5.5, color: greenSolid });
  page.drawText("v", { x: bx + 6.5, y: badgeY + 1.5, size: 7.5, font: helvBold, color: rgb(1, 1, 1) });
  page.drawText(viaTxt, { x: bx + 19, y: badgeY, size: 9, font: helv, color: greenText });

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
  page.drawText(safe(`Token: ${signatureId || "N/A"}`), {
    x: margin + 14, y: ly, size: 9, font: helv, color: text,
  });
  ly -= 18;

  // ===== PONTOS DE AUTENTICACAO =====
  const dataLeftMaxX = rightColX - 16;
  const dataColW = dataLeftMaxX - (margin + 14);
  const colX = margin + 14;

  page.drawText("Pontos de autenticacao:", {
    x: colX, y: ly, size: 10, font: helvBold, color: dark,
  });
  ly -= 14;
  page.drawText(safe(`Telefone: ${signerPhone || "Nao informado"}`), {
    x: colX, y: ly, size: 9, font: helv, color: text,
  });
  ly -= 12;
  const emailLines = wrapText(`E-mail: ${signerEmail || "Nao informado"}`, helv, 9, dataColW);
  for (const l of emailLines.slice(0, 2)) {
    page.drawText(safe(l), { x: colX, y: ly, size: 9, font: helv, color: text });
    ly -= 12;
  }
  if (signerCpf) {
    page.drawText(safe(`CPF: ${signerCpf}`), { x: colX, y: ly, size: 9, font: helv, color: text });
    ly -= 12;
  }
  const channel = otpChannel === "whatsapp" ? "WhatsApp"
    : otpChannel === "sms" ? "SMS" : "E-mail";
  page.drawText(safe(`Canal OTP: ${channel}`), { x: colX, y: ly, size: 9, font: helv, color: text });
  ly -= 18;

  // ===== DADOS COLETADOS (separator + heading) =====
  page.drawLine({
    start: { x: colX, y: ly + 8 },
    end: { x: dataLeftMaxX, y: ly + 8 },
    thickness: 0.5, color: sectionLine,
  });
  page.drawText("Dados coletados:", {
    x: colX, y: ly, size: 10, font: helvBold, color: dark,
  });
  ly -= 14;

  // Geolocalização
  const geoTxt = (geolocation && geolocation.lat != null && geolocation.lng != null)
    ? `${Number(geolocation.lat).toFixed(6)}, ${Number(geolocation.lng).toFixed(6)}`
    : "Nao coletada";
  page.drawText(safe(`Coordenada geografica: ${geoTxt}`), {
    x: colX, y: ly, size: 9, font: helv, color: text,
  });
  ly -= 12;

  // IP completo
  page.drawText(safe(`IP: ${signerIp || "Nao coletado"}`), {
    x: colX, y: ly, size: 9, font: helv, color: text,
  });
  ly -= 12;

  // Dispositivo: usa user-agent COMPLETO (real). Quebra em várias linhas se preciso.
  const deviceFull = signerDevice && signerDevice.length > 5
    ? signerDevice
    : `${signerBrowser || "Desconhecido"} / ${signerOs || "Desconhecido"} / ${deviceType || "desktop"}`;
  const devLabel = "Dispositivo: ";
  page.drawText(devLabel, { x: colX, y: ly, size: 9, font: helvBold, color: dark });
  const devLabelW = helvBold.widthOfTextAtSize(devLabel, 9);
  // Primeira linha alinhada ao label
  const firstLineAvail = dataColW - devLabelW;
  const restAvail = dataColW;
  // Tenta caber tudo em 1 linha; senão, quebra
  if (helv.widthOfTextAtSize(deviceFull, 9) <= firstLineAvail) {
    page.drawText(safe(deviceFull), { x: colX + devLabelW, y: ly, size: 9, font: helv, color: text });
  } else {
    // Quebra inteligente: primeira linha cabe firstLineAvail, demais cabem restAvail
    let remaining = deviceFull;
    let cut = remaining.length;
    while (cut > 1 && helv.widthOfTextAtSize(remaining.slice(0, cut), 9) > firstLineAvail) cut--;
    page.drawText(safe(remaining.slice(0, cut)), { x: colX + devLabelW, y: ly, size: 9, font: helv, color: text });
    remaining = remaining.slice(cut);
    let lineCount = 1;
    while (remaining && lineCount < 5) {
      ly -= 11;
      lineCount++;
      let c = remaining.length;
      while (c > 1 && helv.widthOfTextAtSize(remaining.slice(0, c), 9) > restAvail) c--;
      page.drawText(safe(remaining.slice(0, c)), { x: colX, y: ly, size: 9, font: helv, color: text });
      remaining = remaining.slice(c);
    }
  }

  // ===== Right column: Assinatura + Selfie =====
  // Assinatura no topo
  const sigLabel = "Assinatura";
  const sigLabelW = helv.widthOfTextAtSize(sigLabel, 9);
  page.drawText(sigLabel, {
    x: rightColCenterX - sigLabelW / 2,
    y: y - 22, size: 9, font: helv, color: muted,
  });

  const sigBytes = await fetchAsBytes(signatureUrl);
  const sigImg = await embedImage(pdfDoc, sigBytes);
  if (sigImg) {
    const maxW = rightColW - 16;
    const maxH = 55;
    let sw = maxW;
    let sh = (sigImg.height / sigImg.width) * sw;
    if (sh > maxH) {
      sh = maxH;
      sw = (sigImg.width / sigImg.height) * sh;
    }
    page.drawImage(sigImg, {
      x: rightColCenterX - sw / 2,
      y: y - 32 - sh,
      width: sw, height: sh,
    });
  }
  // Nome do assinante
  const signerLabelText = signerName || "";
  const signerLabelW = helv.widthOfTextAtSize(safe(signerLabelText), 9);
  page.drawText(safe(signerLabelText), {
    x: rightColCenterX - signerLabelW / 2,
    y: y - 102, size: 9, font: helv, color: text,
  });

  // Selfie — preserva proporção (sem distorção)
  const selfieBytes = await fetchAsBytes(selfieUrl);
  const selfieImg = await embedImage(pdfDoc, selfieBytes);
  if (selfieImg) {
    const targetSize = 70;
    // Ajuste proporcional (square fit dentro de targetSize)
    const ratio = selfieImg.width / selfieImg.height;
    let sw = targetSize, sh = targetSize;
    if (ratio > 1) { sh = targetSize / ratio; }
    else { sw = targetSize * ratio; }
    page.drawImage(selfieImg, {
      x: rightColCenterX - sw / 2,
      y: cardY + 22 + (targetSize - sh) / 2,
      width: sw, height: sh,
    });
    const selfieLabel = "Selfie";
    const selfieLabelW = helv.widthOfTextAtSize(selfieLabel, 8);
    page.drawText(selfieLabel, {
      x: rightColCenterX - selfieLabelW / 2,
      y: cardY + 10, size: 8, font: helv, color: muted,
    });
  }

  y = cardY - 18;

  // ===== VALIDACAO JURIDICA + QR (no rodapé, padrão imagem 4) =====
  page.drawLine({
    start: { x: margin, y }, end: { x: pw - margin, y },
    thickness: 0.5, color: cardBorder,
  });
  y -= 16;

  page.drawText("VALIDACAO JURIDICA", { x: margin, y, size: 10, font: helvBold, color: dark });
  y -= 14;

  page.drawText(safe(
    "Este documento foi assinado eletronicamente conforme MP 2.200-2/2001 (art. 10, paragrafo 2) e Lei 14.063/2020."
  ), { x: margin, y, size: 9, font: helv, color: text });
  y -= 22;

  // QR Code à esquerda + texto à direita (padrão imagem 4)
  const verifyUrl = verificationCode
    ? `${PUBLIC_ORIGIN}/verificar/${verificationCode}`
    : `${PUBLIC_ORIGIN}/verificar/${signatureId}`;
  const qrSize = 92;
  try {
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 280, margin: 0 });
    const qrBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]), c => c.charCodeAt(0));
    const qrImg = await pdfDoc.embedPng(qrBytes);
    page.drawImage(qrImg, {
      x: margin, y: y - qrSize, width: qrSize, height: qrSize,
    });

    const tx = margin + qrSize + 18;
    let ty2 = y - 12;
    page.drawText(safe("Para verificar a autenticidade,"), {
      x: tx, y: ty2, size: 9, font: helv, color: text,
    });
    ty2 -= 12;
    page.drawText(safe("acesse:"), {
      x: tx, y: ty2, size: 9, font: helv, color: text,
    });
    ty2 -= 16;
    page.drawText(safe(verifyUrl), {
      x: tx, y: ty2, size: 10, font: helvBold, color: rgb(0.15, 0.39, 0.92),
    });
    ty2 -= 18;
    page.drawText(safe("ou escaneie o QR Code ao lado."), {
      x: tx, y: ty2, size: 8.5, font: helv, color: muted,
    });
  } catch (e) { console.error("QR error:", e); }

  // Footer brand line
  page.drawText(safe(`ID assinatura: ${signatureId}  |  Wizzy Sign - wizzybr.com`), {
    x: margin, y: 28, size: 7, font: helv, color: muted,
  });

  return await pdfDoc.save();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await parseJsonBody<Record<string, any>>(req);
    if (!body.signatureId) return errorResponse("signatureId is required", 400);

    const supabase = createServiceClient();

    // Fetch document creation date if not provided
    if (!body.createdAt) {
      const { data: sigRow } = await supabase
        .from("document_signatures")
        .select("created_at, generated_document:generated_documents(created_at)")
        .eq("id", body.signatureId)
        .maybeSingle();
      body.createdAt =
        (sigRow as any)?.generated_document?.created_at ||
        (sigRow as any)?.created_at ||
        body.signedAt;
    }

    const pdfBytes = await buildReceiptPdf(body);

    const receiptFileName = `signatures/${body.signatureId}/receipt_${Date.now()}.pdf`;
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
      .eq("signature_id", body.signatureId);

    return jsonResponse({ success: true, receiptUrl });
  } catch (error: any) {
    console.error("Error in signature-receipt:", error);
    return errorResponse(error?.message || "Erro interno", 500);
  }
});
