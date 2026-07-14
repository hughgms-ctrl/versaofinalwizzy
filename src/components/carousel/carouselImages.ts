import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Bucket `carousel-images` é privado (ver migration 20260713130000). A leitura não
// pode mais usar a URL pública salva em carousel_slides.image_url — geramos signed
// URL sob demanda. Espelha src/fluzz/lib/taskFiles.ts. Lida com os dois formatos
// que existem em image_url:
//   - path puro ("<carouselId>/slide-....png")                         -> uploads novos
//   - URL pública legada (".../object/public/carousel-images/<path>")  -> uploads antigos
//
// A assinatura acontece na CAMADA DE EXIBIÇÃO (SlideCard + renderSlide) de propósito:
// image_url chega ao front por vários caminhos (load inicial via carouselApi, realtime
// em hooks.ts, e o row cru retornado por regenerateImage/patchSlide). Assinar no ponto
// de consumo cobre todos eles sem ter que interceptar cada origem.

const BUCKET = "carousel-images";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h — suficiente pra uma sessão de edição/preview/download

// Extrai o path de storage de um valor que pode ser path puro ou URL pública legada.
// Retorna null quando o valor é uma URL externa que não é do nosso bucket.
export function toCarouselStoragePath(value: string | null | undefined): string | null {
  if (!value) return null;
  const marker = `/${BUCKET}/`;
  const idx = value.indexOf(marker);
  if (idx >= 0) return value.slice(idx + marker.length);
  if (value.includes("://")) return null; // URL externa que não é nossa
  return value; // já é um path
}

// Resolve um image_url para uma URL utilizável em <img>/canvas. URLs externas passam
// direto; falha de assinatura devolve o valor original (não piora o que já quebrou).
export async function resolveCarouselImageUrl(
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  const path = toCarouselStoragePath(value);
  if (!path) return value;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? value;
}

// Hook de exibição: resolve o signed URL de um image_url e re-resolve quando ele muda
// (ex.: regenerar imagem troca o path). Retorna null até a assinatura chegar.
export function useSignedCarouselImage(imageUrl: string | null | undefined): string | null {
  const [signed, setSigned] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!imageUrl) {
      setSigned(null);
      return;
    }
    resolveCarouselImageUrl(imageUrl).then((url) => {
      if (active) setSigned(url);
    });
    return () => {
      active = false;
    };
  }, [imageUrl]);

  return signed;
}
