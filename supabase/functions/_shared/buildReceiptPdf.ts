import { PDFDocument, StandardFonts, rgb, PDFFont, PDFImage, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
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

const dateFmt = (iso: string | null | undefined) => {
  if (!iso) return "N/A";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
};

export interface SignerEntry {
  signerName?: string | null;
  signerEmail?: string | null;
  signerPhone?: string | null;
  signerCpf?: string | null;
  signatureUrl?: string | null;
  selfieUrl?: string | null;
  signedAt?: string | null;
  signerIp?: string | null;
  signerBrowser?: string | null;
  signerOs?: string | null;
  deviceType?: string | null;
  otpChannel?: string | null;
  geolocation?: { lat?: number; lng?: number } | null;
  signatureId?: string | null;
  status?: string; // "signed" | "pending"
}

export interface BuildReceiptInput {
  documentName?: string | null;
  documentHash?: string | null;
  verificationCode?: string | null;
  createdAt?: string | null;
  signers: SignerEntry[];
  // Legacy single-signer fields (kept for back-compat with existing callers)
  signatureId?: string | null;
  signerName?: string | null;
  signerEmail?: string | null;
  signerPhone?: string | null;
  signerCpf?: string | null;
  selfieUrl?: string | null;
  signatureUrl?: string | null;
  signedAt?: string | null;
  signerIp?: string | null;
  signerBrowser?: string | null;
  signerOs?: string | null;
  deviceType?: string | null;
  signerDevice?: string | null;
  otpChannel?: string | null;
  geolocation?: { lat?: number; lng?: number } | null;
}

export async function buildReceiptPdf(input: any): Promise<Uint8Array> {
  // Normalize: if no signers array passed, treat the legacy fields as a single signer
  let signers: SignerEntry[] = Array.isArray(input.signers) && input.signers.length > 0
    ? input.signers
    : [{
        signatureId: input.signatureId,
        signerName: input.signerName,
        signerEmail: input.signerEmail,
        signerPhone: input.signerPhone,
        signerCpf: input.signerCpf,
        selfieUrl: input.selfieUrl,
        signatureUrl: input.signatureUrl,
        signedAt: input.signedAt,
        signerIp: input.signerIp,
        signerBrowser: input.signerBrowser,
        signerOs: input.signerOs,
        deviceType: input.deviceType,
        otpChannel: input.otpChannel,
        geolocation: input.geolocation,
        status: "signed",
      }];

  const { documentName, documentHash, verificationCode, createdAt } = input;

  const pdfDoc = await PDFDocument.create();
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const dark = rgb(0.08, 0.09, 0.12);
  const text = rgb(0.20, 0.22, 0.25);
  const muted = rgb(0.45, 0.47, 0.52);
  const purple = rgb(0.55, 0.36, 0.96);
  const greenBg = rgb(0.86, 0.96, 0.89);
  const greenText = rgb(0.10, 0.55, 0.27);
  const greenSolid = rgb(0.16, 0.65, 0.34);
  const amberBg = rgb(0.99, 0.94, 0.83);
  const amberText = rgb(0.55, 0.35, 0.05);
  const cardBorder = rgb(0.88, 0.88, 0.91);
  const sectionLine = rgb(0.85, 0.86, 0.90);
  const pendingMuted = rgb(0.65, 0.66, 0.70);

  const PW = 595.28, PH = 841.89;
  const margin = 36;
  const innerW = PW - 2 * margin;

  const logoImg = await loadLogo(pdfDoc);
  const nowFmt = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  let page = pdfDoc.addPage([PW, PH]);
  let y = PH - margin;

  // ============ HEADER ============
  page.drawText("Relatorio de Assinaturas", { x: margin, y: y - 16, size: 22, font: helvBold, color: dark });
  page.drawText(safe("Datas e horarios em UTC-0300 (America/Sao_Paulo)"), { x: margin, y: y - 32, size: 9, font: helv, color: muted });
  page.drawText(safe(`Ultima atualizacao em ${nowFmt}`), { x: margin, y: y - 44, size: 9, font: helv, color: muted });

  if (logoImg) {
    const targetW = 170;
    const ratio = logoImg.height / logoImg.width;
    let finalW = targetW; let finalH = targetW * ratio;
    const maxH = 60;
    if (finalH > maxH) { finalH = maxH; finalW = maxH / ratio; }
    page.drawImage(logoImg, { x: PW - margin - finalW, y: y - finalH + 6, width: finalW, height: finalH });
  } else {
    page.drawText("Wizzy", { x: PW - margin - 90, y: y - 28, size: 28, font: helvBold, color: purple });
  }

  y -= 64;

  // ============ DOCUMENT CARD ============
  const docCardH = 96;
  page.drawRectangle({ x: margin, y: y - docCardH, width: innerW, height: docCardH, borderColor: cardBorder, borderWidth: 1 });

  const docTextX = margin + 14;
  const docTextRight = PW - margin - 14;
  const labelSize = 8.5; const valueSize = 8.5;
  let dy = y - 18;
  const drawKV = (label: string, value: string) => {
    const lblW = helvBold.widthOfTextAtSize(label, labelSize);
    page.drawText(safe(label), { x: docTextX, y: dy, size: labelSize, font: helvBold, color: dark });
    page.drawText(safe(value), { x: docTextX + lblW + 4, y: dy, size: valueSize, font: helv, color: text });
    dy -= 13;
  };
  const signedCount = signers.filter(s => s.status === "signed").length;
  const pendingCount = signers.length - signedCount;
  const allSigned = pendingCount === 0;
  drawKV("Status:", allSigned ? "Assinado" : `Parcialmente assinado (${signedCount}/${signers.length})`);
  drawKV("Documento:", documentName || "N/A");
  drawKV("Data da criacao:", dateFmt(createdAt));

  const hashLabel = "Hash do documento original (SHA256):";
  page.drawText(safe(hashLabel), { x: docTextX, y: dy, size: labelSize, font: helvBold, color: dark });
  const hashLabelW = helvBold.widthOfTextAtSize(hashLabel, labelSize);
  const hashFull = documentHash || "N/A";
  const availFirst = docTextRight - docTextX - hashLabelW - 6;
  if (helv.widthOfTextAtSize(hashFull, valueSize) <= availFirst) {
    page.drawText(safe(hashFull), { x: docTextX + hashLabelW + 4, y: dy, size: valueSize, font: helv, color: text });
  } else {
    let cut = hashFull.length;
    while (cut > 8 && helv.widthOfTextAtSize(hashFull.slice(0, cut), valueSize) > availFirst) cut--;
    page.drawText(safe(hashFull.slice(0, cut)), { x: docTextX + hashLabelW + 4, y: dy, size: valueSize, font: helv, color: text });
    dy -= 11;
    page.drawText(safe(hashFull.slice(cut)), { x: docTextX, y: dy, size: valueSize, font: helv, color: text });
  }

  y -= docCardH + 18;

  // ============ ASSINATURAS ============
  page.drawText("Assinaturas", { x: margin, y, size: 15, font: helvBold, color: dark });
  const countTxt = `${signedCount} de ${signers.length} ${signers.length === 1 ? "Assinatura" : "Assinaturas"}`;
  page.drawText(safe(countTxt), { x: PW - margin - helv.widthOfTextAtSize(countTxt, 9), y: y + 3, size: 9, font: helv, color: muted });
  y -= 14;

  const ensureSpace = (needed: number) => {
    if (y - needed < 100) {
      page = pdfDoc.addPage([PW, PH]);
      y = PH - margin;
      page.drawText("Relatorio de Assinaturas (cont.)", { x: margin, y: y - 14, size: 12, font: helvBold, color: dark });
      y -= 28;
    }
  };

  // Render each signer card
  for (let i = 0; i < signers.length; i++) {
    const s = signers[i];
    const isSigned = s.status === "signed";
    const cardH = 200;
    ensureSpace(cardH + 12);

    const cardY = y - cardH;
    const baseColor = isSigned ? text : pendingMuted;
    const headColor = isSigned ? dark : pendingMuted;

    page.drawRectangle({
      x: margin, y: cardY, width: innerW, height: cardH,
      borderColor: cardBorder, borderWidth: 1,
    });

    // Vertical separator (right column for signature image)
    const rightColW = 160;
    const rightColX = PW - margin - rightColW - 4;
    const rightColCenterX = rightColX + rightColW / 2;
    page.drawLine({ start: { x: rightColX - 8, y: cardY + 8 }, end: { x: rightColX - 8, y: y - 8 }, thickness: 0.5, color: sectionLine });

    // Badge: assinado (verde) ou pendente (âmbar)
    const bx = margin + 14;
    const badgeY = y - 22;
    const badgeTxt = isSigned ? "Assinado via Wizzy Sign" : "Assinatura pendente";
    const badgeTxtW = helvBold.widthOfTextAtSize(badgeTxt, 9);
    const badgeW = badgeTxtW + 32;
    page.drawRectangle({ x: bx, y: badgeY - 4, width: badgeW, height: 18, color: isSigned ? greenBg : amberBg });
    if (isSigned) {
      const shieldCx = bx + 10, shieldCy = badgeY + 4;
      page.drawSvgPath("M 0 -7 L 6 -4 L 6 2 C 6 5 3 7 0 8 C -3 7 -6 5 -6 2 L -6 -4 Z", { x: shieldCx, y: shieldCy, color: greenSolid, scale: 1 });
      page.drawSvgPath("M -2.5 0 L -0.8 1.8 L 2.8 -2", { x: shieldCx, y: shieldCy + 0.5, borderColor: rgb(1, 1, 1), borderWidth: 1.4 });
    } else {
      // simple clock icon — just a circle
      page.drawCircle({ x: bx + 10, y: badgeY + 4, size: 5, borderColor: amberText, borderWidth: 1.2 });
    }
    page.drawText(badgeTxt, { x: bx + 20, y: badgeY, size: 9, font: helvBold, color: isSigned ? greenText : amberText });

    let ly = badgeY - 22;
    page.drawText(safe((s.signerName || "Nome nao informado").toUpperCase()), { x: margin + 14, y: ly, size: 13, font: helvBold, color: headColor });
    ly -= 14;
    if (isSigned) {
      page.drawText(safe(`Data e hora da assinatura: ${dateFmt(s.signedAt)}`), { x: margin + 14, y: ly, size: 9, font: helv, color: baseColor });
    } else {
      page.drawText(safe("Aguardando assinatura"), { x: margin + 14, y: ly, size: 9, font: helv, color: baseColor });
    }
    ly -= 16;

    const dataLeftMaxX = rightColX - 16;
    const colX = margin + 14;

    const drawLabelValue = (label: string, value: string) => {
      page.drawText(label, { x: colX, y: ly, size: 9, font: helvBold, color: headColor });
      const lw = helvBold.widthOfTextAtSize(label, 9);
      // truncate value to fit
      let v = " " + value;
      const maxW = dataLeftMaxX - colX - lw - 4;
      while (helv.widthOfTextAtSize(v, 9) > maxW && v.length > 4) v = v.slice(0, -2) + "...";
      page.drawText(safe(v), { x: colX + lw, y: ly, size: 9, font: helv, color: baseColor });
      ly -= 12;
    };

    drawLabelValue("Telefone:", s.signerPhone || "Nao informado");
    drawLabelValue("E-mail:", s.signerEmail || "Nao informado");
    if (s.signerCpf) drawLabelValue("CPF:", s.signerCpf);
    if (isSigned) {
      const channel = s.otpChannel === "whatsapp" ? "WhatsApp" : s.otpChannel === "sms" ? "SMS" : "E-mail";
      drawLabelValue("Canal OTP:", channel);
      const geoTxt = (s.geolocation && (s.geolocation as any).lat != null && (s.geolocation as any).lng != null)
        ? `${Number((s.geolocation as any).lat).toFixed(6)}, ${Number((s.geolocation as any).lng).toFixed(6)}`
        : "Nao coletada";
      drawLabelValue("Coordenada:", geoTxt);
      drawLabelValue("IP:", s.signerIp || "Nao coletado");
      const deviceFull = `${s.signerBrowser || "Desconhecido"} em ${s.signerOs || "Desconhecido"} (${s.deviceType || "desktop"})`;
      drawLabelValue("Dispositivo:", deviceFull);
    }

    // Right column — signature image / pending placeholder + selfie
    const sigLabel = "Assinatura";
    const sigLabelW = helv.widthOfTextAtSize(sigLabel, 9);
    page.drawText(sigLabel, { x: rightColCenterX - sigLabelW / 2, y: y - 22, size: 9, font: helv, color: muted });

    if (isSigned && s.signatureUrl) {
      const sigBytes = await fetchAsBytes(s.signatureUrl);
      const sigImg = await embedImage(pdfDoc, sigBytes);
      if (sigImg) {
        const maxW = rightColW - 16, maxH = 50;
        let sw = maxW; let sh = (sigImg.height / sigImg.width) * sw;
        if (sh > maxH) { sh = maxH; sw = (sigImg.width / sigImg.height) * sh; }
        page.drawImage(sigImg, { x: rightColCenterX - sw / 2, y: y - 32 - sh, width: sw, height: sh });
      }
    } else {
      // Pending placeholder
      const phY = y - 70;
      page.drawRectangle({
        x: rightColX + 8, y: phY, width: rightColW - 16, height: 40,
        borderColor: pendingMuted, borderWidth: 0.6,
      });
      const phTxt = "Assinatura pendente";
      const phW = helv.widthOfTextAtSize(phTxt, 9);
      page.drawText(phTxt, { x: rightColCenterX - phW / 2, y: phY + 16, size: 9, font: helv, color: pendingMuted });
    }

    if (isSigned && s.selfieUrl) {
      const selfieBytes = await fetchAsBytes(s.selfieUrl);
      const selfieImg = await embedImage(pdfDoc, selfieBytes);
      if (selfieImg) {
        const targetSize = 60;
        const ratio = selfieImg.width / selfieImg.height;
        let sw = targetSize, sh = targetSize;
        if (ratio > 1) sh = targetSize / ratio; else sw = targetSize * ratio;
        page.drawImage(selfieImg, { x: rightColCenterX - sw / 2, y: cardY + 22 + (targetSize - sh) / 2, width: sw, height: sh });
        const selfieLabel = "Selfie";
        const selfieLabelW = helv.widthOfTextAtSize(selfieLabel, 8);
        page.drawText(selfieLabel, { x: rightColCenterX - selfieLabelW / 2, y: cardY + 10, size: 8, font: helv, color: muted });
      }
    }

    y = cardY - 14;
  }

  // ============ VALIDAÇÃO + QR ============
  ensureSpace(140);
  page.drawLine({ start: { x: margin, y }, end: { x: PW - margin, y }, thickness: 0.5, color: cardBorder });
  y -= 16;
  page.drawText("VALIDACAO JURIDICA", { x: margin, y, size: 10, font: helvBold, color: dark });
  y -= 14;
  page.drawText(safe("Documento assinado eletronicamente conforme MP 2.200-2/2001 (art. 10, paragrafo 2) e Lei 14.063/2020."), { x: margin, y, size: 9, font: helv, color: text });
  y -= 22;

  const verifyUrl = verificationCode
    ? `${PUBLIC_ORIGIN}/verificar/${verificationCode}`
    : `${PUBLIC_ORIGIN}/verificar/${signers[0]?.signatureId || ""}`;
  const qrSize = 92;
  try {
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 280, margin: 0 });
    const qrBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]), c => c.charCodeAt(0));
    const qrImg = await pdfDoc.embedPng(qrBytes);
    page.drawImage(qrImg, { x: margin, y: y - qrSize, width: qrSize, height: qrSize });
    const tx = margin + qrSize + 18;
    let ty2 = y - 12;
    page.drawText(safe("Para verificar a autenticidade, acesse:"), { x: tx, y: ty2, size: 9, font: helv, color: text });
    ty2 -= 16;
    page.drawText(safe(verifyUrl), { x: tx, y: ty2, size: 10, font: helvBold, color: rgb(0.15, 0.39, 0.92) });
    ty2 -= 16;
    page.drawText(safe("ou escaneie o QR Code ao lado."), { x: tx, y: ty2, size: 8.5, font: helv, color: muted });
  } catch (e) { console.error("QR error:", e); }

  page.drawText(safe(`Wizzy Sign - wizzybr.com`), { x: margin, y: 28, size: 7, font: helv, color: muted });

  return await pdfDoc.save();
}
