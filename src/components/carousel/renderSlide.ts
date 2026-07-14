// Render do slide 1080x1080 no NAVEGADOR (Canvas API). Porte fiel de
// backend/src/services/render.service.ts (@napi-rs/canvas) — substitui o
// render server-side. Usado para o download .zip em alta resolução.
import JSZip from "jszip";
import type { Carousel, Slide, TextAlign } from "./types";
import { ensureCarouselFonts, FONT_OPTIONS } from "./constants";
import { resolveCarouselImageUrl } from "./carouselImages";

const SIZE = 1080;
const PADDING = 90;
const MAX_WIDTH = SIZE - PADDING * 2;
const LINE_GAP = 1.18;
const ACCENT_GAP = 20;
const ACCENT_H = 3;
const ACCENT_W = 80;
const BODY_GAP = 24;
const DEFAULT_TITLE = 80;
const DEFAULT_BODY = 36;
const DEFAULT_ACCENT = "#3B82F6";
const DEFAULT_FONT = "Montserrat";

type Align = "left" | "center" | "right";

function setFont(
  ctx: CanvasRenderingContext2D,
  family: string,
  bold: boolean,
  size: number,
) {
  ctx.font = `${bold ? "bold " : ""}${size}px "${family}"`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(test).width > MAX_WIDTH) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function lineLeft(align: Align, w: number): number {
  if (align === "center") return PADDING + (MAX_WIDTH - w) / 2;
  if (align === "right") return PADDING + (MAX_WIDTH - w);
  return PADDING;
}

function paintOverlay(
  ctx: CanvasRenderingContext2D,
  position: string,
  a: number,
) {
  if (position === "full") {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(0, 0, SIZE, SIZE);
    return;
  }
  const grad = ctx.createLinearGradient(0, 0, 0, SIZE);
  if (position === "top") {
    grad.addColorStop(0, `rgba(0,0,0,${a})`);
    grad.addColorStop(0.55, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
  } else if (position === "center") {
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, `rgba(0,0,0,${a})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
  } else {
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.45, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${a})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Desenha a imagem em "cover" no quadrado SIZE x SIZE. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const scale = Math.max(SIZE / img.width, SIZE / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
}

let fontsReady: Promise<void> | null = null;
async function ensureFontsLoaded() {
  ensureCarouselFonts();
  if (!fontsReady) {
    fontsReady = (async () => {
      if (!("fonts" in document)) return;
      await Promise.all(
        FONT_OPTIONS.flatMap((f) => [
          (document as any).fonts.load(`400 80px "${f}"`),
          (document as any).fonts.load(`bold 80px "${f}"`),
        ]),
      ).catch(() => undefined);
      await (document as any).fonts.ready;
    })();
  }
  return fontsReady;
}

/** Renderiza um slide para um canvas 1080x1080 e retorna um blob PNG. */
export async function renderSlideToBlob(slide: Slide, total: number): Promise<Blob> {
  await ensureFontsLoaded();

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  const hasImage = slide.hasImage && !!slide.imageUrl;

  // fundo
  if (hasImage) {
    try {
      // Bucket privado: assina o image_url (path/URL legada) antes de carregar no canvas.
      const signed = await resolveCarouselImageUrl(slide.imageUrl);
      const img = await loadImage(signed!);
      drawCover(ctx, img);
    } catch {
      ctx.fillStyle = slide.bgColor ?? "#0a0a0a";
      ctx.fillRect(0, 0, SIZE, SIZE);
    }
  } else {
    ctx.fillStyle = slide.bgColor ?? "#0a0a0a";
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  const color = slide.textColor ?? "#ffffff";
  const accent = slide.accentColor ?? DEFAULT_ACCENT;
  const font = slide.fontFamily ?? DEFAULT_FONT;
  const align = (slide.textAlign ?? "left") as Align;
  const position = slide.overlayPosition ?? "bottom";
  const intensity = slide.overlayIntensity ?? 0.85;
  const titleSize = slide.titleSize ?? DEFAULT_TITLE;
  const bodySize = slide.bodySize ?? DEFAULT_BODY;
  const bold = slide.titleBold ?? true;
  const titleLh = titleSize * LINE_GAP;
  const bodyLh = bodySize * LINE_GAP;

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  if (hasImage) paintOverlay(ctx, position, intensity);

  setFont(ctx, font, bold, titleSize);
  const titleLines = slide.title ? wrapText(ctx, slide.title) : [];
  setFont(ctx, font, false, bodySize);
  const bodyLines = slide.body ? wrapText(ctx, slide.body) : [];

  const titleBlock = titleLines.length * titleLh;
  const hasAccent = titleLines.length > 0;
  const accentBlock = hasAccent ? ACCENT_GAP + ACCENT_H : 0;
  const bodyBlock = bodyLines.length
    ? (titleLines.length ? BODY_GAP : 0) + bodyLines.length * bodyLh
    : 0;
  const totalHeight = titleBlock + accentBlock + bodyBlock;

  let top: number;
  if (position === "top") top = PADDING + 80;
  else if (position === "center" || position === "full") top = (SIZE - totalHeight) / 2;
  else top = SIZE - PADDING - totalHeight;

  // badge "01/10"
  const numText = `${String(slide.order).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
  const badgeFs = 28;
  setFont(ctx, font, true, badgeFs);
  const numW = ctx.measureText(numText).width;
  const padX = 16;
  const badgeW = numW + padX * 2;
  const badgeH = badgeFs + 22;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  roundRect(ctx, PADDING, PADDING, badgeW, badgeH, 10);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(numText, PADDING + padX, PADDING + badgeH / 2 + badgeFs * 0.35);

  // título
  setFont(ctx, font, bold, titleSize);
  ctx.fillStyle = color;
  let y = top + titleSize;
  for (const line of titleLines) {
    const w = ctx.measureText(line).width;
    ctx.fillText(line, lineLeft(align, w), y);
    y += titleLh;
  }

  // linha divisória
  let lineY = top + titleBlock;
  if (hasAccent) {
    lineY += ACCENT_GAP;
    const accentX = lineLeft(align, ACCENT_W);
    ctx.fillStyle = accent;
    roundRect(ctx, accentX, lineY, ACCENT_W, ACCENT_H, ACCENT_H / 2);
    ctx.fill();
    lineY += ACCENT_H;
  }

  // corpo
  if (bodyLines.length) {
    setFont(ctx, font, false, bodySize);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    let by = (titleLines.length ? lineY + BODY_GAP : top) + bodySize;
    for (const line of bodyLines) {
      const w = ctx.measureText(line).width;
      ctx.fillText(line, lineLeft(align, w), by);
      by += bodyLh;
    }
    ctx.globalAlpha = 1;
  }

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))), "image/png"),
  );
}

/** Gera e baixa um .zip com todos os slides em PNG 1080x1080. */
export async function downloadCarouselZip(carousel: Carousel): Promise<void> {
  const zip = new JSZip();
  const total = carousel.slides.length;
  for (const slide of carousel.slides) {
    const blob = await renderSlideToBlob(slide, total);
    zip.file(`slide-${String(slide.order).padStart(2, "0")}.png`, blob);
  }
  const out = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(out);
  const a = document.createElement("a");
  a.href = url;
  a.download = `carrossel-${carousel.id}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
