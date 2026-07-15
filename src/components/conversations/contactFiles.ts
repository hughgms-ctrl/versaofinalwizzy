import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Bucket `contact-files` está sendo privatizado (plano-seguranca-storage-buckets,
// Fase A do BUCKET 4). A leitura deixa de usar a URL pública salva em
// contact_files.file_url e passa a gerar signed URL sob demanda. Espelha
// src/components/conversations/contactAvatars.ts (mesma estratégia de batch/cache).
//
// FASE A (backward-compatible): o bucket ainda é PÚBLICO enquanto este código sobe,
// então signed URL e download funcionam de sobra (SELECT ainda aberto). Se a
// assinatura falhar por qualquer motivo, cai no fallback (a URL pública original),
// que continua válida até o flip da Fase B. Depois do flip (public=false), o
// fallback deixa de resolver e a leitura passa a depender 100% do signed URL — por
// isso a Fase A precisa ser validada em runtime ANTES do flip.
//
// Diferente de avatars, `contact_files` tem coluna dedicada `storage_path`
// (path relativo). Preferimos ela; só caímos na extração da URL pública para as
// linhas históricas que não têm storage_path preenchido.

const BUCKET = "contact-files";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h — cobre uma sessão de navegação/preview

const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;

export interface SignableContactFile {
  storage_path?: string | null;
  file_url?: string | null;
}

// Resolve o path de storage a partir do arquivo: storage_path direto, senão extrai
// da URL pública. Retorna null quando não é um objeto do NOSSO bucket (não deveria
// acontecer para contact_files, mas mantém o helper seguro).
export function contactFileStoragePath(file?: SignableContactFile | null): string | null {
  if (!file) return null;
  if (file.storage_path) return file.storage_path;
  const url = file.file_url;
  if (!url) return null;
  const idx = url.indexOf(PUBLIC_MARKER);
  if (idx < 0) return null;
  try {
    return decodeURIComponent(url.slice(idx + PUBLIC_MARKER.length));
  } catch {
    return url.slice(idx + PUBLIC_MARKER.length);
  }
}

// Cache path -> signed URL, com folga antes do vencimento, pra não re-assinar o mesmo
// arquivo a cada re-render/re-mount (a lista re-monta itens ao rolar).
const cache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_SAFETY_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Coalescing de assinatura em lote (idêntico ao de contactAvatars): várias montagens
// de thumbnail no mesmo tick enfileiram seus paths e compartilham UMA chamada
// createSignedUrls, em vez de N createSignedUrl individuais.
// ---------------------------------------------------------------------------
let signQueue = new Map<string, Array<(url: string | null) => void>>();
let flushScheduled = false;
const BATCH_CHUNK = 100;

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flushSignQueue);
}

async function flushSignQueue() {
  flushScheduled = false;
  const batch = signQueue;
  signQueue = new Map();
  const paths = Array.from(batch.keys());
  if (paths.length === 0) return;

  for (let i = 0; i < paths.length; i += BATCH_CHUNK) {
    const slice = paths.slice(i, i + BATCH_CHUNK);
    let byPath = new Map<string, string>();
    try {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(slice, SIGNED_URL_TTL_SECONDS);
      data?.forEach((d) => {
        if (d.signedUrl && d.path) byPath.set(d.path, d.signedUrl);
      });
    } catch {
      byPath = new Map();
    }
    for (const path of slice) {
      const signed = byPath.get(path) ?? null;
      if (signed) {
        cache.set(path, {
          url: signed,
          expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 - CACHE_SAFETY_MS,
        });
      }
      batch.get(path)?.forEach((resolve) => resolve(signed));
    }
  }
}

function signPathBatched(path: string): Promise<string | null> {
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.url);
  return new Promise((resolve) => {
    const arr = signQueue.get(path) ?? [];
    arr.push(resolve);
    signQueue.set(path, arr);
    scheduleFlush();
  });
}

// Resolve um contact_file para uma URL utilizável (<img>, download, nova aba).
// Em falha de assinatura devolve a file_url original (não piora o que já funcionava
// enquanto o bucket ainda é público).
export async function resolveContactFileUrl(file?: SignableContactFile | null): Promise<string | null> {
  if (!file) return null;
  const path = contactFileStoragePath(file);
  if (!path) return file.file_url ?? null;
  const signed = await signPathBatched(path);
  return signed ?? file.file_url ?? null;
}

// Baixa o objeto direto do storage (blob), preferível ao fetch(URL) porque funciona
// com bucket privado sem depender de CORS na URL pública. Fallback: fetch da URL
// assinada. Retorna null em falha.
export async function downloadContactFileBlob(file?: SignableContactFile | null): Promise<Blob | null> {
  if (!file) return null;
  const path = contactFileStoragePath(file);
  if (path) {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (!error && data) return data;
  }
  const url = await resolveContactFileUrl(file);
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

// Hook de exibição: resolve o signed URL de um contact_file. Começa null (ou já
// resolvido, se estiver no cache) até a assinatura chegar.
export function useSignedContactFileUrl(file?: SignableContactFile | null): string | null {
  const key = contactFileStoragePath(file);
  const initial = (): string | null => {
    if (!key) return file?.file_url ?? null;
    const cached = cache.get(key);
    return cached && cached.expiresAt > Date.now() ? cached.url : null;
  };
  const [resolved, setResolved] = useState<string | null>(initial);

  useEffect(() => {
    let active = true;
    if (!key) {
      setResolved(file?.file_url ?? null);
      return;
    }
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      setResolved(cached.url);
      return;
    }
    setResolved(null);
    resolveContactFileUrl(file).then((u) => {
      if (active) setResolved(u);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return resolved;
}
