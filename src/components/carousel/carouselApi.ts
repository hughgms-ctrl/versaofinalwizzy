// Camada de dados do Carrossel IA na Wizzy.
// Tabelas via Supabase (RLS por organização) + IA via Edge Functions.
import { supabase } from "@/integrations/supabase/client";
import { rowToCarousel, rowToModel, rowToSlide, slidePatchToRow } from "./mappers";
import type { Carousel, CarouselModel, Slide, TrendingIdea, VisualStyle } from "./types";

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

export async function listCarousels(): Promise<Carousel[]> {
  const { data, error } = await supabase
    .from("carousels")
    .select("*, carousel_slides(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => {
    const slides = (r.carousel_slides ?? [])
      .map(rowToSlide)
      .sort((a: Slide, b: Slide) => a.order - b.order);
    return rowToCarousel(r, slides);
  });
}

export async function getCarousel(id: string): Promise<Carousel | null> {
  const { data, error } = await supabase
    .from("carousels")
    .select("*, carousel_slides(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const slides = ((data as any).carousel_slides ?? [])
    .map(rowToSlide)
    .sort((a: Slide, b: Slide) => a.order - b.order);
  return rowToCarousel(data, slides);
}

export async function deleteCarousel(id: string): Promise<void> {
  const { error } = await supabase.from("carousels").delete().eq("id", id);
  if (error) throw error;
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

export async function fetchTrending(niche: string): Promise<TrendingIdea[]> {
  const { data, error } = await supabase.functions.invoke("carousel-trending", {
    body: { niche },
  });
  if (error) throw error;
  return (data as { ideas: TrendingIdea[] }).ideas ?? [];
}
