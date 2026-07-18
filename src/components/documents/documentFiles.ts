import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Resolve signed URLs para PDFs de documentos guardados no bucket contact-files, que
// está sendo privatizado (plano-seguranca-storage-buckets, BUCKET 4, Fase A.4). As
// telas autenticadas de documentos não podem createSignedUrl direto (paths generated/
// e signatures/ não têm org na pasta), então delegam ao edge `sign-document-file`, que
// autoriza por org via RLS na linha do banco e assina via service_role.
//
// IMPORTANTE: só roteia pelo edge URLs que são do NOSSO bucket em formato PÚBLICO
// (`/storage/v1/object/public/contact-files/`). Qualquer outra coisa — link de
// assinatura (`/sign/<token>`), URL de terceiro, já-assinada ou nula — passa direto.
// Isso evita chamadas desnecessárias e preserva o comportamento atual.
//
// NÃO usar para PERSISTIR (ex.: salvar signed_pdf_url em contact_files.file_url): ali a
// URL deve continuar CRUA (público-formato), pois contactFiles.ts extrai o path dela na
// leitura. Este helper é só para EXIBIR/ABRIR/BAIXAR.

const PUBLIC_MARKER = "/storage/v1/object/public/contact-files/";

export type SignableDocTable = "generated_documents" | "document_signatures";

export interface DocFileRef {
  table: SignableDocTable;
  id: string;
  field: string;
  rawUrl?: string | null;
}

export function isContactFilesPublicUrl(url?: string | null): boolean {
  return !!url && url.includes(PUBLIC_MARKER);
}

// Extrai o path relativo dentro do bucket contact-files a partir de uma URL no formato
// público — usado ao SALVAR (ex.: copiar um PDF assinado do Wizzy Sign pra "Anexos" do
// contato), pra popular contact_files.storage_path corretamente em vez de null.
export function contactFilesPathFromUrl(url?: string | null): string | null {
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

function refKey(ref: DocFileRef): string {
  return `${ref.table}:${ref.id}:${ref.field}`;
}

// Cache path-de-doc -> signed URL. O TTL do signed URL é generoso no edge (3h); aqui
// guardamos com folga para não re-assinar a cada clique/re-render.
const cache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h de cache local (bem abaixo do TTL do token)

// Resolve várias refs numa única chamada ao edge (batch). Refs que não são do nosso
// bucket público voltam com a própria rawUrl, sem ir ao servidor.
export async function resolveDocFileUrls(refs: DocFileRef[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const toSign: DocFileRef[] = [];

  for (const ref of refs) {
    const key = refKey(ref);
    if (!isContactFilesPublicUrl(ref.rawUrl)) {
      out.set(key, ref.rawUrl ?? null);
      continue;
    }
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      out.set(key, cached.url);
      continue;
    }
    toSign.push(ref);
  }

  if (toSign.length > 0) {
    try {
      const { data, error } = await supabase.functions.invoke("sign-document-file", {
        body: {
          items: toSign.map((ref) => ({ key: refKey(ref), table: ref.table, id: ref.id, field: ref.field })),
        },
      });
      const signed = (data?.urls || {}) as Record<string, string | null>;
      if (error) throw error;
      for (const ref of toSign) {
        const key = refKey(ref);
        const url = signed[key] ?? null;
        if (url) cache.set(key, { url, expiresAt: Date.now() + CACHE_TTL_MS });
        // fallback: rawUrl (durante a Fase A o bucket ainda é público, então resolve)
        out.set(key, url ?? ref.rawUrl ?? null);
      }
    } catch (e) {
      console.error("resolveDocFileUrls: falha ao assinar", e);
      for (const ref of toSign) out.set(refKey(ref), ref.rawUrl ?? null);
    }
  }

  return out;
}

export async function resolveDocFileUrl(ref: DocFileRef): Promise<string | null> {
  const map = await resolveDocFileUrls([ref]);
  return map.get(refKey(ref)) ?? ref.rawUrl ?? null;
}

// Abre um PDF de documento em nova aba com signed URL. Abre a janela ANTES do await
// (dentro do gesto de clique) para não ser bloqueada por popup blocker.
export async function openDocFileInNewTab(ref: DocFileRef): Promise<void> {
  const win = window.open("", "_blank", "noopener,noreferrer");
  const url = await resolveDocFileUrl(ref);
  if (!url) {
    win?.close();
    return;
  }
  if (win) {
    win.location.href = url;
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// Hook de exibição (ex.: iframe): resolve o signed URL de uma ref. null enquanto assina.
export function useSignedDocFileUrl(ref: DocFileRef | null): string | null {
  const key = ref ? refKey(ref) : null;
  const rawUrl = ref?.rawUrl ?? null;
  const initial = (): string | null => {
    if (!ref) return null;
    if (!isContactFilesPublicUrl(rawUrl)) return rawUrl;
    const cached = key ? cache.get(key) : null;
    return cached && cached.expiresAt > Date.now() ? cached.url : null;
  };
  const [resolved, setResolved] = useState<string | null>(initial);

  useEffect(() => {
    let active = true;
    if (!ref) {
      setResolved(null);
      return;
    }
    if (!isContactFilesPublicUrl(rawUrl)) {
      setResolved(rawUrl);
      return;
    }
    const cached = key ? cache.get(key) : null;
    if (cached && cached.expiresAt > Date.now()) {
      setResolved(cached.url);
      return;
    }
    setResolved(null);
    resolveDocFileUrl(ref).then((u) => {
      if (active) setResolved(u);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rawUrl]);

  return resolved;
}
