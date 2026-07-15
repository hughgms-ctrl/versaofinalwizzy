import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Assinatura on-read (display-only) dos ASSETS DE DESIGN de template guardados no
// bucket `contact-files`, que ficou PRIVADO na Fase B (plano-seguranca-storage-buckets,
// BUCKET 4). Cobre a logo do template (`<org_id>/template-logos/...`) e as imagens
// embutidas no content_html (`<org_id>/document-images/...`). A policy SELECT
// org-scoped da migration 20260715120000 habilita o front autenticado a
// createSignedUrl direto nesses paths.
//
// PRINCÍPIO CRÍTICO — EXIBIR ASSINADO, PERSISTIR CRU: content_html e logo_url são a
// fonte-da-verdade no banco e devem continuar com a URL PÚBLICA-formato
// (`/object/public/contact-files/...`). A signed URL (com `?token=` e TTL) é só para
// exibição. Por isso:
//   * signHtmlImages / useSignedHtml    → só na renderização (nunca no que se salva)
//   * stripSignedImages                 → normaliza signed → público ANTES de persistir
// Assim uma signed URL expirada nunca é gravada no banco.

const BUCKET = "contact-files";
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;
const SIGN_MARKER = `/storage/v1/object/sign/${BUCKET}/`;
const SIGN_TTL_SECONDS = 60 * 60 * 3; // 3h — folga p/ sessões longas de edição/preview

export function isContactFilesPublicUrl(url?: string | null): boolean {
  return !!url && url.includes(PUBLIC_MARKER);
}

// Extrai o path relativo dentro do bucket de uma URL público-formato do contact-files.
export function contactFilesPathFromPublicUrl(url?: string | null): string | null {
  if (!url) return null;
  const idx = url.indexOf(PUBLIC_MARKER);
  if (idx < 0) return null;
  const raw = url.slice(idx + PUBLIC_MARKER.length).split("?")[0].split("#")[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// Converte QUALQUER signed URL do contact-files de volta pro formato público cru
// (remove `/object/sign/...` + `?token=...`), preservando o host. Usar antes de
// PERSISTIR content_html vindo do editor (getHTML pode conter srcs assinados p/ exibição).
export function stripSignedImages(html?: string | null): string {
  if (!html) return html ?? "";
  return html.replace(
    /\/storage\/v1\/object\/sign\/contact-files\/([^"'?\s)]+)(\?[^"'\s)]*)?/gi,
    `/storage/v1/object/public/contact-files/$1`,
  );
}

// ─── Cache + batch de assinatura ────────────────────────────────────────────────
const cache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h local, bem abaixo do TTL do token

// Resolve várias URLs público-formato do contact-files para signed URLs numa única
// chamada (createSignedUrls). Retorna Map<urlOriginal, urlDeExibição>. URLs que não
// são do nosso bucket público (logo externa, base64, terceiros) voltam como estão.
export async function signContactFilesUrls(urls: Array<string | null | undefined>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const pathByUrl = new Map<string, string>();
  const uniquePaths = new Set<string>();

  for (const url of urls) {
    if (!url) continue;
    if (out.has(url) || pathByUrl.has(url)) continue;
    if (!isContactFilesPublicUrl(url)) {
      out.set(url, url);
      continue;
    }
    const cached = cache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      out.set(url, cached.url);
      continue;
    }
    const path = contactFilesPathFromPublicUrl(url);
    if (!path) {
      out.set(url, url);
      continue;
    }
    pathByUrl.set(url, path);
    uniquePaths.add(path);
  }

  if (uniquePaths.size > 0) {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(Array.from(uniquePaths), SIGN_TTL_SECONDS);
      if (error) throw error;
      const signedByPath = new Map<string, string>();
      for (const item of data || []) {
        if (item?.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
      }
      for (const [url, path] of pathByUrl) {
        const signed = signedByPath.get(path);
        if (signed) {
          cache.set(url, { url: signed, expiresAt: Date.now() + CACHE_TTL_MS });
          out.set(url, signed);
        } else {
          out.set(url, url); // fallback: URL crua (resolve enquanto o bucket for público)
        }
      }
    } catch (e) {
      console.error("signContactFilesUrls: falha ao assinar", e);
      for (const [url] of pathByUrl) out.set(url, url);
    }
  }

  return out;
}

// Extrai os src das <img> de um blob de HTML.
function extractImgSrcs(html: string): string[] {
  const out: string[] = [];
  const re = /<img\b[^>]*?\bsrc=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

// Reescreve (display-only) as <img src> público-formato do content_html para signed
// URLs. Normaliza antes (strip) qualquer signed URL solta para evitar token expirado.
export async function signHtmlImages(html?: string | null): Promise<string> {
  const normalized = stripSignedImages(html);
  if (!normalized) return normalized;
  const srcs = extractImgSrcs(normalized).filter(isContactFilesPublicUrl);
  if (srcs.length === 0) return normalized;
  const map = await signContactFilesUrls(srcs);
  let result = normalized;
  for (const raw of new Set(srcs)) {
    const signed = map.get(raw);
    if (signed && signed !== raw) result = result.split(raw).join(signed);
  }
  return result;
}

// ─── Hooks de exibição ───────────────────────────────────────────────────────────

// Resolve o signed URL de uma única URL (ex.: <img src> da logo). Devolve a rawUrl
// enquanto assina / se não for do nosso bucket.
export function useSignedContactFileUrl(rawUrl?: string | null): string | null {
  const initial = (): string | null => {
    if (!rawUrl) return null;
    if (!isContactFilesPublicUrl(rawUrl)) return rawUrl;
    const cached = cache.get(rawUrl);
    return cached && cached.expiresAt > Date.now() ? cached.url : rawUrl;
  };
  const [resolved, setResolved] = useState<string | null>(initial);

  useEffect(() => {
    let active = true;
    if (!rawUrl) {
      setResolved(null);
      return;
    }
    if (!isContactFilesPublicUrl(rawUrl)) {
      setResolved(rawUrl);
      return;
    }
    signContactFilesUrls([rawUrl]).then((m) => {
      if (active) setResolved(m.get(rawUrl) ?? rawUrl);
    });
    return () => {
      active = false;
    };
  }, [rawUrl]);

  return resolved;
}

// Resolve um blob de HTML com as <img> embutidas assinadas (display-only). Devolve o
// HTML cru enquanto assina.
export function useSignedHtml(rawHtml?: string | null): string {
  const [html, setHtml] = useState<string>(() => stripSignedImages(rawHtml));

  useEffect(() => {
    let active = true;
    const normalized = stripSignedImages(rawHtml);
    if (!normalized) {
      setHtml(normalized);
      return;
    }
    setHtml(normalized);
    signHtmlImages(normalized).then((h) => {
      if (active) setHtml(h);
    });
    return () => {
      active = false;
    };
  }, [rawHtml]);

  return html;
}
