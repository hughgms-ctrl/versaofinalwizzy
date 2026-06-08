// =====================================================================
// carousel-regenerate-image — regenera a imagem de fundo de um slide,
// sobe pro Supabase Storage e atualiza a URL.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, errorResponse, handleCors, jsonResponse } from "../_shared/middleware.ts";
import { buildImagePrompt, generateImage, resolveOpenAIKey, uploadImage } from "../_shared/carousel.ts";

interface Body {
  carouselId: string;
  slideId: string;
}

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    const { organizationId, supabase } = await authenticateUser(req);
    const { carouselId, slideId } = (await req.json()) as Body;
    if (!carouselId || !slideId) return errorResponse("Payload inválido", 400);

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
    const imagePrompt = buildImagePrompt({
      imageTheme: slide.image_theme,
      prompt: carousel.prompt,
      slideTitle: slide.title,
      imageStyle: carousel.image_style,
      peopleInImages: carousel.people_in_images,
      brandColor: carousel.brand_color,
    });

    const bytes = await generateImage(apiKey, imagePrompt);
    const key = `${carouselId}/slide-${slide.order}-${Date.now()}.png`;
    const imageUrl = await uploadImage(service, key, bytes);

    const { data: updated } = await supabase
      .from("carousel_slides")
      .update({ has_image: true, image_prompt: imagePrompt, image_url: imageUrl })
      .eq("id", slideId)
      .select()
      .single();

    return jsonResponse(updated);
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    return errorResponse((err as Error).message ?? "Erro", status);
  }
});
