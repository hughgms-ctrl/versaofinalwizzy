// =====================================================================
// carousel-extract-source — extrai o material de origem para gerar um
// carrossel a partir de um link de artigo/blog ou de um vídeo do YouTube
// (via transcrição/legenda pública). Texto colado direto não passa por
// aqui: o próprio front usa o valor digitado como source_content.
// =====================================================================
import { authenticateUser, errorResponse, handleCors, jsonResponse } from "../_shared/middleware.ts";
import { extractSourceContent } from "../_shared/sourceExtract.ts";

interface Body {
  type: "link" | "youtube";
  value: string;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    await authenticateUser(req);
    const body = (await req.json()) as Body;
    const value = body?.value?.trim();
    if (!value) return errorResponse("Informe um link", 400);

    if (body.type !== "youtube" && body.type !== "link") {
      return errorResponse("Tipo de fonte inválido", 400);
    }
    return jsonResponse(await extractSourceContent(body.type, value));
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    return errorResponse((err as Error).message ?? "Erro ao extrair conteúdo", status);
  }
});
