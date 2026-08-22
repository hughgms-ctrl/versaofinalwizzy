import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { fetchBytesOrDownload } from "../_shared/storageDownload.ts";

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
type InlineRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  fontSize?: number; // in points
};
type Block =
  | { type: "p" | "h1" | "h2" | "h3"; runs: InlineRun[]; align?: "left" | "center" | "right" | "justify" }
  | { type: "li"; ordered: boolean; index: number; runs: InlineRun[] }
  | { type: "spacer"; height: number }
  | { type: "hr" }
  | { type: "bars"; title?: string; items: Array<{ label: string; value: number }> }
  // Numeros grandes lado a lado. `display` guarda o texto como foi escrito
  // ("8.7", "8,7") -- o numero so e parseado para VALIDAR a linha; reescrever
  // trocaria a virgula de quem digitou por um ponto sem motivo.
  | { type: "numbers"; items: Array<{ label: string; display: string }> }
  | { type: "progress"; title?: string; value: number; total: number }
  | { type: "line"; title?: string; items: Array<{ label: string; value: number }> };

function parseFontSizeFromStyle(style: string | null | undefined): number | undefined {
  if (!style) return undefined;
  const m = /font-size\s*:\s*([\d.]+)\s*(px|pt|em|rem)?/i.exec(style);
  if (!m) return undefined;
  const value = parseFloat(m[1]);
  const unit = (m[2] || "px").toLowerCase();
  if (!Number.isFinite(value)) return undefined;
  // Convert to points (PDF unit). 1pt = 1.333px, 1em ≈ 11pt baseline.
  if (unit === "pt") return value;
  if (unit === "px") return value * 0.75;
  if (unit === "em" || unit === "rem") return value * 11;
  return value;
}

function parseInlineRuns(html: string): InlineRun[] {
  // Tracks bold/italic/underline/strike depths and a font-size stack.
  const runs: InlineRun[] = [];
  let bold = 0;
  let italic = 0;
  let underline = 0;
  let strike = 0;
  const fontSizeStack: Array<number | undefined> = [];
  let buf = "";
  const currentFontSize = () => {
    for (let i = fontSizeStack.length - 1; i >= 0; i--) {
      if (fontSizeStack[i] !== undefined) return fontSizeStack[i];
    }
    return undefined;
  };
  const flush = () => {
    if (buf.length === 0) return;
    runs.push({
      text: decodeHtmlEntities(buf),
      bold: bold > 0,
      italic: italic > 0,
      underline: underline > 0,
      strike: strike > 0,
      fontSize: currentFontSize(),
    });
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
      } else if (name === "u") {
        flush();
        underline += closing ? -1 : 1;
        if (underline < 0) underline = 0;
      } else if (name === "s" || name === "strike" || name === "del") {
        flush();
        strike += closing ? -1 : 1;
        if (strike < 0) strike = 0;
      } else if (name === "span" || name === "font") {
        flush();
        if (closing) {
          fontSizeStack.pop();
        } else {
          const styleAttr = getAttr(tok, "style");
          const size = parseFontSizeFromStyle(styleAttr);
          fontSizeStack.push(size);
        }
      }
      // ignore other inline tags - text inside still processed
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

// ====================== Diretiva de grafico de barras ======================
// Formato aceito dentro do texto puro do template:
//   [[GRAFICO Abertura a mentoria]]
//   Faria muita | 12
//   Talvez | 7
//   [[/GRAFICO]]
// Grupo 1 = titulo (pode vir vazio), grupo 2 = as linhas "rotulo | numero".
// A extracao tem que acontecer ANTES do escape de HTML: se a diretiva passar
// pelo replace de "<" ela vira texto literal no PDF.
// As tres diretivas novas -- [[NUMEROS]], [[PROGRESSO t]], [[LINHA t]] -- entram
// pela MESMA porta: uma so varredura, com o nome capturado e o fechamento casado
// por retrovisor (\1). Duas varreduras separadas perderiam a ordem entre
// diretivas de tipos diferentes dentro do mesmo texto.
const RE_DIRETIVA = /\[\[(GRAFICO|NUMEROS|PROGRESSO|LINHA)([^\]]*)\]\]\s*([\s\S]*?)\[\[\/\1\]\]/g;

