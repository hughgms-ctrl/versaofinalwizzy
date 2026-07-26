// =====================================================================
// carousel-style-samples — gera UMA imagem real de exemplo por estilo
// visual do carrossel (cinematic/photorealistic/minimalist/watercolor/
// dark/illustration), usada como preview real no seletor de estilo.
//
// Pra comparação de verdade, TODOS os estilos usam a MESMA pessoa: gera
// uma base fotorrealista uma única vez e "reestiliza" essa mesma imagem
// (images/edits) pros outros 5 estilos, em vez de 6 gerações
// independentes sem relação entre si (que trocavam de rosto a cada uma).
//
// Recurso GLOBAL (visível a todos, não é por organização), mas o abuso de
// custo já fica limitado pelo skip-if-exists: uma vez geradas, chamadas
// seguintes só leem a URL existente (sem chamar a OpenAI de novo), a menos
// que force=true. Sobe pro bucket público flow-media (já usado por outras
// mídias públicas do produto).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, errorResponse, handleCors, jsonResponse } from "../_shared/middleware.ts";
import { STYLE_HINTS, editImage, generateImage, resolveOpenAIKey } from "../_shared/carousel.ts";

const SAMPLE_BUCKET = "flow-media";
const SAMPLE_PREFIX = "carousel-style-samples";
const BASE_STYLE = "photorealistic";
const OTHER_STYLES = ["cinematic", "minimalist", "watercolor", "dark", "illustration"];

// Rosto em close-up, perto da câmera — mesmo "assunto" em todos os estilos pra dar
// pra comparar de verdade a diferença visual entre eles (luz, textura, traço).
const SAMPLE_SUBJECT =
  "a close-up portrait of a man's face looking directly at the camera, head and shoulders framing, " +
  "natural expression, simple neutral background";

interface Body {
  force?: boolean;
}

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function samplePath(style: string): string {
  return `${SAMPLE_PREFIX}/${style}.png`;
}

async function sampleExists(style: string): Promise<boolean> {
  const { data } = await service.storage
    .from(SAMPLE_BUCKET)
    .list(SAMPLE_PREFIX, { search: `${style}.png` });
  return !!data?.some((f) => f.name === `${style}.png`);
}

function publicUrl(style: string): string {
  return service.storage.from(SAMPLE_BUCKET).getPublicUrl(samplePath(style)).data.publicUrl;
}

async function uploadSample(style: string, bytes: Uint8Array): Promise<void> {
  const { error } = await service.storage
    .from(SAMPLE_BUCKET)
    .upload(samplePath(style), bytes, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Falha no upload (${style}): ${error.message}`);
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    const { organizationId, supabase } = await authenticateUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;
    const apiKey = await resolveOpenAIKey(supabase, organizationId);

    const results: Record<string, string> = {};

    // 1. Base fotorrealista — é o rosto de referência reaproveitado em todos os outros estilos.
    let baseBytes: Uint8Array | null = null;
    const baseAlreadyExists = !body.force && (await sampleExists(BASE_STYLE));
    if (baseAlreadyExists) {
      const { data: blob, error } = await service.storage.from(SAMPLE_BUCKET).download(samplePath(BASE_STYLE));
      if (error || !blob) throw new Error(`Falha ao baixar base existente: ${error?.message ?? "sem dados"}`);
      baseBytes = new Uint8Array(await blob.arrayBuffer());
    } else {
      const basePrompt = [
        SAMPLE_SUBJECT,
        STYLE_HINTS[BASE_STYLE],
        "no text, no letters, no words in the image, professional photography, dramatic lighting, high quality, 1080x1080",
      ].join(", ");
      baseBytes = await generateImage(apiKey, basePrompt);
      await uploadSample(BASE_STYLE, baseBytes);
    }
    results[BASE_STYLE] = publicUrl(BASE_STYLE);

    // 2. Demais estilos: edita a MESMA imagem base — mantém o rosto, muda só o estilo.
    await Promise.all(
      OTHER_STYLES.map(async (style) => {
        if (!body.force && (await sampleExists(style))) {
          results[style] = publicUrl(style);
          return;
        }
        const editPrompt =
          `Restyle this exact photo as ${STYLE_HINTS[style]}. ` +
          "Keep the exact same person, face, pose, framing and composition — only change the artistic rendering/style, never the identity.";
        const bytes = await editImage(apiKey, baseBytes!, editPrompt);
        await uploadSample(style, bytes);
        results[style] = publicUrl(style);
      }),
    );

    return jsonResponse({ samples: results });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    return errorResponse((err as Error).message ?? "Erro ao gerar amostras", status);
  }
});
