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

export async function resolveContactAvatarUrl(value?: string | null): Promise<string | null> {
  if (!value) return null;
  const path = toContactAvatarStoragePath(value);
  if (!path) return value; // URL crua do WhatsApp / externa — passa direto

  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  const signed = data?.signedUrl;
  if (!signed) return value; // falha de assinatura: não piora o que já quebrou
  cache.set(path, {
    url: signed,
    expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 - CACHE_SAFETY_MS,
  });
  return signed;
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