type DirectiveKind = "GRAFICO" | "NUMEROS" | "PROGRESSO" | "LINHA";

/** Linhas "rotulo | valor" de um corpo de diretiva. Linha torta e descartada com aviso. */
function parseLabeledLines(
  kind: string,
  body: string,
): Array<{ label: string; display: string; value: number }> {
  const items: Array<{ label: string; display: string; value: number }> = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const sep = line.lastIndexOf("|");
    if (sep < 0) {
      console.warn(`[PDF] ${kind}: linha sem "|" ignorada: ${line.slice(0, 80)}`);
      continue;
    }
    const label = sanitizeWinAnsi(decodeHtmlEntities(line.slice(0, sep).trim()));
    const display = sanitizeWinAnsi(decodeHtmlEntities(line.slice(sep + 1).trim()));
    const value = parseFloat(display.replace(",", "."));
    // Uma diretiva torta nao pode derrubar o PDF inteiro -- mas tambem nao pode
    // sumir sem deixar rastro, senao o relatorio sai com um item a menos e
    // ninguem descobre por que.
    if (!label || !Number.isFinite(value)) {
      console.warn(`[PDF] ${kind}: linha ignorada (rotulo ou numero invalido): ${line.slice(0, 80)}`);
      continue;
    }
    items.push({ label, display, value });
  }
  return items;
}

function cleanDirectiveTitle(title: string): string | undefined {
  return sanitizeWinAnsi(decodeHtmlEntities(title.trim())) || undefined;
}

function parseBarsDirective(title: string, body: string): Block | null {
  const items = parseLabeledLines("GRAFICO", body).map((it) => ({
    label: it.label,
    value: Math.max(0, it.value),
  }));
  if (items.length === 0) {
    console.warn("[PDF] GRAFICO: nenhum item valido, bloco removido.");
    return null;
  }
  return { type: "bars", title: cleanDirectiveTitle(title), items };
}

function parseNumbersDirective(body: string): Block | null {
  const items = parseLabeledLines("NUMEROS", body).map((it) => ({
    label: it.label,
    display: it.display,
  }));
  if (items.length === 0) {
    console.warn("[PDF] NUMEROS: nenhum item valido, bloco removido.");
    return null;
  }
  return { type: "numbers", items };
}

function parseProgressDirective(title: string, body: string): Block | null {
  // Aqui o formato e "parte | todo", nao "rotulo | numero": as duas metades sao
  // numero, e quem nomeia a barra e o titulo da diretiva.
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  if (lines.length === 0) {
    console.warn("[PDF] PROGRESSO: bloco sem dados, removido.");
    return null;
  }
  if (lines.length > 1) {
    console.warn(`[PDF] PROGRESSO: ${lines.length} linhas no bloco, so a primeira e usada.`);
  }
  const sep = lines[0].lastIndexOf("|");
  if (sep < 0) {
    console.warn(`[PDF] PROGRESSO: linha sem "|", bloco removido: ${lines[0].slice(0, 80)}`);
    return null;
  }
  const value = parseFloat(lines[0].slice(0, sep).trim().replace(",", "."));
  const total = parseFloat(lines[0].slice(sep + 1).trim().replace(",", "."));
  // Todo zero ou negativo nao e "0%": e uma pergunta sem denominador. Melhor o
  // bloco sumir com aviso do que desenhar uma barra que nao quer dizer nada.
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    console.warn(`[PDF] PROGRESSO: numeros invalidos, bloco removido: ${lines[0].slice(0, 80)}`);
    return null;
  }
  return { type: "progress", title: cleanDirectiveTitle(title), value: Math.max(0, value), total };
}

