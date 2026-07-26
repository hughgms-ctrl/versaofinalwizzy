// =====================================================================
// carousel-import-template — recebe prints de um carrossel de referência,
// analisa por visão (GPT-4o) a ESTRUTURA e o DESIGN de cada slide, e gera
// um carrossel NOVO E ORIGINAL inspirado nisso — nunca copia o texto nem
// reaproveita foto de pessoas reais da referência (gera pessoa por IA
// quando o slide original tinha uma). O resultado nasce como template
// (is_template = true) na biblioteca de Templates.
//
// Uma imagem enviada pode conter MAIS DE UM slide de referência (ex.: um
// print compilado com 3-4 etapas) — por isso o número de slides só é
// conhecido DEPOIS da análise por visão, e as linhas de carousel_slides só
// são criadas em background, não na resposta síncrona (diferente do
// carousel-generate, onde o slideCount já vem do usuário).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, errorResponse, handleCors, jsonResponse } from "../_shared/middleware.ts";
import {
  analyzeCarouselReference,
  buildImagePrompt,
  generateImage,
  generateSlideTextsFromReference,
  resolveCarouselModel,
  resolveOpenAIKey,
  uploadImage,
} from "../_shared/carousel.ts";

const MAX_IMAGES = 10;

interface ImportBody {
  images?: string[];
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
    const body = (await req.json()) as ImportBody;

    const images = (body.images ?? []).filter((i) => typeof i === "string" && i.startsWith("data:image/"));
    if (!images.length) return errorResponse("Envie ao menos um print do carrossel", 400);
    if (images.length > MAX_IMAGES) {
      return errorResponse(`Envie no máximo ${MAX_IMAGES} imagens por vez`, 400);
    }

    // Só o carrossel nasce agora — os slides só depois da análise, já que
    // uma imagem pode virar vários (contagem real desconhecida por enquanto).
    const { data: carousel, error: cErr } = await service
      .from("carousels")
      .insert({
        organization_id: organizationId,
        user_id: userId,
        prompt: "Importando template...",
        slide_count: images.length,
        image_style: "cinematic",
        status: "pending",
        niche: "",
        objective: "educate",
        tone: "professional",
        audience: "",
        people_in_images: "indifferent",
        source_type: "idea",
        is_template: true,
        template_source: "screenshot",
      })
      .select()
      .single();
    if (cErr || !carousel) {
      return errorResponse(`Falha ao criar template: ${cErr?.message}`, 500);
    }

    const apiKey = await resolveOpenAIKey(supabase, organizationId);
    // @ts-ignore EdgeRuntime existe no runtime do Supabase
    EdgeRuntime.waitUntil(runImport(carousel.id, images, apiKey));

    return jsonResponse({ carouselId: carousel.id, status: "processing" }, 201);
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    return errorResponse((err as Error).message ?? "Erro", status);
  }
});

async function runImport(carouselId: string, images: string[], apiKey: string) {
  try {
    await service.from("carousels").update({ status: "processing" }).eq("id", carouselId);

    // 1. Análise por visão da referência — estrutura, design real (fundo/
    // texto/layout) e detecção de múltiplos slides numa mesma imagem.
    const model = await resolveCarouselModel();
    const ref = await analyzeCarouselReference(apiKey, images, model);

    // 2. Agora que sabemos quantos slides existem de fato, cria as linhas —
    // cada uma já com o design detectado (nunca copiando o texto).
    const slideRows = ref.slides.map((s) => ({
      carousel_id: carouselId,
      order: s.order,
      has_image: true,
      text_color: s.textColor,
      bg_color: s.backgroundColor,
      accent_color: "#3B82F6",
      font_family: "Montserrat",
      text_align: s.textAlign,
      text_position: "center",
      overlay_position: s.overlayPosition,
      overlay_intensity: 0.85,
      title_size: 80,
      title_bold: true,
      body_size: 36,
      layout_mode: s.layoutMode,
    }));
    const { error: sErr } = await service.from("carousel_slides").insert(slideRows);
    if (sErr) throw new Error(`Falha ao criar slides: ${sErr.message}`);

    await service
      .from("carousels")
      .update({
        prompt: `Template: ${ref.inferredNiche}`,
        niche: ref.inferredNiche,
        objective: ref.inferredObjective,
        tone: ref.inferredTone,
        image_style: ref.overallVisualStyle,
        slide_count: ref.slides.length,
      })
      .eq("id", carouselId);

    const { data: slides } = await service
      .from("carousel_slides")
      .select("id, order")
      .eq("carousel_id", carouselId)
      .order("order", { ascending: true });

    // 3. Textos — inspirados no tema/papel de cada slide, nunca copiados.
    const texts = await generateSlideTextsFromReference({
      apiKey,
      model,
      niche: ref.inferredNiche,
      objective: ref.inferredObjective,
      tone: ref.inferredTone,
      audience: "",
      slideCount: ref.slides.length,
      slideBrief: ref.slides.map((s) => ({ order: s.order, role: s.role, themeConcept: s.themeConcept })),
    });

    for (const slide of slides ?? []) {
      const text = texts.find((t) => t.order === slide.order);
      if (!text) continue;
      await service
        .from("carousel_slides")
        .update({ title: text.title, body: text.body, image_theme: text.imageTheme })
        .eq("id", slide.id);
    }

    // 4. Imagens — quando o slide de referência tinha pessoa real, força geração
    // de pessoa por IA (nunca reaproveita a foto de quem apareceu no original).
    for (const slide of slides ?? []) {
      const text = texts.find((t) => t.order === slide.order);
      const analysis = ref.slides.find((s) => s.order === slide.order);
      const imagePrompt = buildImagePrompt({
        imageTheme: text?.imageTheme,
        prompt: ref.inferredNiche,
        slideTitle: text?.title,
        imageStyle: analysis?.visualStyle ?? ref.overallVisualStyle,
        peopleInImages: analysis?.hasRealPersonPhoto ? "with" : "indifferent",
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
    console.error(`[carousel-import-template] erro ao importar ${carouselId}:`, err);
    await service
      .from("carousels")
      .update({ status: "failed", error_message: (err as Error)?.message ?? "Erro desconhecido" })
      .eq("id", carouselId);
  }
}
