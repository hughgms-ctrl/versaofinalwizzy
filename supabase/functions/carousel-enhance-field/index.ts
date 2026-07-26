// =====================================================================
// carousel-enhance-field — "Melhorar com IA" dos campos do modelo.
// Recebe o texto que o usuário digitou em Nicho ou Audiência e devolve
// uma versão mais rica e específica, melhor para a geração dos carrosséis.
// =====================================================================
import { authenticateUser, errorResponse, handleCors, jsonResponse } from "../_shared/middleware.ts";
import { enhanceModelField, resolveCarouselModel, resolveOpenAIKey, type EnhanceField } from "../_shared/carousel.ts";

interface Body {
  field: EnhanceField;
  value: string;
  // contexto opcional para um resultado mais alinhado
  niche?: string;
  objective?: string;
  tone?: string;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    const { organizationId, supabase } = await authenticateUser(req);
    const { field, value, niche, objective, tone } = (await req.json()) as Body;

    if ((field !== "niche" && field !== "audience") || !value?.trim()) {
      return errorResponse("Payload inválido", 400);
    }

    const apiKey = await resolveOpenAIKey(supabase, organizationId);
    const model = await resolveCarouselModel();
    const improved = await enhanceModelField(apiKey, field, value.trim(), {
      niche,
      objective,
      tone,
    }, model);

    return jsonResponse({ value: improved });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    return errorResponse((err as Error).message ?? "Erro", status);
  }
});
