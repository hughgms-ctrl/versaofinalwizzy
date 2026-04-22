import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ====================== Formatting helpers ======================
function formatFieldValue(value: unknown, fieldType?: string): string {
  if (value === null || value === undefined || value === "") return "";
  const str = String(value);
  switch (fieldType) {
    case "date": {
      const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
      if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
      const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
      if (brMatch) return str;
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      }
      return str;
    }
    case "cpf": {
      const digits = str.replace(/\D/g, "").padStart(11, "0").slice(-11);
      return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    }
    case "cnpj": {
      const digits = str.replace(/\D/g, "").padStart(14, "0").slice(-14);
      return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    }
    case "phone":
    case "tel": {
      const digits = str.replace(/\D/g, "");
      if (digits.length === 11) return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
      if (digits.length === 10) return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
      return str;
    }
    case "currency": {
      const num = Number(str.replace(/[^0-9,.-]/g, "").replace(",", "."));
      if (Number.isFinite(num)) return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      return str;
    }
    default:
      return str;
  }
}

function fillTemplate(template: string, data: Record<string, unknown>, fields: Array<{ name: string; type?: string }> = []): string {
  const fieldMap = new Map(fields.map((f) => [f.name, f.type]));
  return template.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_, key) => {
    const v = data[key];
    if (v === undefined || v === null || v === "") return `{{${key}}}`;
    return formatFieldValue(v, fieldMap.get(key));
  });
}

// ====================== HTML sanitization ======================
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&hellip;/g, "...")
    .replace(/&mdash;/g, "--")
    .replace(/&ndash;/g, "-")
    .replace(/&laquo;/g, '"')
    .replace(/&raquo;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function sanitizeWinAnsi(text: string): string {
  return text
    .replace(/[\u2610]/g, "[ ]")
    .replace(/[\u2611]/g, "[x]")
    .replace(/[\u2612]/g, "[x]")
    .replace(/[\u2013]/g, "-")
    .replace(/[\u2014]/g, "--")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2022]/g, "*")
    .replace(/[\u2026]/g, "...")
    .replace(/[\u00A0]/g, " ")
    .replace(/[^\x00-\xFF]/g, "");
}

// ====================== Lightweight HTML → block parser ======================
type InlineRun = { text: string; bold?: boolean; italic?: boolean };
type Block =
  | { type: "p" | "h1" | "h2" | "h3"; runs: InlineRun[]; align?: "left" | "center" | "right" | "justify" }
  | { type: "li"; ordered: boolean; index: number; runs: InlineRun[] }
  | { type: "spacer"; height: number }
  | { type: "hr" };

function parseInlineRuns(html: string): InlineRun[] {
  // Returns runs of text with bold/italic flags.
  // Strategy: tokenize tags <b>, <strong>, <i>, <em>, <br>; ignore others.
  const runs: InlineRun[] = [];
  let bold = 0;
  let italic = 0;
  let buf = "";
  const flush = () => {
    if (buf.length === 0) return;
    runs.push({ text: decodeHtmlEntities(buf), bold: bold > 0, italic: italic > 0 });
    buf = "";
  };
  // Normalize <br> to newlines first
  const norm = html.replace(/<br\s*\/?>/gi, "\n");
  const re = /<\/?[a-zA-Z][^>]*>|[^<]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) {
    const tok = m[0];
    if (tok.startsWith("<")) {
      const closing = tok.startsWith("</");
      const name = tok.replace(/[<\/>]/g, "").split(/\s/)[0].toLowerCase();
      if (name === "b" || name === "strong") {
        flush();
        bold += closing ? -1 : 1;
        if (bold < 0) bold = 0;
      } else if (name === "i" || name === "em") {
        flush();
        italic += closing ? -1 : 1;
        if (italic < 0) italic = 0;
      }
      // ignore other inline tags (u, span, a, etc.) - text inside still processed
    } else {
      buf += tok;
    }
  }
  flush();
  return runs;
}

function getAttr(tag: string, attr: string): string | null {
  const m = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  return m ? m[1] : null;
}

function getAlignFromTag(openTag: string): "left" | "center" | "right" | "justify" | undefined {
  const styleAttr = getAttr(openTag, "style") || "";
  const align = /text-align\s*:\s*(left|center|right|justify)/i.exec(styleAttr);
  if (align) return align[1].toLowerCase() as any;
  const alignAttr = getAttr(openTag, "align");
  if (alignAttr) return alignAttr.toLowerCase() as any;
  return undefined;
}

function parseHtmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  // Match block-level elements: h1-h3, p, ul, ol, hr
  // Strategy: iterate top-level tags
  const blockRe = /<(h1|h2|h3|p|ul|ol|hr|div)([^>]*)>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;
  let m: RegExpExecArray | null;
  let lastIndex = 0;
  let foundAny = false;
  while ((m = blockRe.exec(html)) !== null) {
    foundAny = true;
    // Capture any orphan text between blocks as a paragraph
    const between = html.slice(lastIndex, m.index).trim();
    if (between) {
      blocks.push({ type: "p", runs: parseInlineRuns(between) });
    }
    lastIndex = m.index + m[0].length;

    if (m[0].toLowerCase().startsWith("<hr")) {
      blocks.push({ type: "hr" });
      continue;
    }

    const tag = (m[1] || "").toLowerCase();
    const openTag = `<${tag}${m[2] || ""}>`;
    const inner = m[3] || "";
    const align = getAlignFromTag(openTag);

    if (tag === "h1" || tag === "h2" || tag === "h3") {
      blocks.push({ type: tag, runs: parseInlineRuns(inner), align });
    } else if (tag === "p" || tag === "div") {
      const runs = parseInlineRuns(inner);
      // Empty paragraph -> spacer
      const totalText = runs.map((r) => r.text).join("").trim();
      if (totalText.length === 0) {
        blocks.push({ type: "spacer", height: 8 });
      } else {
        blocks.push({ type: "p", runs, align });
      }
    } else if (tag === "ul" || tag === "ol") {
      const ordered = tag === "ol";
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch: RegExpExecArray | null;
      let idx = 0;
      while ((liMatch = liRe.exec(inner)) !== null) {
        idx += 1;
        blocks.push({ type: "li", ordered, index: idx, runs: parseInlineRuns(liMatch[1]) });
      }
    }
  }
  // Trailing text
  const trailing = html.slice(lastIndex).trim();
  if (trailing) {
    blocks.push({ type: "p", runs: parseInlineRuns(trailing) });
  }
  // If nothing matched, treat full html as a paragraph
  if (!foundAny && !trailing) {
    blocks.push({ type: "p", runs: parseInlineRuns(html) });
  }
  return blocks;
}

// ====================== PDF rendering ======================
interface RenderCtx {
  pdfDoc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  fontItalic: PDFFont;
  fontBoldItalic: PDFFont;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  contentWidth: number;
  y: number;
  pages: PDFPage[];
  headerHeight: number;
  drawHeader: (page: PDFPage) => void;
}

function pickFont(ctx: RenderCtx, bold?: boolean, italic?: boolean): PDFFont {
  if (bold && italic) return ctx.fontBoldItalic;
  if (bold) return ctx.fontBold;
  if (italic) return ctx.fontItalic;
  return ctx.font;
}

function wrapRuns(ctx: RenderCtx, runs: InlineRun[], maxWidth: number, fontSize: number): { run: InlineRun; width: number }[][] {
  // Tokenize each run by whitespace; wrap into lines preserving formatting
  const lines: { run: InlineRun; width: number }[][] = [];
  let currentLine: { run: InlineRun; width: number }[] = [];
  let currentWidth = 0;
  const spaceWidthCache: Record<string, number> = {};

  const pushLine = () => {
    lines.push(currentLine);
    currentLine = [];
    currentWidth = 0;
  };

  for (const run of runs) {
    const fontRef = pickFont(ctx, run.bold, run.italic);
    const cleanedText = sanitizeWinAnsi(run.text);
    // Split keeping newlines as line breaks
    const paragraphs = cleanedText.split("\n");
    for (let pi = 0; pi < paragraphs.length; pi++) {
      const para = paragraphs[pi];
      const tokens = para.split(/(\s+)/).filter((t) => t.length > 0);
      for (const token of tokens) {
        if (/^\s+$/.test(token)) {
          if (currentLine.length === 0) continue;
          const sw = spaceWidthCache[`${run.bold}-${run.italic}`] ??= fontRef.widthOfTextAtSize(" ", fontSize);
          if (currentWidth + sw > maxWidth) {
            pushLine();
          } else {
            currentLine.push({ run: { text: " ", bold: run.bold, italic: run.italic }, width: sw });
            currentWidth += sw;
          }
        } else {
          const w = fontRef.widthOfTextAtSize(token, fontSize);
          if (currentWidth + w > maxWidth && currentLine.length > 0) {
            pushLine();
          }
          if (w > maxWidth) {
            // hard break long token
            let buf = "";
            let bufW = 0;
            for (const ch of token) {
              const cw = fontRef.widthOfTextAtSize(ch, fontSize);
              if (bufW + cw > maxWidth && buf.length > 0) {
                currentLine.push({ run: { text: buf, bold: run.bold, italic: run.italic }, width: bufW });
                pushLine();
                buf = ch;
                bufW = cw;
              } else {
                buf += ch;
                bufW += cw;
              }
            }
            if (buf.length > 0) {
              currentLine.push({ run: { text: buf, bold: run.bold, italic: run.italic }, width: bufW });
              currentWidth = bufW;
            }
          } else {
            currentLine.push({ run: { text: token, bold: run.bold, italic: run.italic }, width: w });
            currentWidth += w;
          }
        }
      }
      // newline between paragraph parts
      if (pi < paragraphs.length - 1) pushLine();
    }
  }
  if (currentLine.length > 0) pushLine();
  return lines;
}

