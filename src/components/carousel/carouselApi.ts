// Camada de dados do Carrossel IA na Wizzy.
// Tabelas via Supabase (RLS por organização) + IA via Edge Functions.
import { supabase } from "@/integrations/supabase/client";
import { rowToCarousel, rowToKnowledgeItem, rowToModel, rowToSlide, slidePatchToRow } from "./mappers";
import type {
  Carousel,
  CarouselModel,
  CarouselSourceType,
  KnowledgeItem,
  Slide,
  TrendingIdea,
  VisualStyle,
} from "./types";

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

/* --------------------- Base de conhecimento (Projeto) --------------------- */
// carousel_model_knowledge é uma tabela nova — ainda não existe no types.ts
// gerado do Supabase, por isso os casts `as any`, mesmo padrão já usado nas
// colunas novas de carousels (is_template, source_type etc.).

const KNOWLEDGE_BUCKET = "carousel-knowledge-files";

export async function listKnowledgeItems(modelId: string): Promise<KnowledgeItem[]> {
  const { data, error } = await (supabase as any).from("carousel_model_knowledge")
    .select("*")
    .eq("model_id", modelId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToKnowledgeItem);
}

export async function addTextKnowledgeItem(
  modelId: string,
  organizationId: string,
  title: string,
  content: string,
): Promise<KnowledgeItem> {
  const { data, error } = await (supabase as any).from("carousel_model_knowledge")
    .insert({ organization_id: organizationId, model_id: modelId, type: "text", title, content, status: "ready" })
    .select()
    .single();
  if (error) throw error;
  return rowToKnowledgeItem(data);
}

export async function addTemplateKnowledgeItem(
  modelId: string,
  organizationId: string,
  templateId: string,
  title: string,
): Promise<KnowledgeItem> {
  const { data, error } = await (supabase as any).from("carousel_model_knowledge")
    .insert({
      organization_id: organizationId,
      model_id: modelId,
      type: "template",
      title,
      template_id: templateId,
      status: "ready",
    })
    .select()
    .single();
  if (error) throw error;
  return rowToKnowledgeItem(data);
}

export async function addLinkKnowledgeItem(
  modelId: string,
  type: "link" | "youtube",
  value: string,
): Promise<KnowledgeItem> {
  const data = await invokeFn("carousel-knowledge-add-link", { modelId, type, value });
  return rowToKnowledgeItem(data);
}

export async function addFileKnowledgeItem(
  modelId: string,
  organizationId: string,
  file: File,
): Promise<KnowledgeItem> {
  const path = `${modelId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from(KNOWLEDGE_BUCKET).upload(path, file, { upsert: false });
  if (uploadError) throw uploadError;

  const { data: row, error } = await (supabase as any).from("carousel_model_knowledge")
    .insert({
      organization_id: organizationId,
      model_id: modelId,
      type: "file",
      title: file.name,
      storage_path: path,
      status: "processing",
    })
    .select()
    .single();
  if (error) throw error;

  const item = rowToKnowledgeItem(row);
  // Extração roda em background na edge function — a UI faz polling do status.
  invokeFn("carousel-knowledge-process-file", { itemId: item.id }).catch(() => {});
  return item;
}

export async function deleteKnowledgeItem(id: string): Promise<void> {
  const { error } = await (supabase as any).from("carousel_model_knowledge").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------------------- Carrosséis ---------------------------- */

function mapCarouselRow(r: any): Carousel {
  const slides = (r.carousel_slides ?? [])
    .map(rowToSlide)
    .sort((a: Slide, b: Slide) => a.order - b.order);
  return rowToCarousel(r, slides);
}

// Colunas de fonte/template (is_template, template_source, source_type, source_content)
// são recentes e ainda não existem no types.ts gerado do Supabase — casts pontuais
// `as any` nos pontos que as tocam, mesmo padrão já usado em mappers.ts.
export async function listCarousels(): Promise<Carousel[]> {
  const { data, error } = await (supabase.from("carousels") as any)
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
  const { data, error } = await (supabase.from("carousels") as any)
    .select("*, carousel_slides(*)")
    .eq("is_template", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapCarouselRow);
}

/** Marca um carrossel já criado como template reutilizável (não duplica — vira template no lugar). */
export async function saveAsTemplate(id: string): Promise<void> {
  const { error } = await (supabase.from("carousels") as any)
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
  const { data: tpl, error: tErr } = await (supabase.from("carousels") as any)
    .select("*, carousel_slides(*)")
    .eq("id", templateId)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!tpl) throw new Error("Template não encontrado");

  const { data: clone, error: cErr } = await (supabase.from("carousels") as any)
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
  return invokeFn("carousel-import-template", { images });
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

/**
 * Invoca uma edge function e, em erro, tenta extrair a mensagem REAL do corpo
 * da resposta ({ error: "..." }) — o supabase-js só devolve um texto genérico
 * ("Edge Function returned a non-2xx status code") em error.message por padrão,
 * escondendo a causa de fato (ex.: "Nenhuma chave OpenAI configurada").
 */
async function invokeFn<T = unknown>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const parsed = await ctx.clone().json().catch(() => null);
      if (parsed?.error) throw new Error(parsed.error);
    }
    throw error;
  }
  return data as T;
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
}

export async function generateCarousel(
  payload: GeneratePayload,
): Promise<{ carouselId: string }> {
  return invokeFn("carousel-generate", payload);
}

export async function regenerateText(
  carouselId: string,
  slideId: string,
  instruction?: string,
): Promise<Slide> {
  const data = await invokeFn("carousel-regenerate-text", { carouselId, slideId, instruction });
  return rowToSlide(data);
}

export async function regenerateImage(
  carouselId: string,
  slideId: string,
  imageTheme?: string,
): Promise<Slide> {
  const data = await invokeFn("carousel-regenerate-image", { carouselId, slideId, imageTheme });
  return rowToSlide(data);
}

export async function enhanceModelField(
  field: "niche" | "audience",
  value: string,
  context?: { niche?: string; objective?: string; tone?: string },
): Promise<string> {
  const data = await invokeFn<{ value: string }>("carousel-enhance-field", { field, value, ...context });
  return data.value ?? value;
}

export async function extractSource(
  type: Extract<CarouselSourceType, "link" | "youtube">,
  value: string,
): Promise<{ title: string; content: string }> {
  return invokeFn("carousel-extract-source", { type, value });
}

/** Gera (ou regenera, se force) as 6 amostras reais de estilo visual. */
export async function generateStyleSamples(force = false): Promise<Record<string, string>> {
  const data = await invokeFn<{ samples: Record<string, string> }>("carousel-style-samples", { force });
  return data.samples ?? {};
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Modo chat: cria ou edita um carrossel via conversa (function calling no backend). */
export async function chatWithCarousel(params: {
  modelId: string;
  carouselId: string | null;
  messages: ChatMessage[];
}): Promise<{ reply: string; carouselId?: string }> {
  return invokeFn("carousel-chat", params);
}

export async function fetchTrending(niche: string, modelId?: string): Promise<TrendingIdea[]> {
  const data = await invokeFn<{ ideas: TrendingIdea[] }>("carousel-trending", { niche, modelId });
  return data.ideas ?? [];
}
