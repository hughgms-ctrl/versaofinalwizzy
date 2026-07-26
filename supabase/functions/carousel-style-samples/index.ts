// =====================================================================
// carousel-style-samples — gera UMA imagem real de exemplo por estilo
// visual do carrossel (cinematic/photorealistic/minimalist/watercolor/
// dark/illustration), usada como preview real no seletor de estilo.
// Recurso GLOBAL (visível a todos, não é por organização), mas o abuso de
// custo já fica limitado pelo skip-if-exists: uma vez geradas, chamadas
// seguintes só leem a URL existente (sem chamar a OpenAI de novo), a menos
// que force=true. Sobe pro bucket público flow-media (já usado por outras
// mídias públicas do produto).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateUser, errorResponse, handleCors, jsonResponse } from "../_shared/middleware.ts";
import { buildImagePrompt, generateImage, resolveOpenAIKey } from "../_shared/carousel.ts";

const SAMPLE_BUCKET = "flow-media";
const SAMPLE_PREFIX = "carousel-style-samples";
const STYLES = ["cinematic", "photorealistic", "minimalist", "watercolor", "dark", "illustration"];

// Rosto em close-up, perto da câmera — mesmo "assunto" em todos os estilos pra dar
// pra comparar de verdade a diferença visual entre eles (luz, textura, traço).
const SAMPLE_SUBJECT =
  "a close-up portrait of a person's face looking directly at the camera, head and shoulders framing, " +
  "natural expression, simple neutral background";

interface Body {
  force?: boolean;
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
    const body = (await req.json().catch(() => ({}))) as Body;
    const apiKey = await resolveOpenAIKey(supabase, organizationId);

    const results = await Promise.all(
      STYLES.map(async (style) => {
        const path = `${SAMPLE_PREFIX}/${style}.png`;

        if (!body.force) {
          const { data: existing } = await service.storage
            .from(SAMPLE_BUCKET)
            .list(SAMPLE_PREFIX, { search: `${style}.png` });
          if (existing?.some((f) => f.name === `${style}.png`)) {
            return [style, service.storage.from(SAMPLE_BUCKET).getPublicUrl(path).data.publicUrl] as const;
          }
        }

        const prompt = buildImagePrompt({
          prompt: SAMPLE_SUBJECT,
          imageStyle: style,
          peopleInImages: "with",
        });
        const bytes = await generateImage(apiKey, prompt);
        const { error } = await service.storage
          .from(SAMPLE_BUCKET)
          .upload(path, bytes, { contentType: "image/png", upsert: true });
        if (error) throw new Error(`Falha no upload (${style}): ${error.message}`);

        return [style, service.storage.from(SAMPLE_BUCKET).getPublicUrl(path).data.publicUrl] as const;
      }),
    );

    return jsonResponse({ samples: Object.fromEntries(results) });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    return errorResponse((err as Error).message ?? "Erro ao gerar amostras", status);
  }
});
