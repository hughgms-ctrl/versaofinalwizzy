// =====================================================================
// carousel-regenerate-text — regenera o texto (title/body) de um slide.
// =====================================================================
import { authenticateUser, errorResponse, handleCors, jsonResponse } from "../_shared/middleware.ts";
import { regenerateSlideText, resolveOpenAIKey } from "../_shared/carousel.ts";

interface Body {
  carouselId: string;
  slideId: string;
  instruction?: string;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    const { organizationId, supabase } = await authenticateUser(req);
    const { carouselId, slideId, instruction } = (await req.json()) as Body;
    if (!carouselId || !slideId) return errorResponse("Payload inválido", 400);

    // RLS garante que o carrossel pertence à organização do usuário.
    const { data: carousel } = await supabase
      .from("carousels")
      .select("*")
      .eq("id", carouselId)
      .maybeSingle();
    if (!carousel) return errorResponse("Carrossel não encontrado", 404);

    const { data: slide } = await supabase
      .from("carousel_slides")
      .select("*")
      .eq("id", slideId)
      .eq("carousel_id", carouselId)
      .maybeSingle();
    if (!slide) return errorResponse("Slide não encontrado", 404);

    const apiKey = await resolveOpenAIKey(supabase, organizationId);
    const { title, body } = await regenerateSlideText({
      apiKey,
      prompt: carousel.prompt,
      niche: carousel.niche ?? "",
      objective: carousel.objective,
      tone: carousel.tone,
      audience: carousel.audience,
      slideOrder: slide.order,
      slideCount: carousel.slide_count,
      currentTitle: slide.title,
      currentBody: slide.body,
      instruction,
      ctaIdea: carousel.cta_idea,
    });

    const { data: updated } = await supabase
      .from("carousel_slides")
      .update({ title, body })
      .eq("id", slideId)
      .select()
      .single();

    return jsonResponse(updated);
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    return errorResponse((err as Error).message ?? "Erro", status);
  }
});
