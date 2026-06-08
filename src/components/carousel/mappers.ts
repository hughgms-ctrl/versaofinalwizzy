// Mapeadores linha (snake_case do Postgres) -> tipo de domínio (camelCase).
import type { Carousel, CarouselModel, Slide } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function rowToModel(r: any): CarouselModel {
  return {
    id: r.id,
    name: r.name,
    niche: r.niche,
    objective: r.objective,
    tone: r.tone,
    audience: r.audience,
    brandColor: r.brand_color ?? null,
    peopleInImages: r.people_in_images,
    createdAt: r.created_at,
  };
}

export function rowToSlide(r: any): Slide {
  return {
    id: r.id,
    carouselId: r.carousel_id,
    order: r.order,
    hasImage: r.has_image,
    imagePrompt: r.image_prompt ?? null,
    imageTheme: r.image_theme ?? null,
    imageUrl: r.image_url ?? null,
    title: r.title ?? null,
    body: r.body ?? null,
    fontFamily: r.font_family ?? null,
    textAlign: r.text_align ?? null,
    textColor: r.text_color ?? null,
    bgColor: r.bg_color ?? null,
    accentColor: r.accent_color ?? null,
    textPosition: r.text_position ?? null,
    overlayPosition: r.overlay_position ?? null,
    overlayIntensity: r.overlay_intensity ?? null,
    titleSize: r.title_size ?? null,
    titleBold: r.title_bold ?? null,
    bodySize: r.body_size ?? null,
  };
}

export function rowToCarousel(r: any, slides: Slide[] = []): Carousel {
  return {
    id: r.id,
    modelId: r.model_id ?? null,
    prompt: r.prompt,
    slideCount: r.slide_count,
    imageStyle: r.image_style,
    status: r.status,
    instagramMediaId: r.instagram_media_id ?? null,
    niche: r.niche ?? null,
    objective: r.objective ?? null,
    tone: r.tone ?? null,
    audience: r.audience ?? null,
    brandColor: r.brand_color ?? null,
    peopleInImages: r.people_in_images ?? null,
    createdAt: r.created_at,
    slides,
  };
}

/** Converte um patch de Slide (camelCase) para colunas snake_case. */
export function slidePatchToRow(patch: Partial<Slide>): Record<string, unknown> {
  const map: Record<keyof Slide, string> = {
    id: "id",
    carouselId: "carousel_id",
    order: "order",
    hasImage: "has_image",
    imagePrompt: "image_prompt",
    imageTheme: "image_theme",
    imageUrl: "image_url",
    title: "title",
    body: "body",
    fontFamily: "font_family",
    textAlign: "text_align",
    textColor: "text_color",
    bgColor: "bg_color",
    accentColor: "accent_color",
    textPosition: "text_position",
    overlayPosition: "overlay_position",
    overlayIntensity: "overlay_intensity",
    titleSize: "title_size",
    titleBold: "title_bold",
    bodySize: "body_size",
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    const col = map[k as keyof Slide];
    if (col) out[col] = v;
  }
  return out;
}
