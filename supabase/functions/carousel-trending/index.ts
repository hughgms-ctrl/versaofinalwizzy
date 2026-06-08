// =====================================================================
// carousel-trending — sugestões de tema em alta para um nicho (GPT-4o).
// =====================================================================
import { authenticateUser, errorResponse, handleCors, jsonResponse } from "../_shared/middleware.ts";
import { getTrendingIdeas, resolveOpenAIKey } from "../_shared/carousel.ts";

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    const { organizationId, supabase } = await authenticateUser(req);
    const { niche } = (await req.json()) as { niche?: string };
    const trimmed = niche?.trim();
    if (!trimmed) return errorResponse("niche é obrigatório", 400);

    const apiKey = await resolveOpenAIKey(supabase, organizationId);
    const ideas = await getTrendingIdeas(apiKey, trimmed, 8);
    return jsonResponse({ ideas });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    return errorResponse((err as Error).message ?? "Erro", status);
  }
});