function ensureSpace(ctx: RenderCtx, needed: number): void {
  if (ctx.y - needed < ctx.margin + 30) {
    // Add new page
    ctx.page = ctx.pdfDoc.addPage([ctx.pageWidth, ctx.pageHeight]);
    ctx.pages.push(ctx.page);
    ctx.y = ctx.pageHeight - ctx.margin;
    ctx.drawHeader(ctx.page);
    if (ctx.headerHeight > 0) ctx.y -= ctx.headerHeight;
  }
}

function drawTextLine(ctx: RenderCtx, line: { run: InlineRun; width: number }[], fontSize: number, lineHeight: number, align: "left" | "center" | "right" | "justify" = "left", color = rgb(0.1, 0.1, 0.1)) {
  ensureSpace(ctx, lineHeight);
  const totalWidth = line.reduce((s, t) => s + t.width, 0);
  let x = ctx.margin;
  if (align === "center") x = ctx.margin + (ctx.contentWidth - totalWidth) / 2;
  else if (align === "right") x = ctx.margin + (ctx.contentWidth - totalWidth);

  // For justify: distribute extra space among interior spaces
  let extraSpaceWidth = 0;
  if (align === "justify" && line.length > 1) {
    const spaceTokens = line.filter((t) => t.run.text === " ").length;
    if (spaceTokens > 0) {
      const slack = ctx.contentWidth - totalWidth;
      if (slack > 0) extraSpaceWidth = slack / spaceTokens;
    }
  }

  for (const tok of line) {
    const fontRef = pickFont(ctx, tok.run.bold, tok.run.italic);
    ctx.page.drawText(tok.run.text, {
      x,
      y: ctx.y - fontSize,
      size: fontSize,
      font: fontRef,
      color,
    });
    x += tok.width + (align === "justify" && tok.run.text === " " ? extraSpaceWidth : 0);
  }
  ctx.y -= lineHeight;
}

function renderBlocks(ctx: RenderCtx, blocks: Block[]) {
  const baseSize = 11;
  const baseLine = baseSize * 1.5;

  for (const block of blocks) {
    if (block.type === "spacer") {
      ensureSpace(ctx, block.height);
      ctx.y -= block.height;
      continue;
    }
    if (block.type === "hr") {
      ensureSpace(ctx, 12);
      ctx.page.drawLine({
        start: { x: ctx.margin, y: ctx.y - 4 },
        end: { x: ctx.margin + ctx.contentWidth, y: ctx.y - 4 },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      });
      ctx.y -= 12;
      continue;
    }

    let fontSize = baseSize;
    let lineHeight = baseLine;
    let runs = block.runs;
    let align: "left" | "center" | "right" | "justify" = (block as any).align || "left";

    if (block.type === "h1") { fontSize = 20; lineHeight = 28; runs = runs.map((r) => ({ ...r, bold: true })); }
    else if (block.type === "h2") { fontSize = 16; lineHeight = 22; runs = runs.map((r) => ({ ...r, bold: true })); }
    else if (block.type === "h3") { fontSize = 13; lineHeight = 18; runs = runs.map((r) => ({ ...r, bold: true })); }

    if (block.type === "li") {
      const bullet = block.ordered ? `${block.index}. ` : "•  ";
      const bulletWidth = ctx.fontBold.widthOfTextAtSize(bullet, baseSize);
      // Draw bullet, then wrap remaining text with indent
      const indent = bulletWidth + 4;
      const innerWidth = ctx.contentWidth - indent;
      const lines = wrapRuns(ctx, runs, innerWidth, baseSize);
      for (let li = 0; li < lines.length; li++) {
        ensureSpace(ctx, baseLine);
        if (li === 0) {
          ctx.page.drawText(bullet, {
            x: ctx.margin,
            y: ctx.y - baseSize,
            size: baseSize,
            font: ctx.font,
            color: rgb(0.1, 0.1, 0.1),
          });
        }
        let x = ctx.margin + indent;
        for (const tok of lines[li]) {
          const fontRef = pickFont(ctx, tok.run.bold, tok.run.italic);
          ctx.page.drawText(tok.run.text, {
            x, y: ctx.y - baseSize, size: baseSize, font: fontRef, color: rgb(0.1, 0.1, 0.1),
          });
          x += tok.width;
        }
        ctx.y -= baseLine;
      }
      continue;
    }

    const lines = wrapRuns(ctx, runs, ctx.contentWidth, fontSize);
    if (lines.length === 0) {
      ctx.y -= lineHeight;
      continue;
    }
    for (let i = 0; i < lines.length; i++) {
      // Last line of justify -> left
      const lineAlign = align === "justify" && i === lines.length - 1 ? "left" : align;
      drawTextLine(ctx, lines[i], fontSize, lineHeight, lineAlign);
    }
    // small spacing after block
    ctx.y -= 4;
  }
}

