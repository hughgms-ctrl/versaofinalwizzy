import { PDFDocument, StandardFonts, rgb, PDFFont, PDFImage } from "https://esm.sh/pdf-lib@1.17.1";
import QRCode from "https://esm.sh/qrcode@1.5.3";

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
  } catch { return null; }
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
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    let word = w;
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

export async function buildReceiptPdf(input: Record<string, any>): Promise<Uint8Array> {
  const {
    signatureId, signerName, signerEmail, signerPhone, signerCpf,
    documentName, documentHash, verificationCode, selfieUrl, signatureUrl,
    signedAt, signerIp, signerBrowser, signerOs, deviceType, signerDevice,
    otpChannel, geolocation, createdAt,
  } = input;

  const pdfDoc = await PDFDocument.create();
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width: pw, height: ph } = page.getSize();
  const margin = 36;
  const innerW = pw - 2 * margin;

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

  // HEADER
  page.drawText("Relatorio de Assinaturas", { x: margin, y: y - 16, size: 22, font: helvBold, color: dark });
  page.drawText(safe("Datas e horarios em UTC-0300 ( America/Sao_Paulo)"), { x: margin, y: y - 32, size: 9, font: helv, color: muted });
  page.drawText(safe(`Ultima atualizacao em ${nowFmt}`), { x: margin, y: y - 44, size: 9, font: helv, color: muted });

  const logoImg = await loadLogo(pdfDoc);
  if (logoImg) {
    const targetW = 170;
    const ratio = logoImg.height / logoImg.width;
    let finalW = targetW; let finalH = targetW * ratio;
    const maxH = 60;
    if (finalH > maxH) { finalH = maxH; finalW = maxH / ratio; }
    page.drawImage(logoImg, { x: pw - margin - finalW, y: y - finalH + 6, width: finalW, height: finalH });
  } else {
    page.drawText("Wizzy", { x: pw - margin - 90, y: y - 28, size: 28, font: helvBold, color: purple });
  }

  y -= 64;

  // DOCUMENT CARD
  const docCardH = 110;
  page.drawRectangle({ x: margin, y: y - docCardH, width: innerW, height: docCardH, borderColor: cardBorder, borderWidth: 1 });

  const docTextX = margin + 14;
  const docTextRight = pw - margin - 14;
  const labelSize = 8.5; const valueSize = 8.5;
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

  const hashLabel = "Hash do documento original (SHA256):";
  page.drawText(safe(hashLabel), { x: docTextX, y: dy, size: labelSize, font: helvBold, color: dark });
  const hashLabelW = helvBold.widthOfTextAtSize(hashLabel, labelSize);
  const hashFull = documentHash || "N/A";
  const availFirst = docTextRight - docTextX - hashLabelW - 6;
  const hashSize = valueSize;
  if (helv.widthOfTextAtSize(hashFull, hashSize) <= availFirst) {
    page.drawText(safe(hashFull), { x: docTextX + hashLabelW + 4, y: dy, size: hashSize, font: helv, color: text });
  } else {
    let cut = hashFull.length;
    while (cut > 8 && helv.widthOfTextAtSize(hashFull.slice(0, cut), hashSize) > availFirst) cut--;
    page.drawText(safe(hashFull.slice(0, cut)), { x: docTextX + hashLabelW + 4, y: dy, size: hashSize, font: helv, color: text });
    dy -= 11;
    page.drawText(safe(hashFull.slice(cut)), { x: docTextX, y: dy, size: hashSize, font: helv, color: text });
  }

  y -= docCardH + 22;

  // ASSINATURAS
  page.drawText("Assinaturas", { x: margin, y, size: 15, font: helvBold, color: dark });
  const countTxt = "1 de 1 Assinaturas";
  page.drawText(safe(countTxt), { x: pw - margin - helv.widthOfTextAtSize(countTxt, 9), y: y + 3, size: 9, font: helv, color: muted });
  y -= 12;

  const cardH = 320;
  const cardY = y - cardH;
  page.drawRectangle({ x: margin, y: cardY, width: innerW, height: cardH, borderColor: cardBorder, borderWidth: 1 });

  const rightColW = 170;
  const rightColX = pw - margin - rightColW - 4;
  const rightColCenterX = rightColX + rightColW / 2;

  page.drawLine({ start: { x: rightColX - 8, y: cardY + 8 }, end: { x: rightColX - 8, y: y - 8 }, thickness: 0.5, color: sectionLine });

  // Badge único verde
  const bx = margin + 14;
  const badgeY = y - 22;
  const badgeTxt = "Assinado via Wizzy Sign";
  const badgeTxtW = helvBold.widthOfTextAtSize(badgeTxt, 9);
  const badgeW = badgeTxtW + 32;
  page.drawRectangle({ x: bx, y: badgeY - 4, width: badgeW, height: 18, color: greenBg });
  // Escudo vetorial verde com check branco (estilo ZapSign)
  const shieldCx = bx + 10;
  const shieldCy = badgeY + 4;
  // SVG path do escudo desenhado em torno de (0,0); pdf-lib aplica y invertido
  const shieldPath = "M 0 -7 L 6 -4 L 6 2 C 6 5 3 7 0 8 C -3 7 -6 5 -6 2 L -6 -4 Z";
  page.drawSvgPath(shieldPath, {
    x: shieldCx,
    y: shieldCy,
    color: greenSolid,
    scale: 1,
  });
  // Check branco dentro do escudo
  const checkPath = "M -2.5 0 L -0.8 1.8 L 2.8 -2";
  page.drawSvgPath(checkPath, {
    x: shieldCx,
    y: shieldCy + 0.5,
    borderColor: rgb(1, 1, 1),
    borderWidth: 1.4,
  });
  page.drawText(badgeTxt, { x: bx + 20, y: badgeY, size: 9, font: helvBold, color: greenText });

  let ly = badgeY - 22;
  page.drawText(safe((signerName || "Nome nao informado").toUpperCase()), { x: margin + 14, y: ly, size: 13, font: helvBold, color: dark });
  ly -= 16;
  page.drawText(safe(`Data e hora da assinatura: ${dateFmt(signedAt)}`), { x: margin + 14, y: ly, size: 9, font: helv, color: text });
  ly -= 12;
  page.drawText(safe(`Token: ${signatureId || "N/A"}`), { x: margin + 14, y: ly, size: 9, font: helv, color: text });
  ly -= 18;

  const dataLeftMaxX = rightColX - 16;
  const dataColW = dataLeftMaxX - (margin + 14);
  const colX = margin + 14;

  page.drawText("Pontos de autenticacao:", { x: colX, y: ly, size: 10, font: helvBold, color: dark });
  ly -= 14;
  const drawLabelValue = (label: string, value: string) => {
    page.drawText(label, { x: colX, y: ly, size: 9, font: helvBold, color: dark });
    const lw = helvBold.widthOfTextAtSize(label, 9);
    page.drawText(safe(" " + value), { x: colX + lw, y: ly, size: 9, font: helv, color: text });
    ly -= 12;
  };

  drawLabelValue("Telefone:", signerPhone || "Nao informado");
  // E-mail (com wrap)
  const emailLabel = "E-mail:";
  const emailLabelW = helvBold.widthOfTextAtSize(emailLabel, 9);
  page.drawText(emailLabel, { x: colX, y: ly, size: 9, font: helvBold, color: dark });
  const emailLines = wrapText(` ${signerEmail || "Nao informado"}`, helv, 9, dataColW - emailLabelW);
  page.drawText(safe(emailLines[0] || ""), { x: colX + emailLabelW, y: ly, size: 9, font: helv, color: text });
  ly -= 12;
  for (const l of emailLines.slice(1, 2)) {
    page.drawText(safe(l), { x: colX, y: ly, size: 9, font: helv, color: text });
    ly -= 12;
  }
  if (signerCpf) {
    drawLabelValue("CPF:", signerCpf);
  }
  const channel = otpChannel === "whatsapp" ? "WhatsApp" : otpChannel === "sms" ? "SMS" : "E-mail";
  drawLabelValue("Canal OTP:", channel);
  ly -= 6;

  // DADOS COLETADOS
  page.drawLine({ start: { x: colX, y: ly + 8 }, end: { x: dataLeftMaxX, y: ly + 8 }, thickness: 0.5, color: sectionLine });
  page.drawText("Dados coletados:", { x: colX, y: ly, size: 10, font: helvBold, color: dark });
  ly -= 14;

  const geoTxt = (geolocation && geolocation.lat != null && geolocation.lng != null)
    ? `${Number(geolocation.lat).toFixed(6)}, ${Number(geolocation.lng).toFixed(6)}`
    : "Nao coletada";
  drawLabelValue("Coordenada geografica:", geoTxt);
  drawLabelValue("IP:", signerIp || "Nao coletado");

  // Mostra apenas os dados parseados (browser/OS/tipo) - nunca o User-Agent cru
  const deviceFull = `${signerBrowser || "Desconhecido"} em ${signerOs || "Desconhecido"} (${deviceType || "desktop"})`;
  const devLabel = "Dispositivo: ";
  page.drawText(devLabel, { x: colX, y: ly, size: 9, font: helvBold, color: dark });
  const devLabelW = helvBold.widthOfTextAtSize(devLabel, 9);
  page.drawText(safe(deviceFull), { x: colX + devLabelW, y: ly, size: 9, font: helv, color: text });

  // Right column
  const sigLabel = "Assinatura";
  const sigLabelW = helv.widthOfTextAtSize(sigLabel, 9);
  page.drawText(sigLabel, { x: rightColCenterX - sigLabelW / 2, y: y - 22, size: 9, font: helv, color: muted });

  const sigBytes = await fetchAsBytes(signatureUrl);
  const sigImg = await embedImage(pdfDoc, sigBytes);
  if (sigImg) {
    const maxW = rightColW - 16;
    const maxH = 55;
    let sw = maxW;
    let sh = (sigImg.height / sigImg.width) * sw;
    if (sh > maxH) { sh = maxH; sw = (sigImg.width / sigImg.height) * sh; }
    page.drawImage(sigImg, { x: rightColCenterX - sw / 2, y: y - 32 - sh, width: sw, height: sh });
  }
  const signerLabelText = signerName || "";
  const signerLabelW = helv.widthOfTextAtSize(safe(signerLabelText), 9);
  page.drawText(safe(signerLabelText), { x: rightColCenterX - signerLabelW / 2, y: y - 102, size: 9, font: helv, color: text });

  const selfieBytes = await fetchAsBytes(selfieUrl);
  const selfieImg = await embedImage(pdfDoc, selfieBytes);
  if (selfieImg) {
    const targetSize = 70;
    const ratio = selfieImg.width / selfieImg.height;
    let sw = targetSize, sh = targetSize;
    if (ratio > 1) { sh = targetSize / ratio; } else { sw = targetSize * ratio; }
    page.drawImage(selfieImg, { x: rightColCenterX - sw / 2, y: cardY + 22 + (targetSize - sh) / 2, width: sw, height: sh });
    const selfieLabel = "Selfie";
    const selfieLabelW = helv.widthOfTextAtSize(selfieLabel, 8);
    page.drawText(selfieLabel, { x: rightColCenterX - selfieLabelW / 2, y: cardY + 10, size: 8, font: helv, color: muted });
  }

  y = cardY - 18;

  // VALIDACAO + QR no rodapé
  page.drawLine({ start: { x: margin, y }, end: { x: pw - margin, y }, thickness: 0.5, color: cardBorder });
  y -= 16;

  page.drawText("VALIDACAO JURIDICA", { x: margin, y, size: 10, font: helvBold, color: dark });
  y -= 14;

  page.drawText(safe("Este documento foi assinado eletronicamente conforme MP 2.200-2/2001 (art. 10, paragrafo 2) e Lei 14.063/2020."), { x: margin, y, size: 9, font: helv, color: text });
  y -= 22;

  const verifyUrl = verificationCode
    ? `${PUBLIC_ORIGIN}/verificar/${verificationCode}`
    : `${PUBLIC_ORIGIN}/verificar/${signatureId}`;
  const qrSize = 92;
  try {
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 280, margin: 0 });
    const qrBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]), c => c.charCodeAt(0));
    const qrImg = await pdfDoc.embedPng(qrBytes);
    page.drawImage(qrImg, { x: margin, y: y - qrSize, width: qrSize, height: qrSize });

    const tx = margin + qrSize + 18;
    let ty2 = y - 12;
    page.drawText(safe("Para verificar a autenticidade,"), { x: tx, y: ty2, size: 9, font: helv, color: text });
    ty2 -= 12;
    page.drawText(safe("acesse:"), { x: tx, y: ty2, size: 9, font: helv, color: text });
    ty2 -= 16;
    page.drawText(safe(verifyUrl), { x: tx, y: ty2, size: 10, font: helvBold, color: rgb(0.15, 0.39, 0.92) });
    ty2 -= 18;
    page.drawText(safe("ou escaneie o QR Code ao lado."), { x: tx, y: ty2, size: 8.5, font: helv, color: muted });
  } catch (e) { console.error("QR error:", e); }

  page.drawText(safe(`ID assinatura: ${signatureId}  |  Wizzy Sign - wizzybr.com`), { x: margin, y: 28, size: 7, font: helv, color: muted });

  return await pdfDoc.save();
}