function parseLineDirective(title: string, body: string): Block | null {
  // ORDEM PRESERVADA de proposito: no grafico de linha a ordem E o eixo x.
  const items = parseLabeledLines("LINHA", body).map((it) => ({
    label: it.label,
    value: it.value,
  }));
  if (items.length === 0) {
    console.warn("[PDF] LINHA: nenhum item valido, bloco removido.");
    return null;
  }
  return { type: "line", title: cleanDirectiveTitle(title), items };
}

function parseChartDirective(kind: DirectiveKind, title: string, body: string): Block | null {
  if (kind === "NUMEROS") return parseNumbersDirective(body);
  if (kind === "PROGRESSO") return parseProgressDirective(title, body);
  if (kind === "LINHA") return parseLineDirective(title, body);
  return parseBarsDirective(title, body);
}

/**
 * Maximo do eixo y arredondado para cima num numero redondo. Sem isso o topo do
 * grafico cai exatamente no maior valor e o ponto mais alto encosta na borda.
 */
function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value - 1e-9) return candidate;
  }
  return magnitude * 10;
}

/** O numero ao lado de uma marca: inteiro fica inteiro, resto com uma casa. */
function formatChartValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function truncateToWidth(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(out + "...", size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + "...";
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

type LineToken = { run: InlineRun; width: number; size: number };

function wrapRuns(ctx: RenderCtx, runs: InlineRun[], maxWidth: number, baseFontSize: number): LineToken[][] {
  // Tokenize each run by whitespace; wrap into lines preserving formatting.
  // Each run can have its own fontSize (in points), falling back to baseFontSize.
  const lines: LineToken[][] = [];
  let currentLine: LineToken[] = [];
  let currentWidth = 0;

  const pushLine = () => {
    lines.push(currentLine);
    currentLine = [];
    currentWidth = 0;
  };

  for (const run of runs) {
    const fontRef = pickFont(ctx, run.bold, run.italic);
    const size = run.fontSize && run.fontSize > 0 ? run.fontSize : baseFontSize;
    const cleanedText = sanitizeWinAnsi(run.text);
    // Split keeping newlines as line breaks
    const paragraphs = cleanedText.split("\n");
    for (let pi = 0; pi < paragraphs.length; pi++) {
      const para = paragraphs[pi];
      const tokens = para.split(/(\s+)/).filter((t) => t.length > 0);
      for (const token of tokens) {
        if (/^\s+$/.test(token)) {
          if (currentLine.length === 0) continue;
          const sw = fontRef.widthOfTextAtSize(" ", size);
          if (currentWidth + sw > maxWidth) {
            pushLine();
          } else {
            currentLine.push({ run: { ...run, text: " " }, width: sw, size });
            currentWidth += sw;
          }
        } else {
          const w = fontRef.widthOfTextAtSize(token, size);
          if (currentWidth + w > maxWidth && currentLine.length > 0) {
            pushLine();
          }
          if (w > maxWidth) {
            // hard break long token
            let buf = "";
            let bufW = 0;
            for (const ch of token) {
              const cw = fontRef.widthOfTextAtSize(ch, size);
              if (bufW + cw > maxWidth && buf.length > 0) {
                currentLine.push({ run: { ...run, text: buf }, width: bufW, size });
                pushLine();
                buf = ch;
                bufW = cw;
              } else {
                buf += ch;
                bufW += cw;
              }
            }
            if (buf.length > 0) {
              currentLine.push({ run: { ...run, text: buf }, width: bufW, size });
              currentWidth = bufW;
            }
          } else {
            currentLine.push({ run: { ...run, text: token }, width: w, size });
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

function drawTextLine(
  ctx: RenderCtx,
  line: LineToken[],
  baseFontSize: number,
  baseLineHeight: number,
  align: "left" | "center" | "right" | "justify" = "left",
  color = rgb(0.1, 0.1, 0.1),
) {
  // Effective line height: respect the largest run size on this line.
  const maxSize = line.reduce((m, t) => Math.max(m, t.size), baseFontSize);
  const lineHeight = Math.max(baseLineHeight, maxSize * 1.4);
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

  // Baseline so larger text shares the same baseline as smaller runs.
  const baselineY = ctx.y - maxSize;

  for (const tok of line) {
    const fontRef = pickFont(ctx, tok.run.bold, tok.run.italic);
    ctx.page.drawText(tok.run.text, {
      x,
      y: baselineY,
      size: tok.size,
      font: fontRef,
      color,
    });
    if (tok.run.underline && tok.run.text.trim().length > 0) {
      ctx.page.drawLine({
        start: { x, y: baselineY - 1 },
        end: { x: x + tok.width, y: baselineY - 1 },
        thickness: Math.max(0.5, tok.size / 18),
        color,
      });
    }
    if (tok.run.strike && tok.run.text.trim().length > 0) {
      ctx.page.drawLine({
        start: { x, y: baselineY + tok.size * 0.32 },
        end: { x: x + tok.width, y: baselineY + tok.size * 0.32 },
        thickness: Math.max(0.5, tok.size / 18),
        color,
      });
    }
    x += tok.width + (align === "justify" && tok.run.text === " " ? extraSpaceWidth : 0);
  }
  ctx.y -= lineHeight;
}

// Uma cor so, em todos os graficos. Cada grafico daqui tem UMA serie: cor
// variando por marca sugere uma categoria que nao existe. O texto nunca sai na
// cor da marca -- rotulo colorido vira legenda de um agrupamento inexistente.
const CHART_ACCENT = rgb(0.15, 0.35, 0.65);
const CHART_TRACK = rgb(0.91, 0.91, 0.93);
const CHART_TEXT = rgb(0.1, 0.1, 0.1);
const CHART_VALUE = rgb(0.25, 0.25, 0.25);
const CHART_MUTED = rgb(0.45, 0.45, 0.45);
const CHART_RULE = rgb(0.8, 0.8, 0.8);

/**
 * Titulo de diretiva de grafico. Igual nos quatro tipos, por isso mora aqui.
 *
 * `keepWith` e a altura do primeiro pedaco desenhavel do grafico, e entra no
 * ensureSpace junto com o titulo: sem isso o titulo cabe no rodape, o grafico
 * nao, e a pagina termina com um titulo sozinho anunciando algo que so aparece
 * na pagina seguinte.
 */
function drawChartTitle(ctx: RenderCtx, title: string | undefined, keepWith = 0): void {
  if (!title) return;
  ensureSpace(ctx, 20 + keepWith);
  ctx.page.drawText(title, {
    x: ctx.margin,
    y: ctx.y - 12,
    size: 12,
    font: ctx.fontBold,
    color: CHART_TEXT,
  });
  ctx.y -= 20;
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
    if (block.type === "bars") {
      const items = block.items;
      if (items.length === 0) continue;

      // 18 e a altura de uma barra: o titulo so e escrito se a primeira barra
      // couber junto com ele.
      drawChartTitle(ctx, block.title, 18);

      // Coluna de rotulos: o maior rotulo, com teto de 40% da largura util.
      const labelSize = 9;
      const maxLabelWidth = ctx.contentWidth * 0.4;
      const labels = items.map((it) => truncateToWidth(ctx.font, it.label, labelSize, maxLabelWidth));
      const labelColumn = labels.reduce((m, l) => Math.max(m, ctx.font.widthOfTextAtSize(l, labelSize)), 0);
      const valueColumn = 34; // espaco reservado para o numero depois da barra
      const trackWidth = Math.max(20, ctx.contentWidth - labelColumn - 8 - valueColumn);
      // O ", 1" evita divisao por zero quando todo mundo respondeu zero.
      const maxValue = Math.max(...items.map((i) => i.value), 1);

      for (let i = 0; i < items.length; i++) {
        // ensureSpace por item (e nao antes do grafico inteiro): um grafico
        // grande quebra entre paginas em vez de estourar a margem.
        ensureSpace(ctx, 18);
        // A origem do drawRectangle e o canto inferior esquerdo e ctx.y desce,
        // entao a barra comeca em ctx.y - 12.
        const barY = ctx.y - 12;
        const barX = ctx.margin + labelColumn + 8;
        ctx.page.drawText(labels[i], {
          x: ctx.margin,
          y: barY + 3,
          size: labelSize,
          font: ctx.font,
          color: rgb(0.1, 0.1, 0.1),
        });
        ctx.page.drawRectangle({
          x: barX,
          y: barY,
          width: trackWidth,
          height: 12,
          color: CHART_TRACK,
        });
        // Minimo de 2pt: barra de largura zero some e parece bug, e a diferenca
        // entre "ninguem" e "um" precisa ficar visivel.
        const filled = Math.max(2, (items[i].value / maxValue) * trackWidth);
        ctx.page.drawRectangle({
          x: barX,
          y: barY,
          width: filled,
          height: 12,
          color: CHART_ACCENT,
        });
        ctx.page.drawText(formatChartValue(items[i].value), {
          x: barX + filled + 5,
          y: barY + 3,
          size: labelSize,
          font: ctx.font,
          color: CHART_VALUE,
        });
        ctx.y -= 18;
      }
      ctx.y -= 6;
      continue;
    }
    if (block.type === "numbers") {
      const items = block.items;
      if (items.length === 0) continue;

      // Ate 4 por fileira. Acima disso quebra em fileiras EQUILIBRADAS -- sete
      // itens viram 4+3, nao 4+4 com um sozinho embaixo, que parece erro de
      // diagramacao em vez de decisao.
      const rows = Math.ceil(items.length / 4);
      const perRow = Math.ceil(items.length / rows);
      const numberSize = 24;
      const labelSize = 9;
      const rowHeight = numberSize + labelSize + 14;

      for (let r = 0; r < rows; r++) {
        const slice = items.slice(r * perRow, (r + 1) * perRow);
        if (slice.length === 0) continue;
        // ensureSpace por FILEIRA: a fileira e a unidade que nao pode ser
        // partida. Numero numa pagina e rotulo na seguinte nao e um numero
        // grande, e um numero sem legenda.
        ensureSpace(ctx, rowHeight);
        const colWidth = ctx.contentWidth / perRow;

        for (let c = 0; c < slice.length; c++) {
          const x = ctx.margin + c * colWidth;
          const inner = Math.max(20, colWidth - 10);
          ctx.page.drawText(truncateToWidth(ctx.fontBold, slice[c].display, numberSize, inner), {
            x,
            y: ctx.y - numberSize,
            size: numberSize,
            font: ctx.fontBold,
            color: CHART_TEXT,
          });
          ctx.page.drawText(truncateToWidth(ctx.font, slice[c].label, labelSize, inner), {
            x,
            y: ctx.y - numberSize - labelSize - 4,
            size: labelSize,
            font: ctx.font,
            color: CHART_MUTED,
          });
        }
        ctx.y -= rowHeight;
      }
      ctx.y -= 6;
      continue;
    }
    if (block.type === "progress") {
      drawChartTitle(ctx, block.title, 24);
      ensureSpace(ctx, 24);

      const labelSize = 9;
      const ratio = block.value / block.total;
      const caption = `${formatChartValue(block.value)} de ${formatChartValue(block.total)} (${Math.round(ratio * 100)}%)`;
      const captionWidth = ctx.font.widthOfTextAtSize(caption, labelSize);
      const trackWidth = Math.max(20, ctx.contentWidth - captionWidth - 8);
      const barY = ctx.y - 12;

      ctx.page.drawRectangle({
        x: ctx.margin, y: barY, width: trackWidth, height: 12, color: CHART_TRACK,
      });
      // A barra e limitada ao trilho mesmo quando a parte passa do todo, mas a
      // legenda continua dizendo a porcentagem real -- barra estourando a
      // margem esconderia o dado torto em vez de mostra-lo. O minimo de 2pt e o
      // mesmo das barras: zero precisa continuar visivel.
      ctx.page.drawRectangle({
        x: ctx.margin,
        y: barY,
        width: Math.max(2, Math.min(1, ratio) * trackWidth),
        height: 12,
        color: CHART_ACCENT,
      });
      ctx.page.drawText(caption, {
        x: ctx.margin + trackWidth + 8,
        y: barY + 3,
        size: labelSize,
        font: ctx.font,
        color: CHART_VALUE,
      });
      ctx.y -= 24;
      continue;
    }
    if (block.type === "line") {
      const items = block.items;
      if (items.length === 0) continue;

      const labelSize = 8;
      const valueSize = 9;
      const plotHeight = 90;
      const chartHeight = plotHeight + labelSize + 10;
      // Aqui o ensureSpace e do GRAFICO INTEIRO, e nao por item como nas barras.
      // Barra partida entre paginas continua legivel porque cada barra e um item
      // fechado em si; meia linha nao e meia linha, e uma linha errada.
      drawChartTitle(ctx, block.title, chartHeight + 6);
      ensureSpace(ctx, chartHeight + 6);

      const lastValue = formatChartValue(items[items.length - 1].value);
      // Folga a direita para o valor do ultimo ponto nao sair pela margem.
      const rightPad = ctx.fontBold.widthOfTextAtSize(lastValue, valueSize) + 8;
      const plotWidth = Math.max(20, ctx.contentWidth - rightPad);
      const baselineY = ctx.y - plotHeight;
      const topValue = niceCeil(Math.max(...items.map((i) => i.value), 0));
      const pointX = (i: number) =>
        items.length === 1 ? ctx.margin + plotWidth / 2 : ctx.margin + (i / (items.length - 1)) * plotWidth;
      const pointY = (v: number) => baselineY + (Math.max(0, v) / topValue) * plotHeight;

      // Sem grade: so a linha de base, fina e clara, marcando o zero.
      ctx.page.drawLine({
        start: { x: ctx.margin, y: baselineY },
        end: { x: ctx.margin + ctx.contentWidth, y: baselineY },
        thickness: 0.5,
        color: CHART_RULE,
      });

      for (let i = 1; i < items.length; i++) {
        ctx.page.drawLine({
          start: { x: pointX(i - 1), y: pointY(items[i - 1].value) },
          end: { x: pointX(i), y: pointY(items[i].value) },
          thickness: 1.2,
          color: CHART_ACCENT,
        });
      }
      // O ponto e desenhado na posicao REAL. Um valor zero fica sobre a linha de
      // base e continua visivel porque a marca tem raio proprio -- empurra-lo
      // 2pt para cima, como se faz com a barra, mentiria sobre onde ele esta.
      for (let i = 0; i < items.length; i++) {
        ctx.page.drawCircle({ x: pointX(i), y: pointY(items[i].value), size: 2.2, color: CHART_ACCENT });
      }

      // Rotulos do eixo x. Com muitos pontos eles nao cabem todos, e escrever um
      // por ponto vira tarja ilegivel. A saida NAO e apertar todos: e escrever
      // menos rotulos, cada um com a largura que sobra dos vizinhos pulados.
      // Trinta pontos com "Edica..." trinta vezes nao dizem nada; seis rotulos
      // inteiros, salteados, dizem onde a linha comeca e termina.
      const slotWidth = items.length > 1 ? plotWidth / (items.length - 1) : plotWidth;
      const widest = items.reduce((m, it) => Math.max(m, ctx.font.widthOfTextAtSize(it.label, labelSize)), 0);
      const fitCount = Math.max(2, Math.floor(plotWidth / Math.max(1, widest + 10)));
      const step = items.length > 1 ? Math.max(1, Math.ceil((items.length - 1) / (fitCount - 1))) : 1;
      // As duas pontas entram sempre: numa linha do tempo, o comeco e o fim sao
      // os dois rotulos que alguem realmente procura.
      const wanted = new Set<number>([0, items.length - 1]);
      for (let i = 0; i < items.length; i += step) wanted.add(i);

      let lastRight = -Infinity;
      for (let i = 0; i < items.length; i++) {
        if (!wanted.has(i)) continue;
        const text = truncateToWidth(ctx.font, items[i].label, labelSize, Math.max(28, slotWidth * step));
        const width = ctx.font.widthOfTextAtSize(text, labelSize);
        let x = pointX(i) - width / 2;
        if (x < ctx.margin) x = ctx.margin;
        if (x + width > ctx.margin + ctx.contentWidth) x = ctx.margin + ctx.contentWidth - width;
        if (x < lastRight + 4) continue;
        ctx.page.drawText(text, {
          x, y: baselineY - labelSize - 4, size: labelSize, font: ctx.font, color: CHART_MUTED,
        });
        lastRight = x + width;
      }

      // O valor escrito so no ultimo ponto: o grafico responde "como esta
      // mudando", e o numero de hoje e o unico que alguem vai querer citar.
      const lastIdx = items.length - 1;
      ctx.page.drawText(lastValue, {
        x: Math.min(
          pointX(lastIdx) + 5,
          ctx.margin + ctx.contentWidth - ctx.fontBold.widthOfTextAtSize(lastValue, valueSize),
        ),
        y: pointY(items[lastIdx].value) - 3,
        size: valueSize,
        font: ctx.fontBold,
        color: CHART_TEXT,
      });

      ctx.y -= chartHeight + 6;
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
    let {
      template_content,
      template_content_html,
      filled_data,
      fields,
      document_name,
      logo_url,
    } = body;
    const generatedDocumentId: string | undefined = body.generated_document_id;

    // Onde o PDF vai morar. `private` (default) = comportamento de sempre:
    // contact-files, privado desde 20260715120000. Quem le ali e o front, que
    // assina on-read (resolveDocFileUrl) — a URL publica devolvida abaixo nao
    // abre sozinha, e nunca precisou.
    //
    // `public` existe para o PDF que sera ENTREGUE por um terceiro sem
    // credencial: Evolution/UAZAPI baixam a URL do lado delas para mandar o
    // documento no WhatsApp, e URL de bucket privado da 403 la. Esse caso vai
    // para flow-media, publico exatamente por esse motivo (20260714130000).
    const visibility: "private" | "public" = body.visibility === "public" ? "public" : "private";
    const organizationId: string | undefined = body.organization_id;

    if (visibility === "public" && !organizationId) {
      return new Response(JSON.stringify({ error: "organization_id is required when visibility is 'public'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client (also used for the "load by id" shortcut)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Shortcut: when only generated_document_id is provided, hydrate from DB.
    // Used by public-document-fill and signature-load-document fallback.
    if (generatedDocumentId && !template_content && !template_content_html) {
      const { data: gd, error: gdErr } = await supabase
        .from("generated_documents")
        .select("id, name, filled_data, template_id, pdf_url")
        .eq("id", generatedDocumentId)
        .maybeSingle();
      if (gdErr || !gd) {
        return new Response(JSON.stringify({ error: "generated_document not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // If already generated, just return the existing URL.
      if (gd.pdf_url) {
        return new Response(JSON.stringify({ pdf_url: gd.pdf_url, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!gd.template_id) {
        return new Response(JSON.stringify({ error: "document has no template" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: tpl } = await supabase
        .from("document_templates")
        .select("name, content, content_html, fields, logo_url")
        .eq("id", gd.template_id)
        .maybeSingle();
      if (!tpl) {
        return new Response(JSON.stringify({ error: "template not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      template_content = tpl.content;
      template_content_html = tpl.content_html;
      filled_data = gd.filled_data || {};
      fields = tpl.fields || [];
      document_name = gd.name || tpl.name || "documento";
      logo_url = tpl.logo_url || logo_url;
    }

    // Fonte do conteudo: prefere o HTML rico e cai para o texto puro em <p>.
    // No caminho do texto puro, as diretivas [[GRAFICO]] sao extraidas ANTES do
    // escape de "<": se passassem por ele virariam texto literal no PDF.
    type Segment =
      | { kind: "text"; text: string }
      | { kind: "chart"; directive: DirectiveKind; title: string; body: string };
    const segments: Segment[] = [];
    let richHtml: string | null = null;

    if (template_content_html && String(template_content_html).trim()) {
      richHtml = String(template_content_html);
    } else if (template_content && String(template_content).trim()) {
      const plain = String(template_content);
      RE_DIRETIVA.lastIndex = 0;
      let cursor = 0;
      let m: RegExpExecArray | null;
      while ((m = RE_DIRETIVA.exec(plain)) !== null) {
        if (m.index > cursor) segments.push({ kind: "text", text: plain.slice(cursor, m.index) });
        segments.push({
          kind: "chart",
          directive: m[1] as DirectiveKind,
          title: m[2] || "",
          body: m[3] || "",
        });
        cursor = m.index + m[0].length;
      }
      if (cursor < plain.length) segments.push({ kind: "text", text: plain.slice(cursor) });
    } else {
      return new Response(JSON.stringify({ error: "template_content or template_content_html is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Inject filled values with type-aware formatting
    const fill = (value: string) => fillTemplate(value, filled_data || {}, fields || []);

    // Monta os blocos pedaco a pedaco, na ordem em que aparecem no texto.
    const blocks: Block[] = [];
    if (richHtml !== null) {
      blocks.push(...parseHtmlToBlocks(fill(richHtml)));
    } else {
      for (const seg of segments) {
        if (seg.kind === "chart") {
          const chart = parseChartDirective(seg.directive, fill(seg.title), fill(seg.body));
          if (chart) blocks.push(chart);
          continue;
        }
        const html = seg.text
          .split(/\r?\n/)
          .map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
          .join("");
        blocks.push(...parseHtmlToBlocks(fill(html)));
      }
    }

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
        // Logo pode ser um objeto do contact-files (template-logos/...) que, após a
        // privatização do bucket, não resolve mais por fetch(publicUrl). O helper baixa
        // via service_role pelo path quando for do nosso bucket; senão faz fetch.
        const bytes = await fetchBytesOrDownload(logo_url, supabase);
        if (bytes) {
          // Sem content-type do download: tenta PNG e cai pra JPG.
          try {
            logoImage = await pdfDoc.embedPng(bytes);
          } catch {
            logoImage = await pdfDoc.embedJpg(bytes);
          }
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

    // Upload (re-uses the supabase client created at the top of the handler)
    const safeName = (document_name || "documento")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageBucket = visibility === "public" ? "flow-media" : "contact-files";
    // flow-media e escrito sob `${orgId}/...` (write escopado por org na
    // 20260714130000). Este upload e service_role e ignora RLS, mas seguir a
    // convencao mantem o bucket navegavel e deixa a policy valer se um dia o
    // front precisar mexer nesses arquivos.
    const storagePath = visibility === "public"
      ? `${organizationId}/generated-pdfs/${Date.now()}-${safeName}.pdf`
      : `generated/${Date.now()}-${safeName}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from(storageBucket)
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error("Failed to upload PDF");
    }

    const { data: urlData } = supabase.storage
      .from(storageBucket)
      .getPublicUrl(storagePath);

    // When invoked with a generated_document_id, persist the URL on the row
    // so future loads (signature page, lists) can show the PDF immediately.
    if (generatedDocumentId) {
      await supabase
        .from("generated_documents")
        .update({ pdf_url: urlData.publicUrl, status: "generated" })
        .eq("id", generatedDocumentId);
    }

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
