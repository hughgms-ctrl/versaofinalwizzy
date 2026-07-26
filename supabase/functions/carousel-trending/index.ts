// =====================================================================
// carousel-trending — sugestões de tema em alta para um nicho (GPT-4o).
// =====================================================================
import { authenticateUser, errorResponse, handleCors, jsonResponse } from "../_shared/middleware.ts";
import { buildKnowledgeContext, getTrendingIdeas, resolveCarouselModel, resolveOpenAIKey } from "../_shared/carousel.ts";

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    const { organizationId, supabase } = await authenticateUser(req);
    const { niche, modelId } = (await req.json()) as { niche?: string; modelId?: string };
    const trimmed = niche?.trim();
    if (!trimmed) return errorResponse("niche é obrigatório", 400);

    const apiKey = await resolveOpenAIKey(supabase, organizationId);
    const model = await resolveCarouselModel();
    const knowledgeContext = modelId ? await buildKnowledgeContext(supabase, modelId) : null;
    const ideas = await getTrendingIdeas(apiKey, trimmed, 8, model, knowledgeContext);
    return jsonResponse({ ideas });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    return errorResponse((err as Error).message ?? "Erro", status);
  }
});
