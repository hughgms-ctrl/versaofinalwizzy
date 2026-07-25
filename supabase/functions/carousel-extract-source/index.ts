// =====================================================================
// carousel-extract-source — extrai o material de origem para gerar um
// carrossel a partir de um link de artigo/blog ou de um vídeo do YouTube
// (via transcrição/legenda pública). Texto colado direto não passa por
// aqui: o próprio front usa o valor digitado como source_content.
// =====================================================================
import { authenticateUser, errorResponse, handleCors, jsonResponse } from "../_shared/middleware.ts";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const MAX_CONTENT_CHARS = 12000;

interface Body {
  type: "link" | "youtube";
  value: string;
}

class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new HttpError("Tempo esgotado ao buscar o conteúdo. Tente novamente.", 504);
  } finally {
    clearTimeout(id);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|header|footer|noscript|svg|form|aside)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|section|article|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function parseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError("Link inválido");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError("Link inválido");
  }
  return url;
}

// ---------------------------------------------------------------------
// Artigo / blog: baixa o HTML e extrai o texto legível (sem parser DOM —
// a limpeza aqui só remove ruído; a IA na geração já sabe ignorar o que
// sobrar de menu/propaganda e focar no conteúdo real).
// ---------------------------------------------------------------------
async function extractWebArticle(raw: string): Promise<{ title: string; content: string }> {
  const url = parseUrl(raw);
  const res = await fetchWithTimeout(url.toString(), {
    headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" },
  });
  if (!res.ok) throw new HttpError(`Não foi possível acessar o link (HTTP ${res.status})`, 502);
  const html = await res.text();

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim().slice(0, 200) : "";

  const content = decodeEntities(stripHtml(html))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();

  if (content.length < 200) {
    throw new HttpError("Não consegui extrair um conteúdo legível desse link.", 422);
  }

  return { title, content: content.slice(0, MAX_CONTENT_CHARS) };
}

// ---------------------------------------------------------------------
// YouTube: lê a página pública do vídeo e usa a trilha de legenda/CC
// disponível (a mesma que aparece no player) para montar a transcrição.
// Não usa API paga nem autenticação — só o que já é público no player.
// ---------------------------------------------------------------------
function extractYoutubeId(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.slice(1).split("/")[0] || null;
    }
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2] || null;
      if (url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2] || null;
      return url.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

function extractBalancedArray(text: string, fromIndex: number): string | null {
  const start = text.indexOf("[", fromIndex);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

async function extractYoutubeTranscript(raw: string): Promise<{ title: string; content: string }> {
  const videoId = extractYoutubeId(raw);
  if (!videoId) throw new HttpError("Link do YouTube inválido");

  const res = await fetchWithTimeout(`https://www.youtube.com/watch?v=${videoId}&hl=pt-BR`, {
    headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" },
  });
  if (!res.ok) throw new HttpError(`Não foi possível acessar o vídeo (HTTP ${res.status})`, 502);
  const html = await res.text();

  let title = "";
  const titleJsonMatch = html.match(/"title":"((?:[^"\\]|\\.)*)"/);
  if (titleJsonMatch) {
    try {
      title = JSON.parse(`"${titleJsonMatch[1]}"`);
    } catch {
      title = "";
    }
  }
  if (!title) {
    const tagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    title = tagMatch ? decodeEntities(tagMatch[1]).replace(/\s*-\s*YouTube$/, "").trim() : "";
  }

  const marker = html.indexOf('"captionTracks"');
  if (marker === -1) {
    throw new HttpError("Esse vídeo não tem legendas/transcrição disponível.", 422);
  }
  const arrayJson = extractBalancedArray(html, marker);
  if (!arrayJson) throw new HttpError("Não consegui ler as legendas desse vídeo.", 422);

  let tracks: Array<{ baseUrl: string; languageCode?: string }>;
  try {
    tracks = JSON.parse(arrayJson);
  } catch {
    throw new HttpError("Não consegui ler as legendas desse vídeo.", 422);
  }
  if (!tracks?.length) {
    throw new HttpError("Esse vídeo não tem legendas/transcrição disponível.", 422);
  }

  const track =
    tracks.find((t) => t.languageCode?.startsWith("pt")) ??
    tracks.find((t) => t.languageCode?.startsWith("en")) ??
    tracks[0];

  const capRes = await fetchWithTimeout(track.baseUrl, { headers: { "User-Agent": UA } });
  if (!capRes.ok) throw new HttpError("Não consegui baixar a transcrição desse vídeo.", 502);
  const xml = await capRes.text();

  const content = decodeEntities(
    Array.from(xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g))
      .map((m) => m[1])
      .join(" "),
  )
    .replace(/\s+/g, " ")
    .trim();

  if (content.length < 50) {
    throw new HttpError("Esse vídeo não tem legendas/transcrição disponível.", 422);
  }

  return { title, content: content.slice(0, MAX_CONTENT_CHARS) };
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    await authenticateUser(req);
    const body = (await req.json()) as Body;
    const value = body?.value?.trim();
    if (!value) return errorResponse("Informe um link", 400);

    if (body.type === "youtube") {
      return jsonResponse(await extractYoutubeTranscript(value));
    }
    if (body.type === "link") {
      return jsonResponse(await extractWebArticle(value));
    }
    return errorResponse("Tipo de fonte inválido", 400);
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    return errorResponse((err as Error).message ?? "Erro ao extrair conteúdo", status);
  }
});