// ====================== Main handler ======================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      template_content,
      template_content_html,
      filled_data,
      fields,
      document_name,
      logo_url,
    } = body;

    // Determine HTML source: prefer rich HTML, fall back to plain text wrapped in <p>
    let rawHtml = "";
    if (template_content_html && String(template_content_html).trim()) {
      rawHtml = String(template_content_html);
    } else if (template_content && String(template_content).trim()) {
      rawHtml = String(template_content)
        .split(/\r?\n/)
        .map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
        .join("");
    } else {
      return new Response(JSON.stringify({ error: "template_content or template_content_html is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Inject filled values with type-aware formatting
    const filledHtml = fillTemplate(rawHtml, filled_data || {}, fields || []);

    // Parse to block list
    const blocks = parseHtmlToBlocks(filledHtml);

    // Build PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const fontBoldItalic = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 60;
    const contentWidth = pageWidth - margin * 2;

    // Embed logo
    let logoImage: any = null;
    let logoWidth = 0;
    let logoHeight = 0;
    if (logo_url) {
      try {
        const resp = await fetch(logo_url);
        if (resp.ok) {
          const bytes = new Uint8Array(await resp.arrayBuffer());
          const ct = resp.headers.get("content-type") || "";
          logoImage = ct.includes("png")
            ? await pdfDoc.embedPng(bytes)
            : await pdfDoc.embedJpg(bytes);
          const maxLogoHeight = 40;
          const maxLogoWidth = 200;
          const scale = Math.min(maxLogoWidth / logoImage.width, maxLogoHeight / logoImage.height, 1);
          logoWidth = logoImage.width * scale;
          logoHeight = logoImage.height * scale;
        }
      } catch (e) {
        console.warn("Logo embed warn:", e);
      }
    }

    const headerHeight = logoImage ? logoHeight + 25 : 0;

    const drawHeader = (p: PDFPage) => {
      if (!logoImage) return;
      const topY = pageHeight - margin;
      p.drawImage(logoImage, {
        x: margin,
        y: topY - logoHeight,
        width: logoWidth,
        height: logoHeight,
      });
      p.drawLine({
        start: { x: margin, y: topY - logoHeight - 8 },
        end: { x: pageWidth - margin, y: topY - logoHeight - 8 },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      });
    };

    // Initialize first page
    const firstPage = pdfDoc.addPage([pageWidth, pageHeight]);
    const ctx: RenderCtx = {
      pdfDoc, page: firstPage, font, fontBold, fontItalic, fontBoldItalic,
      pageWidth, pageHeight, margin, contentWidth,
      y: pageHeight - margin,
      pages: [firstPage],
      headerHeight,
      drawHeader,
    };
    drawHeader(firstPage);
    if (headerHeight > 0) ctx.y -= headerHeight;

    renderBlocks(ctx, blocks);

    // Page numbers
    const total = ctx.pages.length;
    ctx.pages.forEach((p, i) => {
      const txt = `${i + 1} / ${total}`;
      const w = font.widthOfTextAtSize(txt, 9);
      p.drawText(txt, {
        x: (pageWidth - w) / 2,
        y: margin - 20,
        size: 9, font, color: rgb(0.5, 0.5, 0.5),
      });
    });

    const pdfBytes = await pdfDoc.save();

    // Upload
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const safeName = (document_name || "documento")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `generated/${Date.now()}-${safeName}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("contact-files")
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error("Failed to upload PDF");
    }

    const { data: urlData } = supabase.storage
      .from("contact-files")
      .getPublicUrl(storagePath);

    return new Response(JSON.stringify({ pdf_url: urlData.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-document-pdf error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
