// =====================================================================
// carousel-generate — cria um carrossel + slides e dispara a geração por IA
// em background (EdgeRuntime.waitUntil). O progresso chega ao front via
// Supabase Realtime nas tabelas carousels / carousel_slides (substitui o SSE
// e a fila BullMQ/Redis do projeto original).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, corsHeaders, errorResponse, handleCors, jsonResponse } from "../_shared/middleware.ts";
import {
  buildImagePrompt,
  generateImage,
  generateSlideTexts,
  resolveOpenAIKey,
  uploadImage,
} from "../_shared/carousel.ts";

interface SlideFlag {
  order: number;
  hasImage: boolean;
}

interface GenerateBody {
  modelId?: string | null;
  prompt: string;
  slideCount: number;
  imageStyle?: string;
  slides: SlideFlag[];
  // briefing direto (quando não há modelId)
  niche?: string;
  objective?: string;
  tone?: string;
  audience?: string;
  brandColor?: string | null;
  peopleInImages?: string;
}

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    const { userId, organizationId, supabase } = await authenticateUser(req);
    const body = (await req.json()) as GenerateBody;

    if (!body?.prompt || !body?.slideCount || !Array.isArray(body.slides)) {
      return errorResponse("Payload inválido", 400);
    }

    // Briefing: do modelo (snapshot) ou direto do wizard.
    let briefing = {
      niche: body.niche ?? "",
      objective: body.objective ?? "educate",
      tone: body.tone ?? "professional",
      audience: body.audience ?? "",
      brandColor: body.brandColor ?? null as string | null,
      peopleInImages: body.peopleInImages ?? "indifferent",
    };

    if (body.modelId) {
      const { data: model } = await supabase
        .from("carousel_models")
        .select("*")
        .eq("id", body.modelId)
        .maybeSingle();
      if (!model) return errorResponse("Modelo não encontrado", 404);
      briefing = {
        niche: model.niche,
        objective: model.objective,
        tone: model.tone,
        audience: model.audience,
        brandColor: model.brand_color,
        peopleInImages: model.people_in_images,
      };
    }

    const accent = briefing.brandColor ?? "#3B82F6";
    const solidBg = briefing.brandColor ?? "#0a0a0a";
    const imageMap = new Map(body.slides.map((s) => [s.order, s.hasImage]));

    // Cria o carrossel.
    const { data: carousel, error: cErr } = await service
      .from("carousels")
      .insert({
        organization_id: organizationId,
        user_id: userId,
        model_id: body.modelId ?? null,
        prompt: body.prompt,
        slide_count: body.slideCount,
        image_style: body.imageStyle ?? "cinematic",
        status: "pending",
        niche: briefing.niche,
        objective: briefing.objective,
        tone: briefing.tone,
        audience: briefing.audience,
        brand_color: briefing.brandColor,
        people_in_images: briefing.peopleInImages,
      })
      .select()
      .single();
    if (cErr || !carousel) {
      return errorResponse(`Falha ao criar carrossel: ${cErr?.message}`, 500);
    }

    // Cria os slides vazios.
    const slideRows = Array.from({ length: body.slideCount }, (_, i) => ({
      carousel_id: carousel.id,
      order: i + 1,
      has_image: imageMap.get(i + 1) ?? false,
      text_color: "#ffffff",
      bg_color: solidBg,
      accent_color: accent,
      font_family: "Montserrat",
      text_align: "left",
      text_position: "center",
      overlay_position: "bottom",
      overlay_intensity: 0.85,
      title_size: 80,
      title_bold: true,
      body_size: 36,
    }));
    const { error: sErr } = await service.from("carousel_slides").insert(slideRows);
    if (sErr) return errorResponse(`Falha ao criar slides: ${sErr.message}`, 500);

    // Geração em background — não bloqueia a resposta.
    const apiKey = await resolveOpenAIKey(supabase, organizationId);
    // @ts-ignore EdgeRuntime existe no runtime do Supabase
    EdgeRuntime.waitUntil(runGeneration(carousel.id, briefing, body, apiKey));

    return jsonResponse({ carouselId: carousel.id, status: "processing" }, 201);
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    return errorResponse((err as Error).message ?? "Erro", status);
  }
});

async function runGeneration(
  carouselId: string,
  briefing: {
    niche: string;
    objective: string;
    tone: string;
    audience: string;
    brandColor: string | null;
    peopleInImages: string;
  },
  body: GenerateBody,
  apiKey: string,
) {
  try {
    await service.from("carousels").update({ status: "processing" }).eq("id", carouselId);

    const { data: slides } = await service
      .from("carousel_slides")
      .select("id, order, has_image")
      .eq("carousel_id", carouselId)
      .order("order", { ascending: true });

    // 1. Textos de todos os slides.
    const texts = await generateSlideTexts({
      apiKey,
      prompt: body.prompt,
      slideCount: body.slideCount,
      niche: briefing.niche,
      objective: briefing.objective,
      tone: briefing.tone,
      audience: briefing.audience,
    });

    for (const slide of slides ?? []) {
      const text = texts.find((t) => t.order === slide.order);
      if (!text) continue;
      await service
        .from("carousel_slides")
        .update({ title: text.title, body: text.body, image_theme: text.imageTheme })
        .eq("id", slide.id);
    }

    // 2. Imagens dos slides marcados.
    for (const slide of (slides ?? []).filter((s) => s.has_image)) {
      const text = texts.find((t) => t.order === slide.order);
      const imagePrompt = buildImagePrompt({
        imageTheme: text?.imageTheme,
        prompt: body.prompt,
        slideTitle: text?.title,
        imageStyle: body.imageStyle ?? "cinematic",
        peopleInImages: briefing.peopleInImages,
        brandColor: briefing.brandColor,
      });
      const bytes = await generateImage(apiKey, imagePrompt);
      const key = `${carouselId}/slide-${slide.order}.png`;
      const imageUrl = await uploadImage(service, key, bytes);
      await service
        .from("carousel_slides")
        .update({ image_prompt: imagePrompt, image_url: imageUrl })
        .eq("id", slide.id);
    }

    await service.from("carousels").update({ status: "done" }).eq("id", carouselId);
  } catch (err) {
    console.error(`[carousel-generate] erro ao gerar ${carouselId}:`, err);
    await service.from("carousels").update({ status: "failed" }).eq("id", carouselId);
  }
}
