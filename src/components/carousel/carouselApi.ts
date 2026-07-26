// Camada de dados do Carrossel IA na Wizzy.
// Tabelas via Supabase (RLS por organização) + IA via Edge Functions.
import { supabase } from "@/integrations/supabase/client";
import { rowToCarousel, rowToModel, rowToSlide, slidePatchToRow } from "./mappers";
import type { Carousel, CarouselModel, CarouselSourceType, Slide, TrendingIdea, VisualStyle } from "./types";

/* ----------------------------- Modelos ----------------------------- */

export async function listModels(): Promise<CarouselModel[]> {
  const { data, error } = await supabase
    .from("carousel_models")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToModel);
}

export interface ModelInput {
  name: string;
  niche: string;
  objective: string;
  tone: string;
  audience: string;
  brandColor?: string | null;
  peopleInImages: string;
}

export async function createModel(
  input: ModelInput,
  organizationId: string,
  userId: string,
): Promise<CarouselModel> {
  const { data, error } = await supabase
    .from("carousel_models")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      name: input.name,
      niche: input.niche,
      objective: input.objective,
      tone: input.tone,
      audience: input.audience,
      brand_color: input.brandColor ?? null,
      people_in_images: input.peopleInImages,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToModel(data);
}

export async function updateModel(
  id: string,
  input: Partial<ModelInput>,
): Promise<CarouselModel> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.niche !== undefined) row.niche = input.niche;
  if (input.objective !== undefined) row.objective = input.objective;
  if (input.tone !== undefined) row.tone = input.tone;
  if (input.audience !== undefined) row.audience = input.audience;
  if (input.brandColor !== undefined) row.brand_color = input.brandColor;
  if (input.peopleInImages !== undefined) row.people_in_images = input.peopleInImages;
  const { data, error } = await supabase
    .from("carousel_models")
    .update(row)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return rowToModel(data);
}

export async function deleteModel(id: string): Promise<void> {
  const { error } = await supabase.from("carousel_models").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------------------- Carrosséis ---------------------------- */

function mapCarouselRow(r: any): Carousel {
  const slides = (r.carousel_slides ?? [])
    .map(rowToSlide)
    .sort((a: Slide, b: Slide) => a.order - b.order);
  return rowToCarousel(r, slides);
}

export async function listCarousels(): Promise<Carousel[]> {
  const { data, error } = await supabase
    .from("carousels")
    .select("*, carousel_slides(*)")
    .eq("is_template", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapCarouselRow);
}

export async function getCarousel(id: string): Promise<Carousel | null> {
  const { data, error } = await supabase
    .from("carousels")
    .select("*, carousel_slides(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapCarouselRow(data);
}

export async function deleteCarousel(id: string): Promise<void> {
  const { error } = await supabase.from("carousels").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------------------- Templates ---------------------------- */

export async function listTemplates(): Promise<Carousel[]> {
  const { data, error } = await supabase
    .from("carousels")
    .select("*, carousel_slides(*)")
    .eq("is_template", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapCarouselRow);
}

/** Marca um carrossel já criado como template reutilizável (não duplica — vira template no lugar). */
export async function saveAsTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from("carousels")
    .update({ is_template: true, template_source: "created" })
    .eq("id", id);
  if (error) throw error;
}

/** Clona um template (carrossel + slides) numa cópia nova e comum, pronta pra o usuário editar. */
export async function cloneTemplate(
  templateId: string,
  organizationId: string,
  userId: string,
): Promise<{ carouselId: string }> {
  const { data: tpl, error: tErr } = await supabase
    .from("carousels")
    .select("*, carousel_slides(*)")
    .eq("id", templateId)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!tpl) throw new Error("Template não encontrado");

  const { data: clone, error: cErr } = await supabase
    .from("carousels")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      model_id: tpl.model_id,
      prompt: tpl.prompt,
      slide_count: tpl.slide_count,
      image_style: tpl.image_style,
      status: "done",
      niche: tpl.niche,
      objective: tpl.objective,
      tone: tpl.tone,
      audience: tpl.audience,
      brand_color: tpl.brand_color,
      people_in_images: tpl.people_in_images,
      cta_idea: tpl.cta_idea,
      source_type: "idea",
      source_content: null,
      is_template: false,
      template_source: null,
    })
    .select()
    .single();
  if (cErr || !clone) throw cErr ?? new Error("Falha ao clonar template");

  const tplSlides = ((tpl as any).carousel_slides ?? []).sort(
    (a: any, b: any) => a.order - b.order,
  );
  if (tplSlides.length) {
    const rows = tplSlides.map((s: any) => ({
      carousel_id: clone.id,
      order: s.order,
      has_image: s.has_image,
      image_prompt: s.image_prompt,
      image_theme: s.image_theme,
      image_url: s.image_url,
      title: s.title,
      body: s.body,
      font_family: s.font_family,
      text_align: s.text_align,
      text_color: s.text_color,
      bg_color: s.bg_color,
      text_position: s.text_position,
      overlay_intensity: s.overlay_intensity,
      overlay_position: s.overlay_position,
      title_size: s.title_size,
      title_bold: s.title_bold,
      body_size: s.body_size,
      accent_color: s.accent_color,
    }));
    const { error: sErr } = await supabase.from("carousel_slides").insert(rows);
    if (sErr) throw sErr;
  }

  return { carouselId: clone.id };
}

