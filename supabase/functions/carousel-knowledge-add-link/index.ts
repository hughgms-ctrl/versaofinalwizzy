// =====================================================================
// carousel-knowledge-add-link — adiciona um item do tipo "link"/"youtube"
// à base de conhecimento de um Projeto (carousel_models). Extrai o
// conteúdo (mesma lógica do carousel-extract-source) e já salva pronto.
// =====================================================================
import { authenticateUser, errorResponse, handleCors, jsonResponse } from "../_shared/middleware.ts";
import { extractSourceContent } from "../_shared/sourceExtract.ts";

interface Body {
  modelId: string;
  type: "link" | "youtube";
  value: string;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    const { organizationId, supabase } = await authenticateUser(req);
    const body = (await req.json()) as Body;
    const value = body?.value?.trim();
    if (!body?.modelId || !value) return errorResponse("Payload inválido", 400);
    if (body.type !== "link" && body.type !== "youtube") return errorResponse("Tipo inválido", 400);

    // RLS garante que o projeto pertence à organização do usuário.
    const { data: model } = await supabase
      .from("carousel_models")
      .select("id")
      .eq("id", body.modelId)
      .maybeSingle();
    if (!model) return errorResponse("Projeto não encontrado", 404);

    const { title, content } = await extractSourceContent(body.type, value);

    const { data: item, error } = await supabase
      .from("carousel_model_knowledge")
      .insert({
        organization_id: organizationId,
        model_id: body.modelId,
        type: body.type,
        title: title?.trim() || value.slice(0, 80),
        content,
        source_url: value,
        status: "ready",
      })
      .select()
      .single();
    if (error) throw error;

    return jsonResponse(item);
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    return errorResponse((err as Error).message ?? "Erro ao adicionar referência", status);
  }
});
