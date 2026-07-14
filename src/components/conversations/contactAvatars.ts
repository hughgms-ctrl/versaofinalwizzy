import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Bucket `contact-avatars` é privado (ver migration 20260714120000). A leitura deixa
// de usar a URL pública salva em contacts.avatar_url e passa a gerar signed URL sob
// demanda. Espelha src/fluzz/lib/taskFiles.ts + src/components/carousel/carouselImages.ts.
//
// ⚠️ contacts.avatar_url é COLUNA MISTA: guarda tanto a URL do nosso storage quanto a
// URL CRUA do WhatsApp (pps.whatsapp.net/...), escrita direto por zapi-webhook/
// zapi-sync-chats. Só as URLs do NOSSO bucket precisam (e podem) ser assinadas — as
// cruas do WhatsApp passam intactas. Por isso o helper só age quando o valor contém
// o marcador `/contact-avatars/`; qualquer outra coisa (URL externa) passa direto.
//
// PERF (listas): a assinatura é COALESCADA. Várias montagens de <ContactAvatar> no
// mesmo tick enfileiram seus paths e compartilham UMA chamada createSignedUrls, em vez
// de N createSignedUrl individuais. O `src` passado pelo componente é sempre o valor
// CRU de contacts.avatar_url (nunca a URL já assinada), então não há dupla-assinatura.

const BUCKET = "contact-avatars";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h — suficiente pra uma sessão de navegação

// Extrai o path de storage quando o valor é uma URL pública do NOSSO bucket.
// Retorna null pra qualquer outra coisa (URL crua do WhatsApp, vazio) -> passa direto.
export function toContactAvatarStoragePath(value?: string | null): string | null {
  if (!value) return null;
  const marker = `/${BUCKET}/`;
  const idx = value.indexOf(marker);
  if (idx >= 0) return value.slice(idx + marker.length);
  return null;
}

// Cache path -> signed URL, com folga antes do vencimento, pra não re-assinar o mesmo
// avatar a cada re-render/re-mount (listas re-montam itens ao rolar).
const cache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_SAFETY_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Coalescing de assinatura em lote.
// ---------------------------------------------------------------------------
let signQueue = new Map<string, Array<(url: string | null) => void>>();
let flushScheduled = false;
const BATCH_CHUNK = 100; // createSignedUrls num único payload

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  // microtask: agrupa todas as montagens do mesmo flush de effects do React.
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
        // itens com erro (objeto ausente) vêm com signedUrl null — ignora.
        if (d.signedUrl && d.path) byPath.set(d.path, d.signedUrl);
      });
    } catch {
      byPath = new Map(); // falha do lote: todos caem no fallback (null)
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

// Assina um path (checa cache primeiro; senão enfileira no lote). Devolve null em falha.
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

// Resolve um avatar_url para uma URL utilizável em <img>. URLs cruas do WhatsApp passam
// direto; falha de assinatura devolve o valor original (não piora o que já quebrou).
export async function resolveContactAvatarUrl(value?: string | null): Promise<string | null> {
  if (!value) return null;
  const path = toContactAvatarStoragePath(value);
  if (!path) return value;
  const signed = await signPathBatched(path);
  return signed ?? value;
}

// Hook de exibição: resolve o signed URL de um avatar. Para URLs que NÃO são do nosso
// bucket (as cruas do WhatsApp), devolve o valor original de imediato — sem flicker.
export function useSignedContactAvatar(src?: string | null): string | null {
  // Estado inicial síncrono: URL externa aparece na hora; URL de storage começa null
  // (ou já resolvida se estiver no cache) até a assinatura chegar.
  const initial = (): string | null => {
    const path = toContactAvatarStoragePath(src);
    if (!path) return src ?? null;
    const cached = cache.get(path);
    return cached && cached.expiresAt > Date.now() ? cached.url : null;
  };
  const [resolved, setResolved] = useState<string | null>(initial);

  useEffect(() => {
    let active = true;
    const path = toContactAvatarStoragePath(src);
    if (!path) {
      setResolved(src ?? null);
      return;
    }
    const cached = cache.get(path);
    if (cached && cached.expiresAt > Date.now()) {
      setResolved(cached.url);
      return;
    }
    setResolved(null);
    resolveContactAvatarUrl(src).then((u) => {
      if (active) setResolved(u);
    });
    return () => {
      active = false;
    };
  }, [src]);

  return resolved;
}