export async function importTemplateFromScreenshots(
  images: string[],
): Promise<{ carouselId: string }> {
  const { data, error } = await supabase.functions.invoke("carousel-import-template", {
    body: { images },
  });
  if (error) throw error;
  return data as { carouselId: string };
}

export async function patchSlide(
  slideId: string,
  patch: Partial<Slide>,
): Promise<Slide> {
  const { data, error } = await supabase
    .from("carousel_slides")
    .update(slidePatchToRow(patch))
    .eq("id", slideId)
    .select()
    .single();
  if (error) throw error;
  return rowToSlide(data);
}

/* ------------------------------- IA -------------------------------- */

export interface GeneratePayload {
  modelId: string;
  prompt: string;
  slideCount: 5 | 7 | 10;
  imageStyle: VisualStyle;
  slides: { order: number; hasImage: boolean }[];
  /** Ideia de CTA opcional para o último slide (crua; a IA melhora). */
  ctaIdea?: string;
  /** Fonte do carrossel: ideia livre, texto colado, link de artigo ou vídeo do YouTube. */
  sourceType?: CarouselSourceType;
  /** Material de origem (quando sourceType != "idea") usado como base real da geração. */
  sourceContent?: string;
  /** Formato pré-pronto escolhido na biblioteca de formatos (layout dos slides). */
  layout?: {
    textAlign: string;
    overlayPosition: string;
    overlayIntensity: number;
    titleSize: number;
    bodySize: number;
    titleBold: boolean;
  };
}

export async function generateCarousel(
  payload: GeneratePayload,
): Promise<{ carouselId: string }> {
  const { data, error } = await supabase.functions.invoke("carousel-generate", {
    body: payload,
  });
  if (error) throw error;
  return data as { carouselId: string };
}

export async function regenerateText(
  carouselId: string,
  slideId: string,
  instruction?: string,
): Promise<Slide> {
  const { data, error } = await supabase.functions.invoke("carousel-regenerate-text", {
    body: { carouselId, slideId, instruction },
  });
  if (error) throw error;
  return rowToSlide(data);
}

export async function regenerateImage(
  carouselId: string,
  slideId: string,
): Promise<Slide> {
  const { data, error } = await supabase.functions.invoke("carousel-regenerate-image", {
    body: { carouselId, slideId },
  });
  if (error) throw error;
  return rowToSlide(data);
}

export async function enhanceModelField(
  field: "niche" | "audience",
  value: string,
  context?: { niche?: string; objective?: string; tone?: string },
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("carousel-enhance-field", {
    body: { field, value, ...context },
  });
  if (error) throw error;
  return (data as { value: string }).value ?? value;
}

export async function extractSource(
  type: Extract<CarouselSourceType, "link" | "youtube">,
  value: string,
): Promise<{ title: string; content: string }> {
  const { data, error } = await supabase.functions.invoke("carousel-extract-source", {
    body: { type, value },
  });
  if (error) throw error;
  return data as { title: string; content: string };
}

export async function fetchTrending(niche: string): Promise<TrendingIdea[]> {
  const { data, error } = await supabase.functions.invoke("carousel-trending", {
    body: { niche },
  });
  if (error) throw error;
  return (data as { ideas: TrendingIdea[] }).ideas ?? [];
}
